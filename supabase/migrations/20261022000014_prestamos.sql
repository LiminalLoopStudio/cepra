-- =============================================================================
-- CEPRA — Migración 14: préstamos (entrega y devolución)
--
-- ENTREGA (almacén): se escanea la credencial de quien recibe, luego las piezas
-- (y se agregan artículos por cantidad), y la persona FIRMA con su PIN.
-- Todo queda en un préstamo con folio, ligado al evento activo y a la zona de
-- la persona. Las piezas pasan a "prestado" a su nombre.
--
-- DEVOLUCIÓN (almacén): se escanean las piezas (o la credencial, para ver todo
-- lo que tiene la persona). Se marca si regresaron control y cables, o si
-- vienen con falla. Lo que falte queda como FALTANTE en el préstamo.
--
-- Nadie escribe estas tablas directo: solo las funciones registrar_entrega()
-- y registrar_devolucion(). Todo pasa también a la bitácora de movimientos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Préstamos (encabezado de cada entrega)
-- -----------------------------------------------------------------------------
create table public.prestamos (
  id             uuid primary key default gen_random_uuid(),
  folio          bigint generated always as identity unique,
  evento_id      uuid not null references public.eventos (id),
  zona_id        uuid references public.zonas (id) on delete set null,
  receptor_id    uuid not null references public.usuarios (id),
  entregado_por  uuid not null references public.usuarios (id),
  notas          text,
  created_at     timestamptz not null default now()
);

create index prestamos_receptor_idx on public.prestamos (receptor_id);
create index prestamos_evento_idx on public.prestamos (evento_id);
create index prestamos_zona_idx on public.prestamos (zona_id);

-- -----------------------------------------------------------------------------
-- Renglones de cada préstamo: una pieza (equipo_id) o N de un artículo por cantidad.
-- -----------------------------------------------------------------------------
create table public.prestamo_items (
  id                   uuid primary key default gen_random_uuid(),
  prestamo_id          uuid not null references public.prestamos (id) on delete cascade,
  equipo_id            uuid references public.equipos (id),
  articulo_id          uuid not null references public.catalogo_articulos (id),
  cantidad             integer not null default 1 check (cantidad > 0),
  -- Accesorios que salieron con la pieza
  con_control          boolean not null default false,
  con_cables           boolean not null default false,
  -- Devolución
  devuelto_cantidad    integer not null default 0 check (devuelto_cantidad >= 0),
  devuelto_at          timestamptz,              -- pieza: cuándo regresó / cantidad: cuándo regresó todo
  recibido_por         uuid references public.usuarios (id),
  control_devuelto_at  timestamptz,
  cables_devuelto_at   timestamptz,
  con_falla            boolean not null default false,
  nota_devolucion      text,
  check (devuelto_cantidad <= cantidad),
  check (equipo_id is null or cantidad = 1)
);

create index prestamo_items_prestamo_idx on public.prestamo_items (prestamo_id);
create index prestamo_items_equipo_idx on public.prestamo_items (equipo_id) where equipo_id is not null;
-- Préstamos abiertos de artículos por cantidad (para calcular "prestado").
create index prestamo_items_cantidad_abiertos on public.prestamo_items (articulo_id)
  where equipo_id is null and devuelto_at is null;
-- Una pieza no puede estar en dos préstamos abiertos.
create unique index prestamo_items_pieza_abierta on public.prestamo_items (equipo_id)
  where equipo_id is not null and devuelto_at is null;

-- -----------------------------------------------------------------------------
-- Vista con el estado de cada renglón
--   prestado  = aún no regresa (o regresó solo una parte de la cantidad)
--   faltante  = la pieza regresó, pero falta su control o sus cables
--   devuelto  = completo
-- -----------------------------------------------------------------------------
create view public.v_prestamo_items
with (security_invoker = true) as
select
  i.*,
  p.folio,
  p.evento_id,
  p.zona_id,
  p.receptor_id,
  p.created_at as entregado_at,
  (i.cantidad - i.devuelto_cantidad) as pendiente,
  (i.con_control and i.control_devuelto_at is null) as falta_control,
  (i.con_cables and i.cables_devuelto_at is null) as falta_cables,
  case
    when i.devuelto_at is null then 'prestado'
    when (i.con_control and i.control_devuelto_at is null)
      or (i.con_cables and i.cables_devuelto_at is null) then 'faltante'
    else 'devuelto'
  end as estado
