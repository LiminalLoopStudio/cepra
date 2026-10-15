-- =============================================================================
-- CEPRA — Migración 3: propietarios y equipos (piezas individuales con QR)
--
-- equipos = cada pieza física de un tipo "por pieza" del catálogo.
-- La etiqueta GP-<TIPO>-NNNN la genera la base de datos: nadie la escribe.
-- La etiqueta de la caja es la misma con "-C" al final.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.tipo_propietario as enum ('propio', 'patrocinador', 'prestamista');

create type public.tipo_propiedad as enum ('propio', 'patrocinado', 'prestamo');

create type public.estado_fisico as enum (
  'nuevo', 'bueno', 'regular', 'con_falla', 'en_reparacion', 'baja'
);

create type public.estado_operativo as enum (
  'por_validar',          -- recién dado de alta, etiquetas sin validar
  'disponible',           -- en almacén, listo para prestar
  'reservado',            -- apartado para una solicitud aprobada
  'prestado',             -- a nombre de una persona
  'con_falla',            -- reportado con falla
  'en_reparacion',        -- enviado a reparar
  'devuelto_propietario', -- patrocinado/préstamo regresado a su empresa (final)
  'baja'                  -- sin reparación o perdido (final)
);

-- -----------------------------------------------------------------------------
-- Propietarios: empresas dueñas del equipo (incluye a Gaming Partners)
-- -----------------------------------------------------------------------------
create table public.propietarios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique check (length(trim(nombre)) > 0),
  tipo        public.tipo_propietario not null,
  contacto    text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger propietarios_updated_at
  before update on public.propietarios
  for each row execute function public.tg_updated_at();

-- -----------------------------------------------------------------------------
-- Equipos
-- -----------------------------------------------------------------------------
create table public.equipos (
  id                     uuid primary key default gen_random_uuid(),
  etiqueta               text not null unique,                 -- GP-XBS-0001 (la pone el trigger)
  etiqueta_caja          text generated always as (etiqueta || '-C') stored unique,
  articulo_id            uuid not null references public.catalogo_articulos (id),
  marca                  text,
  modelo                 text,
  serie                  text,
  puertos                text[] not null default '{}',
  estado_fisico          public.estado_fisico not null default 'bueno',
  estado_operativo       public.estado_operativo not null default 'por_validar',
  propiedad              public.tipo_propiedad not null default 'propio',
  propietario_id         uuid references public.propietarios (id),
  fecha_devolucion       date,          -- cuándo hay que regresarlo a su dueño (patrocinado/préstamo)
  notas                  text,
  responsable_id         uuid references public.usuarios (id),  -- quién lo tiene (cuando esté prestado)
  etiquetas_validadas_at timestamptz,   -- cuándo se confirmó que equipo y caja coinciden
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint equipos_propietario_requerido
    check (propiedad = 'propio' or propietario_id is not null),
  constraint equipos_prestado_con_responsable
    check (estado_operativo <> 'prestado' or responsable_id is not null)
);

comment on table public.equipos is
  'Piezas individuales con QR propio. La etiqueta la genera la base de datos.';

-- No puede haber dos piezas del mismo tipo con el mismo número de serie.
create unique index equipos_serie_por_tipo
  on public.equipos (articulo_id, lower(serie))
  where serie is not null and serie <> '';

create index equipos_articulo_estado_idx on public.equipos (articulo_id, estado_operativo);
create index equipos_responsable_idx on public.equipos (responsable_id) where responsable_id is not null;

create trigger equipos_updated_at
  before update on public.equipos
  for each row execute function public.tg_updated_at();

-- -----------------------------------------------------------------------------
-- Etiqueta automática
-- Toma el siguiente número del tipo con bloqueo de fila: aunque dos personas
-- den de alta al mismo tiempo, nunca se repite un número.
-- -----------------------------------------------------------------------------
create function public.tg_equipos_asignar_etiqueta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo      text;
  v_serializado boolean;
  v_activo      boolean;
  v_numero      integer;
