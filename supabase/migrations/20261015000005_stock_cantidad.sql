-- =============================================================================
-- CEPRA — Migración 5: artículos por cantidad (stock)
--
-- Para tipos del catálogo con serializado = false (cables baratos, consumibles):
-- no hay piezas con QR, solo un total en almacén. El total cambia únicamente
-- con ajustes con motivo (función ajustar_stock), y cada ajuste queda en la
-- bitácora de movimientos.
-- Disponible = total − reservado − prestado. (prestado se calculará con la
-- tabla de préstamos en la Fase 2; por ahora es 0.)
-- =============================================================================

create type public.motivo_ajuste as enum (
  'compra',             -- se compraron más
  'prestamo_recibido',  -- otra empresa nos prestó
  'perdida',            -- se perdieron
  'baja',               -- se dañaron sin reparación
  'devolucion_propietario', -- se regresaron a la empresa dueña
  'correccion'          -- conteo físico distinto a lo registrado
);

create table public.stock_cantidad (
  articulo_id  uuid primary key references public.catalogo_articulos (id) on delete cascade,
  total        integer not null default 0 check (total >= 0),
  reservado    integer not null default 0 check (reservado >= 0),
  updated_at   timestamptz not null default now()
);

comment on table public.stock_cantidad is
  'Existencias de artículos por cantidad. Solo cambia con ajustar_stock().';

create trigger stock_cantidad_updated_at
  before update on public.stock_cantidad
  for each row execute function public.tg_updated_at();

-- Al crear (o cambiar a) un tipo "por cantidad", se crea su fila de stock en 0.
create function public.tg_catalogo_crear_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.serializado then
    insert into public.stock_cantidad (articulo_id) values (new.id)
    on conflict (articulo_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger catalogo_crear_stock
  after insert or update of serializado on public.catalogo_articulos
  for each row execute function public.tg_catalogo_crear_stock();

-- Tipos "por cantidad" que ya existían.
insert into public.stock_cantidad (articulo_id)
select id from public.catalogo_articulos where not serializado
on conflict (articulo_id) do nothing;

-- Si un tipo por cantidad ya tiene existencias, no se puede volver "por pieza".
create function public.tg_catalogo_bloquear_con_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.serializado = false and new.serializado = true
     and exists (
       select 1 from public.stock_cantidad s
        where s.articulo_id = old.id and (s.total > 0 or s.reservado > 0)
     ) then
    raise exception 'El tipo % tiene existencias por cantidad: déjalas en 0 antes de cambiarlo a "por pieza"', old.codigo_tipo
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger catalogo_bloquear_con_stock
  before update of serializado on public.catalogo_articulos
  for each row execute function public.tg_catalogo_bloquear_con_stock();

revoke execute on function public.tg_catalogo_crear_stock() from public, anon, authenticated;
revoke execute on function public.tg_catalogo_bloquear_con_stock() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Vista para la pantalla: stock por tipo con disponible calculado.
-- security_invoker: respeta los permisos de quien consulta.
-- -----------------------------------------------------------------------------
create view public.v_stock_cantidad
with (security_invoker = true) as
select
  c.id            as articulo_id,
  c.codigo_tipo,
  c.nombre,
  c.categoria,
  c.stock_minimo,
  c.activo,
  s.total,
  s.reservado,
  0::integer      as prestado,   -- Fase 2: suma de préstamos abiertos
  (s.total - s.reservado - 0)::integer as disponible,
  s.updated_at
from public.catalogo_articulos c
join public.stock_cantidad s on s.articulo_id = c.id
where not c.serializado;

-- -----------------------------------------------------------------------------
-- Ajuste de stock (solo administrador)
-- p_delta positivo suma, negativo resta. No permite dejar el total por debajo
-- de lo que está prestado o reservado.
-- -----------------------------------------------------------------------------
create function public.ajustar_stock(
  p_articulo uuid,
  p_delta    integer,
  p_motivo   public.motivo_ajuste,
  p_nota     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s          public.stock_cantidad%rowtype;
  v_prestado integer := 0;  -- Fase 2: préstamos abiertos de este artículo
  v_nuevo    integer;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede ajustar existencias'
      using errcode = 'insufficient_privilege';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'La cantidad del ajuste no puede ser 0' using errcode = 'check_violation';
  end if;

  -- Bloquea la fila: dos ajustes al mismo tiempo no se pisan.
  select * into s from public.stock_cantidad where articulo_id = p_articulo for update;
  if not found then
    raise exception 'Ese artículo no se controla por cantidad' using errcode = 'no_data_found';
  end if;

  v_nuevo := s.total + p_delta;
  if v_nuevo < v_prestado + s.reservado then
    raise exception 'No alcanza: quedarían % y hay % prestados y % reservados',
      v_nuevo, v_prestado, s.reservado using errcode = 'check_violation';
  end if;

  update public.stock_cantidad set total = v_nuevo where articulo_id = p_articulo;

  insert into public.movimientos (tipo, articulo_id, cantidad, nota, datos)
  values ('ajuste_stock', p_articulo, p_delta, nullif(trim(p_nota), ''),
          jsonb_build_object('motivo', p_motivo, 'total_anterior', s.total, 'total_nuevo', v_nuevo));

  return jsonb_build_object(
    'total', v_nuevo,
    'disponible', v_nuevo - v_prestado - s.reservado
  );
end;
$$;

revoke execute on function public.ajustar_stock(uuid, integer, public.motivo_ajuste, text) from public, anon;
grant execute on function public.ajustar_stock(uuid, integer, public.motivo_ajuste, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Seguridad: todos con sesión consultan; nadie escribe directo (solo la función).
-- -----------------------------------------------------------------------------
alter table public.stock_cantidad enable row level security;

grant select on public.stock_cantidad to authenticated;
grant select on public.v_stock_cantidad to authenticated;

create policy "stock: lectura" on public.stock_cantidad
  for select to authenticated using (true);