from public.prestamo_items i
join public.prestamos p on p.id = i.prestamo_id;

-- -----------------------------------------------------------------------------
-- Stock por cantidad: "prestado" ahora sale de los préstamos abiertos.
-- -----------------------------------------------------------------------------
create function public.stock_prestado(p_articulo uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(i.cantidad - i.devuelto_cantidad), 0)::integer
    from public.prestamo_items i
   where i.articulo_id = p_articulo and i.equipo_id is null and i.devuelto_at is null;
$$;

revoke execute on function public.stock_prestado(uuid) from public, anon;
grant execute on function public.stock_prestado(uuid) to authenticated;

create or replace view public.v_stock_cantidad
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
  public.stock_prestado(c.id) as prestado,
  (s.total - s.reservado - public.stock_prestado(c.id))::integer as disponible,
  s.updated_at
from public.catalogo_articulos c
join public.stock_cantidad s on s.articulo_id = c.id
where not c.serializado;

create or replace function public.ajustar_stock(
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
  v_prestado integer;
  v_nuevo    integer;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede ajustar existencias'
      using errcode = 'insufficient_privilege';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'La cantidad del ajuste no puede ser 0' using errcode = 'check_violation';
  end if;

  select * into s from public.stock_cantidad where articulo_id = p_articulo for update;
  if not found then
    raise exception 'Ese artículo no se controla por cantidad' using errcode = 'no_data_found';
  end if;

  v_prestado := public.stock_prestado(p_articulo);
  v_nuevo := s.total + p_delta;
  if v_nuevo < v_prestado + s.reservado then
    raise exception 'No alcanza: quedarían % y hay % prestados y % reservados',
      v_nuevo, v_prestado, s.reservado using errcode = 'check_violation';
  end if;

  update public.stock_cantidad set total = v_nuevo where articulo_id = p_articulo;

  insert into public.movimientos (tipo, articulo_id, cantidad, nota, datos)
  values ('ajuste_stock', p_articulo, p_delta, nullif(trim(p_nota), ''),
          jsonb_build_object('motivo', p_motivo, 'total_anterior', s.total, 'total_nuevo', v_nuevo));

  return jsonb_build_object('total', v_nuevo, 'disponible', v_nuevo - v_prestado - s.reservado);
end;
$$;

-- -----------------------------------------------------------------------------
-- ENTREGA
-- p_piezas      = [{"etiqueta":"GP-CN01-0001","control":true,"cables":true}, …]
-- p_cantidades  = [{"articulo_id":"…","cantidad":3}, …]
-- Responde {ok, mensaje, folio?, prestamo_id?}. Un PIN incorrecto NO lanza
-- error (así el contador de intentos se guarda).
-- -----------------------------------------------------------------------------
create function public.registrar_entrega(
  p_receptor    uuid,
  p_pin         text,
  p_piezas      jsonb default '[]',
  p_cantidades  jsonb default '[]',
  p_notas       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento    uuid;
  v_zona      uuid;
  v_receptor  public.usuarios%rowtype;
  v_pieza     jsonb;
  v_cant      jsonb;
  e           public.equipos%rowtype;
  v_ids       uuid[] := '{}';
  v_etq       text;
  v_disp      integer;
  v_pin       text;
  v_prestamo  uuid;
  v_folio     bigint;
  v_n         integer := 0;
  v_quien     text;
begin
  if not public.es_almacen() then
    raise exception 'Solo almacén y administración entregan equipo' using errcode = 'insufficient_privilege';
  end if;

  select id into v_evento from public.eventos where estado = 'activo';
  if v_evento is null then
    return jsonb_build_object('ok', false, 'mensaje', 'No hay un evento activo. Activa el evento antes de entregar.');
  end if;

  select * into v_receptor from public.usuarios where id = p_receptor;
  if not found or not v_receptor.activo then
    return jsonb_build_object('ok', false, 'mensaje', 'La persona que recibe no existe o está desactivada.');
  end if;

  if coalesce(jsonb_array_length(p_piezas), 0) + coalesce(jsonb_array_length(p_cantidades), 0) = 0 then
    return jsonb_build_object('ok', false, 'mensaje', 'No hay nada que entregar: escanea al menos una pieza.');
  end if;

  -- 1) Revisar piezas (bloqueándolas para que nadie más las entregue a la vez).
  for v_pieza in select * from jsonb_array_elements(coalesce(p_piezas, '[]')) loop
    v_etq := upper(trim(v_pieza ->> 'etiqueta'));
    select * into e from public.equipos where etiqueta = v_etq for update;
    if not found then
      return jsonb_build_object('ok', false, 'mensaje', 'Pieza no reconocida: ' || v_etq);
    end if;
    if e.id = any (v_ids) then
      return jsonb_build_object('ok', false, 'mensaje', v_etq || ' está dos veces en la lista.');
    end if;
    if e.estado_operativo <> 'disponible' then
      if e.estado_operativo = 'prestado' then
        select nombre into v_quien from public.usuarios where id = e.responsable_id;
        return jsonb_build_object('ok', false, 'mensaje', v_etq || ' ya está prestado a ' || coalesce(v_quien, 'otra persona') || '. Primero regístralo como devuelto.');
      end if;
      return jsonb_build_object('ok', false, 'mensaje',
        v_etq || ' no está disponible (estado: ' || replace(e.estado_operativo::text, '_', ' ') || ').');
    end if;
    v_ids := v_ids || e.id;
  end loop;

  -- 2) Revisar cantidades (bloqueando su fila de stock).
  for v_cant in
    select jsonb_build_object('articulo_id', x ->> 'articulo_id', 'cantidad', sum((x ->> 'cantidad')::integer))
      from jsonb_array_elements(coalesce(p_cantidades, '[]')) x
     group by x ->> 'articulo_id'
  loop
    if (v_cant ->> 'cantidad')::integer <= 0 then
      return jsonb_build_object('ok', false, 'mensaje', 'Las cantidades deben ser mayores a 0.');
    end if;
    perform 1 from public.stock_cantidad where articulo_id = (v_cant ->> 'articulo_id')::uuid for update;
    if not found then
      return jsonb_build_object('ok', false, 'mensaje', 'Uno de los artículos no se controla por cantidad.');
    end if;
    select s.total - s.reservado - public.stock_prestado(s.articulo_id) into v_disp
      from public.stock_cantidad s where s.articulo_id = (v_cant ->> 'articulo_id')::uuid;
    if (v_cant ->> 'cantidad')::integer > v_disp then
      return jsonb_build_object('ok', false, 'mensaje',
        'No alcanza ' || (select nombre from public.catalogo_articulos where id = (v_cant ->> 'articulo_id')::uuid)
        || ': piden ' || (v_cant ->> 'cantidad') || ' y hay ' || v_disp || ' disponibles.');
    end if;
  end loop;

  -- 3) Firma con PIN.
  v_pin := public.verificar_pin(p_receptor, p_pin);
  if v_pin = 'sin_pin' then
    return jsonb_build_object('ok', false, 'mensaje', v_receptor.nombre || ' aún no tiene PIN. Debe crearlo en "Mi credencial" antes de recibir equipo.');
  elsif v_pin = 'bloqueado' then
    return jsonb_build_object('ok', false, 'mensaje', 'PIN bloqueado por intentos fallidos (15 minutos). El administrador puede restablecerlo.');
  elsif v_pin <> 'ok' then
    return jsonb_build_object('ok', false, 'mensaje', 'PIN incorrecto.', 'pin', 'incorrecto');
  end if;

  -- 4) Registrar.
  select z.id into v_zona
    from public.zonas z
   where z.evento_id = v_evento
     and (z.lider_id = p_receptor
          or exists (select 1 from public.zona_staff s where s.zona_id = z.id and s.usuario_id = p_receptor))
   limit 1;

  insert into public.prestamos (evento_id, zona_id, receptor_id, entregado_por, notas)
  values (v_evento, v_zona, p_receptor, auth.uid(), nullif(trim(p_notas), ''))
  returning id, folio into v_prestamo, v_folio;

  for v_pieza in select * from jsonb_array_elements(coalesce(p_piezas, '[]')) loop
    select * into e from public.equipos where etiqueta = upper(trim(v_pieza ->> 'etiqueta'));
    insert into public.prestamo_items (prestamo_id, equipo_id, articulo_id, cantidad, con_control, con_cables)
    values (v_prestamo, e.id, e.articulo_id, 1,
            e.etiqueta_control is not null and coalesce((v_pieza ->> 'control')::boolean, true),
            e.etiqueta_cables is not null and coalesce((v_pieza ->> 'cables')::boolean, true));
    update public.equipos set estado_operativo = 'prestado', responsable_id = p_receptor where id = e.id;
    insert into public.movimientos (tipo, equipo_id, articulo_id, cantidad, destino_usuario_id, pin_validado, datos)
    values ('entrega', e.id, e.articulo_id, 1, p_receptor, true,
            jsonb_build_object('folio', v_folio,
              'control', e.etiqueta_control is not null and coalesce((v_pieza ->> 'control')::boolean, true),
              'cables', e.etiqueta_cables is not null and coalesce((v_pieza ->> 'cables')::boolean, true)));
    v_n := v_n + 1;
  end loop;

  for v_cant in
    select jsonb_build_object('articulo_id', x ->> 'articulo_id', 'cantidad', sum((x ->> 'cantidad')::integer))
      from jsonb_array_elements(coalesce(p_cantidades, '[]')) x
     group by x ->> 'articulo_id'
  loop
    insert into public.prestamo_items (prestamo_id, articulo_id, cantidad)
    values (v_prestamo, (v_cant ->> 'articulo_id')::uuid, (v_cant ->> 'cantidad')::integer);
    insert into public.movimientos (tipo, articulo_id, cantidad, destino_usuario_id, pin_validado, datos)
    values ('entrega', (v_cant ->> 'articulo_id')::uuid, (v_cant ->> 'cantidad')::integer, p_receptor, true,
            jsonb_build_object('folio', v_folio));
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'folio', v_folio, 'prestamo_id', v_prestamo,
    'mensaje', 'Entrega ' || v_folio || ' firmada por ' || v_receptor.nombre || ' (' || v_n || ' renglones).');