begin
  update public.catalogo_articulos
     set siguiente_numero = siguiente_numero + 1
   where id = new.articulo_id
  returning codigo_tipo, serializado, activo, siguiente_numero - 1
       into v_codigo, v_serializado, v_activo, v_numero;

  if v_codigo is null then
    raise exception 'El tipo de artículo no existe' using errcode = 'foreign_key_violation';
  end if;
  if not v_serializado then
    raise exception 'El tipo % se controla por cantidad, no por pieza', v_codigo
      using errcode = 'check_violation';
  end if;
  if not v_activo then
    raise exception 'El tipo % está inactivo', v_codigo using errcode = 'check_violation';
  end if;
  if v_numero > 9999 then
    raise exception 'Se agotaron los números para el tipo %', v_codigo
      using errcode = 'check_violation';
  end if;

  new.etiqueta := 'GP-' || v_codigo || '-' || lpad(v_numero::text, 4, '0');
  -- Toda pieza nueva arranca sin validar y sin responsable.
  new.estado_operativo := 'por_validar';
  new.responsable_id := null;
  new.etiquetas_validadas_at := null;
  return new;
end;
$$;

create trigger equipos_asignar_etiqueta
  before insert on public.equipos
  for each row execute function public.tg_equipos_asignar_etiqueta();

-- La etiqueta y el tipo de una pieza no cambian nunca después del alta.
create function public.tg_equipos_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.etiqueta is distinct from old.etiqueta then
    raise exception 'La etiqueta no se puede modificar' using errcode = 'check_violation';
  end if;
  if new.articulo_id is distinct from old.articulo_id then
    raise exception 'El tipo de una pieza no se puede modificar' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger equipos_inmutables
  before update on public.equipos
  for each row execute function public.tg_equipos_inmutables();

-- -----------------------------------------------------------------------------
-- Catálogo: si un tipo ya tiene piezas, su código y su forma de control
-- quedan fijos (si no, las etiquetas impresas dejarían de coincidir).
-- -----------------------------------------------------------------------------
create function public.tg_catalogo_bloquear_con_piezas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.codigo_tipo is distinct from old.codigo_tipo
      or new.serializado is distinct from old.serializado)
     and exists (select 1 from public.equipos e where e.articulo_id = old.id) then
    raise exception 'El tipo % ya tiene piezas registradas: no se puede cambiar su código ni su forma de control', old.codigo_tipo
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger catalogo_bloquear_con_piezas
  before update on public.catalogo_articulos
  for each row execute function public.tg_catalogo_bloquear_con_piezas();

revoke execute on function public.tg_equipos_asignar_etiqueta() from public, anon, authenticated;
revoke execute on function public.tg_catalogo_bloquear_con_piezas() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Seguridad
-- Todos con sesión pueden consultar. Solo el administrador da de alta y edita
-- los datos descriptivos. Las columnas de ESTADO (estado_operativo,
-- responsable_id, etiquetas_validadas_at) no se pueden tocar desde la app:
-- las cambiarán funciones del servidor (validación, entrega, devolución).
-- -----------------------------------------------------------------------------
alter table public.propietarios enable row level security;
alter table public.equipos enable row level security;

grant select on public.propietarios to authenticated;
grant insert (nombre, tipo, contacto), update (nombre, tipo, contacto, activo)
  on public.propietarios to authenticated;

create policy "propietarios: lectura" on public.propietarios
  for select to authenticated using (true);
create policy "propietarios: alta por administrador" on public.propietarios
  for insert to authenticated with check ((select public.es_admin()));
create policy "propietarios: edición por administrador" on public.propietarios
  for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

grant select on public.equipos to authenticated;
grant insert (
  articulo_id, marca, modelo, serie, puertos, estado_fisico,
  propiedad, propietario_id, fecha_devolucion, notas
) on public.equipos to authenticated;
grant update (
  marca, modelo, serie, puertos, propiedad, propietario_id, fecha_devolucion, notas
) on public.equipos to authenticated;

create policy "equipos: lectura" on public.equipos
  for select to authenticated using (true);
create policy "equipos: alta por administrador" on public.equipos
  for insert to authenticated with check ((select public.es_admin()));
create policy "equipos: edición por administrador" on public.equipos
  for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- -----------------------------------------------------------------------------
-- Dato inicial: Gaming Partners como propietario propio
-- -----------------------------------------------------------------------------
insert into public.propietarios (nombre, tipo) values ('Gaming Partners', 'propio')
on conflict (nombre) do nothing;
