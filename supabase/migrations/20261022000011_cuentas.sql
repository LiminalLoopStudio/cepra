-- =============================================================================
-- CEPRA — Migración 11: cuentas de plataformas (Steam, PlayStation, Xbox…)
--
-- Registro de las cuentas que se usan en los equipos: correo, usuario/gamertag,
-- en qué equipo está y notas. NO se guardan contraseñas (viven en un gestor
-- de contraseñas aparte).
-- Solo líderes y administradores las ven y editan; solo el administrador
-- desactiva. Cada cambio guarda quién lo hizo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clasificaciones (plataformas). Se pueden agregar más desde la app.
-- -----------------------------------------------------------------------------
create table public.plataformas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique check (length(trim(nombre)) > 0),
  orden       integer not null default 100,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger plataformas_updated_at
  before update on public.plataformas
  for each row execute function public.tg_updated_at();

insert into public.plataformas (nombre, orden) values
  ('Steam', 10),
  ('Epic Games', 20),
  ('PlayStation', 30),
  ('Nintendo', 40),
  ('Oculus VR', 50),
  ('Xbox', 60),
  ('Riot', 70),
  ('Móvil', 80),
  ('Otros', 999)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Cuentas
-- -----------------------------------------------------------------------------
create table public.cuentas (
  id              uuid primary key default gen_random_uuid(),
  plataforma_id   uuid not null references public.plataformas (id),
  correo          text not null check (length(trim(correo)) > 0),
  usuario         text,                       -- gamertag, ID de usuario, nickname
  equipo_id       uuid references public.equipos (id) on delete set null,  -- consola/PC donde está
  notas           text,
  activo          boolean not null default true,
  creado_por      uuid references public.usuarios (id) default auth.uid(),
  actualizado_por uuid references public.usuarios (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.cuentas is
  'Cuentas de plataformas usadas en los equipos. Sin contraseñas.';

-- El mismo correo no se registra dos veces en la misma plataforma.
create unique index cuentas_correo_por_plataforma
  on public.cuentas (plataforma_id, lower(correo));

create index cuentas_equipo_idx on public.cuentas (equipo_id) where equipo_id is not null;

create trigger cuentas_updated_at
  before update on public.cuentas
  for each row execute function public.tg_updated_at();

-- Quién hizo el último cambio (no se puede falsear desde la app).
create function public.tg_cuentas_autor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_por := auth.uid();
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
  else
    new.creado_por := old.creado_por;
  end if;
  return new;
end;
$$;

create trigger cuentas_autor
  before insert or update on public.cuentas
  for each row execute function public.tg_cuentas_autor();

-- -----------------------------------------------------------------------------
-- Seguridad: solo líder y administrador.
-- -----------------------------------------------------------------------------
alter table public.plataformas enable row level security;
alter table public.cuentas enable row level security;

grant select on public.plataformas to authenticated;
grant insert (nombre, orden), update (nombre, orden, activo) on public.plataformas to authenticated;

create policy "plataformas: lectura" on public.plataformas
  for select to authenticated using ((select public.es_lider_o_admin()));
create policy "plataformas: alta" on public.plataformas
  for insert to authenticated with check ((select public.es_lider_o_admin()));
create policy "plataformas: edición" on public.plataformas
  for update to authenticated
  using ((select public.es_lider_o_admin())) with check ((select public.es_lider_o_admin()));

grant select on public.cuentas to authenticated;
grant insert (plataforma_id, correo, usuario, equipo_id, notas),
      update (plataforma_id, correo, usuario, equipo_id, notas, activo)
  on public.cuentas to authenticated;

create policy "cuentas: lectura" on public.cuentas
  for select to authenticated using ((select public.es_lider_o_admin()));
create policy "cuentas: alta" on public.cuentas
  for insert to authenticated with check ((select public.es_lider_o_admin()));
create policy "cuentas: edición" on public.cuentas
  for update to authenticated
  using ((select public.es_lider_o_admin())) with check ((select public.es_lider_o_admin()));

-- Desactivar / reactivar: solo el administrador.
create function public.tg_cuentas_activo_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.activo is distinct from old.activo and not public.es_admin() then
    raise exception 'Solo el administrador puede desactivar o reactivar cuentas'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger cuentas_activo_admin
  before update on public.cuentas
  for each row execute function public.tg_cuentas_activo_admin();