end;
$$;

-- -----------------------------------------------------------------------------
-- Buscar qué devolver al escanear una etiqueta (equipo, -CTRL o -CBL).
-- -----------------------------------------------------------------------------
create function public.buscar_para_devolucion(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cod  text := upper(trim(p_codigo));
  v_base text := v_cod;
  v_acc  text := null;
  r      record;
begin
  if not public.es_almacen() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  if v_cod like '%-CTRL' then
    v_base := left(v_cod, length(v_cod) - 5); v_acc := 'control';
  elsif v_cod like '%-CBL' then
    v_base := left(v_cod, length(v_cod) - 4); v_acc := 'cables';
  elsif v_cod like '%-C' then
    v_base := left(v_cod, length(v_cod) - 2);
  end if;

  -- El renglón más reciente de esa pieza que siga prestado o con faltantes.
  select i.id, i.estado, i.con_control, i.con_cables, i.falta_control, i.falta_cables, i.folio,
         e.etiqueta, a.nombre as articulo, u.nombre as receptor
    into r
    from public.v_prestamo_items i
    join public.equipos e on e.id = i.equipo_id
    join public.catalogo_articulos a on a.id = i.articulo_id
    join public.usuarios u on u.id = i.receptor_id
   where e.etiqueta = v_base and i.estado <> 'devuelto'
   order by i.entregado_at desc
   limit 1;

  if not found then
    if exists (select 1 from public.equipos where etiqueta = v_base) then
      return jsonb_build_object('encontrado', false, 'mensaje', v_base || ' no está prestado.');
    end if;
    return jsonb_build_object('encontrado', false, 'mensaje', 'Etiqueta no reconocida: ' || v_cod);
  end if;

  return jsonb_build_object(
    'encontrado', true, 'item_id', r.id, 'estado', r.estado, 'etiqueta', r.etiqueta,
    'articulo', r.articulo, 'receptor', r.receptor, 'folio', r.folio,
    'con_control', r.con_control, 'con_cables', r.con_cables,
    'falta_control', r.falta_control, 'falta_cables', r.falta_cables,
    'accesorio', v_acc
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- DEVOLUCIÓN
-- p_items = [{"item_id":"…","control":true,"cables":true,"falla":false,"cantidad":2}, …]
--   Pieza prestada  → regresa; control/cables dicen si regresaron sus accesorios.
--   Pieza faltante  → solo registra los accesorios que llegan ahora.
--   Por cantidad    → "cantidad" = cuántos regresan.
-- -----------------------------------------------------------------------------
create function public.registrar_devolucion(p_items jsonb, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x        jsonb;
  i        public.prestamo_items%rowtype;
  v_rec    uuid;
  v_falla  boolean;
  v_ctrl   boolean;
  v_cbl    boolean;
  v_cant   integer;
  v_piezas integer := 0;
  v_unid   integer := 0;
  v_falt   integer := 0;
  v_acc    integer := 0;
begin
  if not public.es_almacen() then
    raise exception 'Solo almacén y administración reciben equipo' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    return jsonb_build_object('ok', false, 'mensaje', 'No hay nada que recibir.');
  end if;

  for x in select * from jsonb_array_elements(p_items) loop
    select * into i from public.prestamo_items where id = (x ->> 'item_id')::uuid for update;
    if not found then
      raise exception 'Renglón de préstamo no encontrado' using errcode = 'no_data_found';
    end if;
    select receptor_id into v_rec from public.prestamos where id = i.prestamo_id;
    v_ctrl := coalesce((x ->> 'control')::boolean, false);
    v_cbl := coalesce((x ->> 'cables')::boolean, false);
    v_falla := coalesce((x ->> 'falla')::boolean, false);

    if i.equipo_id is not null then
      if i.devuelto_at is null then
        -- Regresa la pieza.
        update public.prestamo_items
           set devuelto_at = now(), devuelto_cantidad = 1, recibido_por = auth.uid(),
               control_devuelto_at = case when con_control and v_ctrl then now() end,
               cables_devuelto_at = case when con_cables and v_cbl then now() end,
               con_falla = v_falla,
               nota_devolucion = nullif(trim(p_notas), '')
         where id = i.id;
        update public.equipos
           set estado_operativo = case when v_falla then 'con_falla'::public.estado_operativo else 'disponible' end,
               responsable_id = null
         where id = i.equipo_id;
        insert into public.movimientos (tipo, equipo_id, articulo_id, cantidad, origen_usuario_id, nota, datos)
        values ('devolucion', i.equipo_id, i.articulo_id, 1, v_rec, nullif(trim(p_notas), ''),
                jsonb_build_object('control', case when i.con_control then v_ctrl end,
                                   'cables', case when i.con_cables then v_cbl end,
                                   'falla', v_falla));
        v_piezas := v_piezas + 1;
        if (i.con_control and not v_ctrl) or (i.con_cables and not v_cbl) then
          v_falt := v_falt + 1;
        end if;
      else
        -- Ya había regresado: llegan accesorios que faltaban.
        update public.prestamo_items
           set control_devuelto_at = case when con_control and control_devuelto_at is null and v_ctrl then now() else control_devuelto_at end,
               cables_devuelto_at = case when con_cables and cables_devuelto_at is null and v_cbl then now() else cables_devuelto_at end
         where id = i.id;
        insert into public.movimientos (tipo, equipo_id, articulo_id, cantidad, origen_usuario_id, nota, datos)
        values ('devolucion', i.equipo_id, i.articulo_id, 0, v_rec, nullif(trim(p_notas), ''),
                jsonb_build_object('accesorios', true, 'control', case when v_ctrl then true end,
                                   'cables', case when v_cbl then true end));
        v_acc := v_acc + 1;
      end if;
    else
      v_cant := coalesce((x ->> 'cantidad')::integer, 0);
      if v_cant <= 0 then
        continue;
      end if;
      if v_cant > i.cantidad - i.devuelto_cantidad then
        -- Error (no "return"): así se deshace todo lo de esta devolución.
        raise exception 'Regresan más de los que se prestaron en uno de los renglones'
          using errcode = 'check_violation';
      end if;
      update public.prestamo_items
         set devuelto_cantidad = devuelto_cantidad + v_cant,
             devuelto_at = case when devuelto_cantidad + v_cant = cantidad then now() end,
             recibido_por = auth.uid()
       where id = i.id;
      insert into public.movimientos (tipo, articulo_id, cantidad, origen_usuario_id, nota)
      values ('devolucion', i.articulo_id, v_cant, v_rec, nullif(trim(p_notas), ''));
      v_unid := v_unid + v_cant;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'piezas', v_piezas, 'unidades', v_unid, 'faltantes', v_falt,
    'mensaje', 'Recibido: ' || v_piezas || case when v_piezas = 1 then ' pieza' else ' piezas' end ||
      case when v_unid > 0 then ', ' || v_unid || ' unidades' else '' end ||
      case when v_acc > 0 then ', accesorios faltantes de ' || v_acc || case when v_acc = 1 then ' pieza' else ' piezas' end else '' end ||
      case when v_falt > 0 then '. Ojo: ' || v_falt || ' con control o cables faltantes.' else '.' end);
end;
$$;

revoke execute on function public.registrar_entrega(uuid, text, jsonb, jsonb, text) from public, anon;
revoke execute on function public.buscar_para_devolucion(text) from public, anon;
revoke execute on function public.registrar_devolucion(jsonb, text) from public, anon;
grant execute on function public.registrar_entrega(uuid, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.buscar_para_devolucion(text) to authenticated;
grant execute on function public.registrar_devolucion(jsonb, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Seguridad de lectura: almacén y admin ven todo; cada persona ve lo suyo; el
-- líder ve lo de su zona. Nadie escribe directo.
-- -----------------------------------------------------------------------------
create function public.puede_ver_prestamo(p_receptor uuid, p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_almacen()
      or p_receptor = auth.uid()
      or (p_zona is not null and public.es_lider_de_zona(p_zona));
$$;

revoke execute on function public.puede_ver_prestamo(uuid, uuid) from public, anon;
grant execute on function public.puede_ver_prestamo(uuid, uuid) to authenticated;

alter table public.prestamos enable row level security;
alter table public.prestamo_items enable row level security;

grant select on public.prestamos, public.prestamo_items, public.v_prestamo_items to authenticated;

create policy "prestamos: lectura" on public.prestamos
  for select to authenticated using (public.puede_ver_prestamo(receptor_id, zona_id));
create policy "prestamo_items: lectura" on public.prestamo_items
  for select to authenticated
  using (exists (select 1 from public.prestamos p
                  where p.id = prestamo_id and public.puede_ver_prestamo(p.receptor_id, p.zona_id)));
