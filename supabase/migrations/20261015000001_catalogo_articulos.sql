-- =============================================================================
-- CEPRA — Migración 1: catálogo de tipos de artículo
--
-- Cada fila es un TIPO de artículo (no una pieza): "Xbox Series X",
-- "Monitor 27\"", "Cable HDMI 2m"... Las piezas individuales (con su QR)
-- vendrán en otra tabla que apunta a esta.
-- =============================================================================

-- Función reutilizable: actualiza la columna updated_at en cada UPDATE.
create or replace function public.tg_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.catalogo_articulos (
  id               uuid primary key default gen_random_uuid(),

  -- Código corto que va en la etiqueta: GP-<codigo_tipo>-0001 (ej. XBX, MON, H21)
  codigo_tipo      text not null unique
                   check (codigo_tipo ~ '^[A-Z0-9]{2,4}$'),

  nombre           text not null check (length(trim(nombre)) > 0),
  categoria        text not null,             -- Consola, Pantalla, Cable, Control...

  -- true  = cada pieza lleva QR propio (consolas, pantallas, cables caros)
  -- false = se controla por cantidad (cables baratos, consumibles)
  serializado      boolean not null,

  puertos_default  text[] not null default '{}',
  stock_minimo     integer not null default 0 check (stock_minimo >= 0),

  -- Siguiente número para la etiqueta GP-XXX-NNNN (lo usará el alta de equipos)
  siguiente_numero integer not null default 1 check (siguiente_numero between 1 and 10000),

  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.catalogo_articulos is
  'Tipos de artículo del inventario (no piezas individuales).';

create trigger catalogo_updated_at
  before update on public.catalogo_articulos
  for each row execute function public.tg_updated_at();

-- -----------------------------------------------------------------------------
-- Seguridad
-- El proyecto NO expone tablas nuevas automáticamente: hay que dar permiso
-- explícito. Por ahora solo usuarios con sesión pueden LEER el catálogo.
-- La escritura (solo administrador) se agrega cuando existan los roles.
-- -----------------------------------------------------------------------------
alter table public.catalogo_articulos enable row level security;

grant select on public.catalogo_articulos to authenticated;

create policy "catalogo: lectura para usuarios con sesión"
  on public.catalogo_articulos
  for select
  to authenticated
  using (true);
