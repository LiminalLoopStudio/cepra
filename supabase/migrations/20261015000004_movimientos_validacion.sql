-- =============================================================================
-- CEPRA — Migración 4: bitácora de movimientos y validación equipo ↔ caja
--
-- movimientos: registro de TODO lo que le pasa a un equipo (alta, edición,
-- validación, y después entrega, devolución, transferencia...). Solo se
-- agregan filas: nadie puede editarlas ni borrarlas. Es la base del historial
-- y la auditoría.
-- =============================================================================

-- Administrador o almacenista
create function public.es_almacen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('administrador', 'almacenista'), false);
$$;

revoke execute on function public.es_almacen() from public, anon;
grant execute on function public.es_almacen() to authenticated;

-- -----------------------------------------------------------------------------
-- Bitácora
-- -----------------------------------------------------------------------------
create type public.tipo_movimiento as enum (
  'alta', 'edicion', 'validacion', 'entrega', 'devolucion', 'transferencia',
  'reporte_falla', 'reparacion', 'ajuste_stock', 'baja', 'devolucion_propietario'
);

create table public.movimientos (
  id                  bigint generated always as identity primary key,
  tipo                public.tipo_movimiento not null,
  equipo_id           uuid references public.equipos (id),
  articulo_id         uuid references public.catalogo_articulos (id),
  cantidad            integer,
  origen_usuario_id   uuid references public.usuarios (id),
  destino_usuario_id  uuid references public.usuarios (id),
  realizado_por       uuid references public.usuarios (id) default auth.uid(),
  pin_validado        boolean not null default false,
  nota                text,
  datos               jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  check (equipo_id is not null or articulo_id is not null)
);

comment on table public.movimientos is
  'Bitácora inmutable: solo inserciones. Historial y auditoría de equipos y stock.';

create index movimientos_equipo_idx on public.movimientos (equipo_id, created_at desc);
create index movimientos_articulo_idx on public.movimientos (articulo_id, created_at desc);
create index movimientos_fecha_idx on public.movimientos (created_at desc);

-- Inmutable: cualquier UPDATE, DELETE o TRUNCATE falla (incluso para el dueño).
create function public.tg_movimientos_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La bitácora de movimientos es de solo inserción'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger movimientos_sin_update
  before update or delete on public.movimientos
  for each row execute function public.tg_movimientos_inmutables();

create trigger movimientos_sin_truncate
  before truncate on public.movimientos
  for each statement execute function public.tg_movimientos_inmutables();

-- -----------------------------------------------------------------------------
-- Alta y edición de equipos quedan registradas automáticamente.
-- Los cambios de ESTADO los registran las funciones (RPC) que los hacen.
-- -----------------------------------------------------------------------------
create function public.tg_equipos_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cambios jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.movimientos (tipo, equipo_id, articulo_id, cantidad, datos)
    values ('alta', new.id, new.articulo_id, 1, jsonb_build_object('etiqueta', new.etiqueta));
    return new;
  end if;

  -- Edición: guarda "antes → después" de cada campo descriptivo que cambió.
  select jsonb_object_agg(n.key, jsonb_build_object('antes', o.value, 'despues', n.value))
    into v_cambios
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
   where n.value is distinct from o.value
     and n.key not in (
       'updated_at', 'estado_operativo', 'responsable_id', 'etiquetas_validadas_at'
     );

  if v_cambios is not null then
    insert into public.movimientos (tipo, equipo_id, articulo_id, datos)
    values ('edicion', new.id, new.articulo_id, v_cambios);
  end if;
  return new;
end;
$$;

create trigger equipos_bitacora
  after insert or update on public.equipos
  for each row execute function public.tg_equipos_bitacora();

revoke execute on function public.tg_equipos_bitacora() from public, anon, authenticated;

-- Equipos que ya existían antes de esta migración: registrar su alta.
insert into public.movimientos (tipo, equipo_id, articulo_id, cantidad, realizado_por, datos, created_at)
select 'alta', e.id, e.articulo_id, 1, null,
       jsonb_build_object('etiqueta', e.etiqueta, 'registro_retroactivo', true),
       e.created_at
  from public.equipos e;

-- -----------------------------------------------------------------------------
-- Validación de etiquetas equipo ↔ caja
--
-- Recibe los dos códigos escaneados en cualquier orden. Si la caja corresponde
-- al equipo y está "por_validar", lo pasa a "disponible" y lo registra.
-- Responde: { nivel: "ok" | "advertencia" | "error", mensaje, etiqueta? }
-- La pantalla pinta verde / amarillo / rojo según "nivel".
-- -----------------------------------------------------------------------------
create function public.validar_etiquetas(p_codigo_a text, p_codigo_b text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a text := upper(trim(p_codigo_a));
  b text := upper(trim(p_codigo_b));
  v_equipo_cod text;
  v_caja_cod   text;
  e public.equipos%rowtype;
begin
  if not public.es_almacen() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  -- ¿Cuál es la caja? La que termina en -C.
  if a like '%-C' and b not like '%-C' then
    v_caja_cod := a; v_equipo_cod := b;
  elsif b like '%-C' and a not like '%-C' then
    v_caja_cod := b; v_equipo_cod := a;
  else
    return jsonb_build_object('nivel', 'error',
      'mensaje', 'Escanea una etiqueta de equipo y una de caja');
  end if;

  -- Bloquea la fila para que dos tablets no validen la misma pieza a la vez.
  select * into e from public.equipos where etiqueta = v_equipo_cod for update;
  if not found then
    return jsonb_build_object('nivel', 'error',
      'mensaje', 'Etiqueta no reconocida: ' || v_equipo_cod);
  end if;

  if e.etiqueta_caja <> v_caja_cod then
    return jsonb_build_object('nivel', 'error',
      'mensaje', 'La caja no corresponde. Esperada: ' || e.etiqueta_caja || ' · Escaneada: ' || v_caja_cod,
      'etiqueta', e.etiqueta);
  end if;

  if e.estado_operativo <> 'por_validar' then
    return jsonb_build_object('nivel', 'advertencia',
      'mensaje', e.etiqueta || ': coinciden, pero ya estaba validado',
      'etiqueta', e.etiqueta);
  end if;

  update public.equipos
     set estado_operativo = 'disponible', etiquetas_validadas_at = now()
   where id = e.id;

  insert into public.movimientos (tipo, equipo_id, articulo_id, cantidad, nota)
  values ('validacion', e.id, e.articulo_id, 1, 'Equipo y caja coinciden');

  return jsonb_build_object('nivel', 'ok',
    'mensaje', e.etiqueta || ' validado: ya está disponible',
    'etiqueta', e.etiqueta);
end;
$$;

revoke execute on function public.validar_etiquetas(text, text) from public, anon;
grant execute on function public.validar_etiquetas(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Seguridad de la bitácora
-- Nadie inserta directo desde la app: solo los triggers y funciones del servidor.
-- Ven: administrador/almacenista todo; cada persona lo que la involucra.
-- -----------------------------------------------------------------------------
alter table public.movimientos enable row level security;

grant select on public.movimientos to authenticated;

create policy "movimientos: lectura" on public.movimientos
  for select to authenticated
  using (
    (select public.es_almacen())
    or origen_usuario_id = (select auth.uid())
    or destino_usuario_id = (select auth.uid())
  );
