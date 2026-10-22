-- =============================================================================
-- CEPRA — Migración 10: eventos y zonas
--
-- Un EVENTO (GamingFest Liverpool, Gamergy…) se divide en ZONAS (Zona Xbox,
-- Escenario, Freeplay…). Cada zona tiene un líder y su staff asignado.
-- Solo un evento puede estar ACTIVO a la vez: es al que se presta el equipo.
-- =============================================================================

create type public.estado_evento as enum ('planeado', 'activo', 'cerrado');

-- -----------------------------------------------------------------------------
-- Eventos
-- -----------------------------------------------------------------------------
create table public.eventos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(trim(nombre)) > 0),
  lugar         text,
  fecha_inicio  date not null,
  fecha_fin     date not null,
  estado        public.estado_evento not null default 'planeado',
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint eventos_fechas check (fecha_fin >= fecha_inicio)
);

-- Solo un evento activo a la vez.
create unique index eventos_un_solo_activo on public.eventos ((true)) where estado = 'activo';

create trigger eventos_updated_at
  before update on public.eventos
  for each row execute function public.tg_updated_at();

-- -----------------------------------------------------------------------------
-- Zonas de un evento
-- -----------------------------------------------------------------------------
create table public.zonas (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references public.eventos (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) > 0),
  lider_id    uuid references public.usuarios (id),
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (evento_id, nombre)
);

create index zonas_lider_idx on public.zonas (lider_id);

create trigger zonas_updated_at
  before update on public.zonas
  for each row execute function public.tg_updated_at();

-- -----------------------------------------------------------------------------
-- Staff asignado a una zona. Una persona está en UNA sola zona por evento.
-- (evento_id lo copia el trigger desde la zona; sirve para esa regla.)
-- -----------------------------------------------------------------------------
create table public.zona_staff (
  zona_id     uuid not null references public.zonas (id) on delete cascade,
  usuario_id  uuid not null references public.usuarios (id),
  evento_id   uuid not null references public.eventos (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (zona_id, usuario_id),
  unique (evento_id, usuario_id)
);

create function public.tg_zona_staff_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select z.evento_id into new.evento_id from public.zonas z where z.id = new.zona_id;
  return new;
end;
$$;

create trigger zona_staff_evento
  before insert on public.zona_staff
  for each row execute function public.tg_zona_staff_evento();

revoke execute on function public.tg_zona_staff_evento() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Roles: ¿es líder o administrador? (Cuentas, Compras y la asignación de staff)
-- -----------------------------------------------------------------------------
create function public.es_lider_o_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('administrador', 'lider'), false);
$$;

revoke execute on function public.es_lider_o_admin() from public, anon;
grant execute on function public.es_lider_o_admin() to authenticated;

-- ¿Es el líder de esta zona? (para que un líder asigne staff solo en la suya)
create function public.es_lider_de_zona(p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.zonas z where z.id = p_zona and z.lider_id = auth.uid());
$$;

revoke execute on function public.es_lider_de_zona(uuid) from public, anon;
grant execute on function public.es_lider_de_zona(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Seguridad
--   Todos con sesión ven eventos, zonas y quién está en cada una.
--   El administrador crea y edita eventos y zonas.
--   El administrador, y el líder EN SU ZONA, asignan y quitan staff.
-- -----------------------------------------------------------------------------
alter table public.eventos enable row level security;
alter table public.zonas enable row level security;
alter table public.zona_staff enable row level security;

grant select on public.eventos, public.zonas, public.zona_staff to authenticated;
grant insert (nombre, lugar, fecha_inicio, fecha_fin, notas),
      update (nombre, lugar, fecha_inicio, fecha_fin, estado, notas)
  on public.eventos to authenticated;
grant insert (evento_id, nombre, lider_id, notas),
      update (nombre, lider_id, notas), delete
  on public.zonas to authenticated;
grant insert (zona_id, usuario_id), delete on public.zona_staff to authenticated;

create policy "eventos: lectura" on public.eventos for select to authenticated using (true);
create policy "eventos: alta por administrador" on public.eventos
  for insert to authenticated with check ((select public.es_admin()));
create policy "eventos: edición por administrador" on public.eventos
  for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "zonas: lectura" on public.zonas for select to authenticated using (true);
create policy "zonas: alta por administrador" on public.zonas
  for insert to authenticated with check ((select public.es_admin()));
create policy "zonas: edición por administrador" on public.zonas
  for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "zonas: borrado por administrador" on public.zonas
  for delete to authenticated using ((select public.es_admin()));

create policy "zona_staff: lectura" on public.zona_staff for select to authenticated using (true);
create policy "zona_staff: asignar" on public.zona_staff
  for insert to authenticated
  with check ((select public.es_admin()) or public.es_lider_de_zona(zona_id));
create policy "zona_staff: quitar" on public.zona_staff
  for delete to authenticated
  using ((select public.es_admin()) or public.es_lider_de_zona(zona_id));
