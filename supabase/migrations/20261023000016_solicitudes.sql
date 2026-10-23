-- =============================================================================
-- CEPRA — Migración 16: solicitudes de equipo
--
-- Flujo:
--   1. STAFF pide lo que necesita para su zona → queda PENDIENTE.
--      El LÍDER de la zona (o el admin) pide → queda APROBADA directo.
--   2. El líder de la zona (o el admin) puede AJUSTAR las solicitudes de su
--      zona (las de su staff y las suyas) mientras no estén preparadas, y
--      APRUEBA o RECHAZA las pendientes.
--   3. ALMACÉN prepara las aprobadas: aparta piezas (quedan "reservado") y
--      cantidades (suben "reservado" en stock) → LISTA para recoger.
--   4. En la ENTREGA se carga la solicitud: se firma con PIN como siempre y la
--      solicitud queda ENTREGADA, ligada al folio del préstamo. Lo apartado que
--      no se entregó se libera solo.
--
-- Nadie escribe estas tablas directo: solo las funciones de este archivo.
-- =============================================================================

create type public.estado_solicitud as enum
  ('pendiente', 'aprobada', 'lista', 'entregada', 'rechazada', 'cancelada');

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table public.solicitudes (
  id              uuid primary key default gen_random_uuid(),
  folio           bigint generated always as identity unique,
  evento_id       uuid not null references public.eventos (id),
  zona_id         uuid not null references public.zonas (id),
  solicitante_id  uuid not null references public.usuarios (id),
  necesita_para   timestamptz,
  notas           text,
  estado          public.estado_solicitud not null default 'pendiente',
  aprobado_por    uuid references public.usuarios (id),
  aprobado_at     timestamptz,
  ajustado_por    uuid references public.usuarios (id),
  ajustado_at     timestamptz,
  motivo          text,                                   -- de rechazo o cancelación
  cerrado_por     uuid references public.usuarios (id),   -- quien rechazó o canceló
  cerrado_at      timestamptz,
  preparado_por   uuid references public.usuarios (id),
  preparado_at    timestamptz,
  prestamo_id     uuid references public.prestamos (id),
  entregado_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index solicitudes_solicitante_idx on public.solicitudes (solicitante_id);
create index solicitudes_zona_idx on public.solicitudes (zona_id);
create index solicitudes_estado_idx on public.solicitudes (estado);

create trigger solicitudes_updated_at
  before update on public.solicitudes
  for each row execute function public.tg_updated_at();

-- Renglones: N de un tipo de artículo (por pieza o por cantidad).
create table public.solicitud_items (
  id                  uuid primary key default gen_random_uuid(),
  solicitud_id        uuid not null references public.solicitudes (id) on delete cascade,
  articulo_id         uuid not null references public.catalogo_articulos (id),
  cantidad            integer not null check (cantidad > 0 and cantidad <= 500),
  -- Solo artículos por cantidad: cuántas unidades apartó almacén.
  reservado_cantidad  integer not null default 0 check (reservado_cantidad >= 0),
  unique (solicitud_id, articulo_id)
);

create index solicitud_items_solicitud_idx on public.solicitud_items (solicitud_id);

-- Piezas apartadas por almacén (artículos por pieza).
create table public.solicitud_reservas (
  solicitud_id  uuid not null references public.solicitudes (id) on delete cascade,
  item_id       uuid not null references public.solicitud_items (id) on delete cascade,
  equipo_id     uuid not null references public.equipos (id),
  primary key (solicitud_id, equipo_id)
);

-- Una pieza solo puede estar apartada para una solicitud.
create unique index solicitud_reservas_equipo on public.solicitud_reservas (equipo_id);

-- -----------------------------------------------------------------------------
-- Ayudantes
-- -----------------------------------------------------------------------------

-- ¿Puede esta persona aprobar/ajustar solicitudes de esa zona?
create function public.puede_aprobar_solicitud(p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin() or public.es_lider_de_zona(p_zona);
$$;

-- ¿Puede ver esa solicitud?
create function public.puede_ver_solicitud(p_solicitante uuid, p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_almacen()
      or p_solicitante = auth.uid()
      or public.es_lider_de_zona(p_zona);
$$;

-- Valida y normaliza los renglones: [{"articulo_id":"…","cantidad":2}, …]
-- Suma repetidos, revisa que el tipo exista y esté activo. Devuelve el arreglo
-- limpio o lanza un error con mensaje claro.
create function public.solicitud_normalizar_items(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
  v_malo text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un artículo a la solicitud' using errcode = 'check_violation';
  end if;

  if exists (select 1 from jsonb_array_elements(p_items) x
              where coalesce((x ->> 'cantidad')::integer, 0) <= 0) then
    raise exception 'Las cantidades deben ser mayores a 0' using errcode = 'check_violation';
  end if;

  select a.nombre into v_malo
    from jsonb_array_elements(p_items) x
    left join public.catalogo_articulos a on a.id = (x ->> 'articulo_id')::uuid
   where a.id is null or not a.activo
   limit 1;
  if found then
    raise exception 'Uno de los artículos no existe o está inactivo%', coalesce(': ' || v_malo, '')
      using errcode = 'check_violation';
  end if;

  select jsonb_agg(jsonb_build_object('articulo_id', articulo_id, 'cantidad', cantidad))
    into v_res
    from (select x ->> 'articulo_id' as articulo_id, sum((x ->> 'cantidad')::integer) as cantidad
            from jsonb_array_elements(p_items) x
           group by 1) t;

  if exists (select 1 from jsonb_array_elements(v_res) x where (x ->> 'cantidad')::integer > 500) then
    raise exception 'Máximo 500 por artículo en una solicitud' using errcode = 'check_violation';
  end if;
  return v_res;
end;
$$;

-- Libera todo lo que almacén apartó para una solicitud (piezas y cantidades).
-- Uso interno: no se da permiso a nadie.
create function public.solicitud_liberar(p_solicitud uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
begin
  -- Piezas apartadas que siguen apartadas → disponibles otra vez.
  update public.equipos e
     set estado_operativo = 'disponible'
    from public.solicitud_reservas r
   where r.solicitud_id = p_solicitud and r.equipo_id = e.id and e.estado_operativo = 'reservado';
  delete from public.solicitud_reservas where solicitud_id = p_solicitud;

  -- Cantidades apartadas → se restan de "reservado".
  for i in
    select articulo_id, reservado_cantidad from public.solicitud_items
     where solicitud_id = p_solicitud and reservado_cantidad > 0
  loop
    update public.stock_cantidad
       set reservado = greatest(reservado - i.reservado_cantidad, 0)
     where articulo_id = i.articulo_id;
  end loop;
  update public.solicitud_items set reservado_cantidad = 0 where solicitud_id = p_solicitud;
end;
$$;

-- -----------------------------------------------------------------------------
-- CREAR
-- -----------------------------------------------------------------------------
create function public.crear_solicitud(
  p_zona          uuid,
  p_items         jsonb,
  p_necesita_para timestamptz default null,
  p_notas         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  z         public.zonas%rowtype;
  v_evento  public.eventos%rowtype;
  v_items   jsonb;
  v_aprueba boolean;
  v_id      uuid;
  v_folio   bigint;
begin
  if v_uid is null or public.rol_actual() is null then
    raise exception 'Sin sesión' using errcode = 'insufficient_privilege';
  end if;

  select * into z from public.zonas where id = p_zona;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'Esa zona no existe.');
  end if;
  select * into v_evento from public.eventos where id = z.evento_id;
  if v_evento.estado = 'cerrado' then
    return jsonb_build_object('ok', false, 'mensaje', 'El evento ' || v_evento.nombre || ' ya está cerrado.');
  end if;

  -- Quién puede pedir para esta zona: su líder, su staff o el admin.
  v_aprueba := public.es_admin() or z.lider_id = v_uid;
  if not v_aprueba and not exists (
    select 1 from public.zona_staff s where s.zona_id = z.id and s.usuario_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo puedes pedir para una zona en la que estás asignado.');
  end if;

  v_items := public.solicitud_normalizar_items(p_items);

  insert into public.solicitudes (evento_id, zona_id, solicitante_id, necesita_para, notas, estado, aprobado_por, aprobado_at)
  values (z.evento_id, z.id, v_uid, p_necesita_para, nullif(trim(p_notas), ''),
          case when v_aprueba then 'aprobada'::public.estado_solicitud else 'pendiente' end,
          case when v_aprueba then v_uid end,
          case when v_aprueba then now() end)
  returning id, folio into v_id, v_folio;

  insert into public.solicitud_items (solicitud_id, articulo_id, cantidad)
  select v_id, (x ->> 'articulo_id')::uuid, (x ->> 'cantidad')::integer
    from jsonb_array_elements(v_items) x;

  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio,
    'mensaje', case when v_aprueba
                    then 'Solicitud ' || v_folio || ' enviada a almacén.'
                    else 'Solicitud ' || v_folio || ' enviada. Tu líder de zona la tiene que aprobar.' end);
end;
$$;

-- -----------------------------------------------------------------------------
-- AJUSTAR (cambiar renglones / notas)
--   * El líder de la zona o el admin: pendiente o aprobada.
--   * Quien la pidió: solo mientras está pendiente.
-- -----------------------------------------------------------------------------
create function public.ajustar_solicitud(
  p_solicitud     uuid,
  p_items         jsonb,
  p_necesita_para timestamptz default null,
  p_notas         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s       public.solicitudes%rowtype;
  v_items jsonb;
  v_lider boolean;
begin
  select * into s from public.solicitudes where id = p_solicitud for update;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La solicitud no existe.');
  end if;

  v_lider := public.puede_aprobar_solicitud(s.zona_id);
  if not v_lider and not (s.solicitante_id = auth.uid() and s.estado = 'pendiente') then
    return jsonb_build_object('ok', false, 'mensaje', 'No puedes cambiar esta solicitud.');
  end if;
  if s.estado not in ('pendiente', 'aprobada') then
    return jsonb_build_object('ok', false, 'mensaje',
      'Ya no se puede cambiar: está ' || replace(s.estado::text, '_', ' ') || '.');
  end if;

  v_items := public.solicitud_normalizar_items(p_items);

  delete from public.solicitud_items where solicitud_id = s.id;
  insert into public.solicitud_items (solicitud_id, articulo_id, cantidad)
  select s.id, (x ->> 'articulo_id')::uuid, (x ->> 'cantidad')::integer
    from jsonb_array_elements(v_items) x;

  update public.solicitudes
     set necesita_para = p_necesita_para,
         notas = nullif(trim(p_notas), ''),
         ajustado_por = auth.uid(),
         ajustado_at = now()
   where id = s.id;

  return jsonb_build_object('ok', true, 'mensaje', 'Solicitud ' || s.folio || ' actualizada.');
end;
$$;

-- -----------------------------------------------------------------------------
-- APROBAR / RECHAZAR (líder de la zona o admin)
-- -----------------------------------------------------------------------------
create function public.aprobar_solicitud(p_solicitud uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes%rowtype;
begin
  select * into s from public.solicitudes where id = p_solicitud for update;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La solicitud no existe.');
  end if;
  if not public.puede_aprobar_solicitud(s.zona_id) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo el líder de la zona o el administrador aprueban.');
  end if;
  if s.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo se aprueban solicitudes pendientes.');
  end if;

  update public.solicitudes
     set estado = 'aprobada', aprobado_por = auth.uid(), aprobado_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true, 'mensaje', 'Solicitud ' || s.folio || ' aprobada: pasa a almacén.');
end;
$$;

create function public.rechazar_solicitud(p_solicitud uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes%rowtype;
begin
  select * into s from public.solicitudes where id = p_solicitud for update;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La solicitud no existe.');
  end if;
  if not public.puede_aprobar_solicitud(s.zona_id) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo el líder de la zona o el administrador rechazan.');
  end if;
  if s.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo se rechazan solicitudes pendientes.');
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'mensaje', 'Escribe el motivo del rechazo.');
  end if;

  update public.solicitudes
     set estado = 'rechazada', motivo = trim(p_motivo), cerrado_por = auth.uid(), cerrado_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true, 'mensaje', 'Solicitud ' || s.folio || ' rechazada.');
end;
$$;

-- -----------------------------------------------------------------------------
-- CANCELAR
--   * Quien la pidió o el líder/admin: pendiente o aprobada.
--   * Almacén o admin: también si ya está lista (libera lo apartado).
-- -----------------------------------------------------------------------------
create function public.cancelar_solicitud(p_solicitud uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes%rowtype;
begin
  select * into s from public.solicitudes where id = p_solicitud for update;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La solicitud no existe.');
  end if;

  if s.estado in ('pendiente', 'aprobada') then
    if not (s.solicitante_id = auth.uid() or public.puede_aprobar_solicitud(s.zona_id) or public.es_almacen()) then
      return jsonb_build_object('ok', false, 'mensaje', 'No puedes cancelar esta solicitud.');
    end if;
  elsif s.estado = 'lista' then
    if not public.es_almacen() then
      return jsonb_build_object('ok', false, 'mensaje', 'Ya está preparada: pide a almacén que la cancele.');
    end if;
    perform public.solicitud_liberar(s.id);
  else
    return jsonb_build_object('ok', false, 'mensaje', 'Esta solicitud ya está cerrada.');
  end if;

  update public.solicitudes
     set estado = 'cancelada', motivo = nullif(trim(p_motivo), ''), cerrado_por = auth.uid(), cerrado_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true, 'mensaje', 'Solicitud ' || s.folio || ' cancelada.');
end;
$$;

-- -----------------------------------------------------------------------------
-- PREPARAR (almacén): aparta piezas y cantidades → LISTA
--   p_piezas      = ["GP-CN01-0001", …]           (artículos por pieza)
--   p_cantidades  = [{"item_id":"…","cantidad":4}] (artículos por cantidad)
-- Se puede apartar menos de lo pedido (si no alcanza); nunca más.
-- -----------------------------------------------------------------------------
create function public.preparar_solicitud(
  p_solicitud  uuid,
  p_piezas     jsonb default '[]'::jsonb,
  p_cantidades jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.solicitudes%rowtype;
  v_etq    text;
  e        public.equipos%rowtype;
  i        public.solicitud_items%rowtype;
  x        jsonb;
  v_cant   integer;
  v_disp   integer;
  v_usadas integer;
  v_total  integer := 0;
  v_falta  integer := 0;
begin
  if not public.es_almacen() then
    raise exception 'Solo almacén y administración preparan solicitudes' using errcode = 'insufficient_privilege';
  end if;

  select * into s from public.solicitudes where id = p_solicitud for update;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La solicitud no existe.');
  end if;
  if s.estado <> 'aprobada' then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo se preparan solicitudes aprobadas.');
  end if;

  -- 1) Piezas
  for v_etq in select upper(trim(value)) from jsonb_array_elements_text(coalesce(p_piezas, '[]')) loop
    select * into e from public.equipos where etiqueta = v_etq for update;
    if not found then
      raise exception 'Pieza no reconocida: %', v_etq using errcode = 'check_violation';
    end if;
    if e.estado_operativo <> 'disponible' then
      raise exception '% no está disponible (estado: %)', v_etq, replace(e.estado_operativo::text, '_', ' ')
        using errcode = 'check_violation';
    end if;
    select * into i from public.solicitud_items where solicitud_id = s.id and articulo_id = e.articulo_id;
    if not found then
      raise exception '% no es de un tipo que se pidió en esta solicitud', v_etq using errcode = 'check_violation';
    end if;
    select count(*) into v_usadas from public.solicitud_reservas where item_id = i.id;
    if v_usadas >= i.cantidad then
      raise exception 'Sobra %: ya se apartaron las % que se pidieron de ese tipo', v_etq, i.cantidad
        using errcode = 'check_violation';
    end if;
    insert into public.solicitud_reservas (solicitud_id, item_id, equipo_id) values (s.id, i.id, e.id);
    update public.equipos set estado_operativo = 'reservado' where id = e.id;
    v_total := v_total + 1;
  end loop;

  -- 2) Cantidades
  for x in select * from jsonb_array_elements(coalesce(p_cantidades, '[]')) loop
    v_cant := coalesce((x ->> 'cantidad')::integer, 0);
    if v_cant <= 0 then
      continue;
    end if;
    select * into i from public.solicitud_items where id = (x ->> 'item_id')::uuid and solicitud_id = s.id;
    if not found then
      raise exception 'Renglón de solicitud no encontrado' using errcode = 'no_data_found';
    end if;
    if v_cant > i.cantidad then
      raise exception 'No se puede apartar más de lo pedido' using errcode = 'check_violation';
    end if;
    perform 1 from public.stock_cantidad where articulo_id = i.articulo_id for update;
    if not found then
      raise exception 'Uno de los artículos no se controla por cantidad' using errcode = 'check_violation';
    end if;
    select st.total - st.reservado - public.stock_prestado(st.articulo_id) into v_disp
      from public.stock_cantidad st where st.articulo_id = i.articulo_id;
    if v_cant > v_disp then
      raise exception 'No alcanza %: se quieren apartar % y hay % disponibles',
        (select nombre from public.catalogo_articulos where id = i.articulo_id), v_cant, v_disp
        using errcode = 'check_violation';
    end if;
    update public.stock_cantidad set reservado = reservado + v_cant where articulo_id = i.articulo_id;
    update public.solicitud_items set reservado_cantidad = v_cant where id = i.id;
    v_total := v_total + v_cant;
  end loop;

  if v_total = 0 then
    raise exception 'No se apartó nada: escanea las piezas o indica las cantidades' using errcode = 'check_violation';
  end if;

  -- ¿Cuánto quedó sin apartar?
  select coalesce(sum(it.cantidad - case when a.serializado
                                         then (select count(*) from public.solicitud_reservas r where r.item_id = it.id)
                                         else it.reservado_cantidad end), 0)
    into v_falta
    from public.solicitud_items it
    join public.catalogo_articulos a on a.id = it.articulo_id
   where it.solicitud_id = s.id;

  update public.solicitudes
     set estado = 'lista', preparado_por = auth.uid(), preparado_at = now()
   where id = s.id;

  return jsonb_build_object('ok', true, 'falta', v_falta,
    'mensaje', 'Solicitud ' || s.folio || ' lista para recoger' ||
      case when v_falta > 0 then '. Ojo: faltaron ' || v_falta || ' por apartar.' else '.' end);
end;
$$;

-- Deshacer la preparación (almacén): libera lo apartado y vuelve a "aprobada".
create function public.deshacer_preparacion(p_solicitud uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes%rowtype;
begin
  if not public.es_almacen() then
    raise exception 'Solo almacén y administración' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.solicitudes where id = p_solicitud for update;
  if not found or s.estado <> 'lista' then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo se puede deshacer una solicitud lista.');
  end if;
  perform public.solicitud_liberar(s.id);
  update public.solicitudes
     set estado = 'aprobada', preparado_por = null, preparado_at = null
   where id = s.id;
  return jsonb_build_object('ok', true, 'mensaje', 'Solicitud ' || s.folio || ' regresó a "aprobada"; lo apartado quedó libre.');
end;
$$;

-- -----------------------------------------------------------------------------
-- ENTREGA: misma función de la migración 14, ahora con p_solicitud opcional.
--   * Con solicitud: deja entregar las piezas apartadas para ella y cuenta como
--     disponibles las cantidades apartadas. Al final la marca "entregada" y
--     libera lo apartado que no se entregó.
-- -----------------------------------------------------------------------------
drop function public.registrar_entrega(uuid, text, jsonb, jsonb, text);

create function public.registrar_entrega(
  p_receptor    uuid,
  p_pin         text,
  p_piezas      jsonb default '[]'::jsonb,
  p_cantidades  jsonb default '[]'::jsonb,
  p_notas       text default null,
  p_solicitud   uuid default null
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
  v_sol       public.solicitudes%rowtype;
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
  v_apartada  uuid;
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

  if p_solicitud is not null then
    select * into v_sol from public.solicitudes where id = p_solicitud for update;
    if not found then
      return jsonb_build_object('ok', false, 'mensaje', 'La solicitud no existe.');
    end if;
    if v_sol.estado <> 'lista' then
      return jsonb_build_object('ok', false, 'mensaje', 'La solicitud ' || v_sol.folio || ' no está lista para entregar.');
    end if;
    if v_sol.solicitante_id <> p_receptor then
      return jsonb_build_object('ok', false, 'mensaje', 'La solicitud ' || v_sol.folio || ' es de otra persona.');
    end if;
    if v_sol.evento_id <> v_evento then
      return jsonb_build_object('ok', false, 'mensaje', 'La solicitud ' || v_sol.folio || ' es de otro evento.');
    end if;
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
    if e.estado_operativo = 'reservado' then
      select solicitud_id into v_apartada from public.solicitud_reservas where equipo_id = e.id;
      if p_solicitud is null or v_apartada is distinct from p_solicitud then
        return jsonb_build_object('ok', false, 'mensaje', v_etq || ' está apartado para la solicitud '
          || coalesce((select folio::text from public.solicitudes where id = v_apartada), '?') || '.');
      end if;
    elsif e.estado_operativo <> 'disponible' then
      if e.estado_operativo = 'prestado' then
        select nombre into v_quien from public.usuarios where id = e.responsable_id;
        return jsonb_build_object('ok', false, 'mensaje', v_etq || ' ya está prestado a ' || coalesce(v_quien, 'otra persona') || '. Primero regístralo como devuelto.');
      end if;
      return jsonb_build_object('ok', false, 'mensaje',
        v_etq || ' no está disponible (estado: ' || replace(e.estado_operativo::text, '_', ' ') || ').');
    end if;
    v_ids := v_ids || e.id;
  end loop;

  -- 2) Revisar cantidades (bloqueando su fila de stock). Lo apartado para esta
  --    solicitud cuenta como disponible.
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
    select s.total - s.reservado - public.stock_prestado(s.articulo_id)
           + coalesce((select it.reservado_cantidad from public.solicitud_items it
                        where it.solicitud_id = p_solicitud and it.articulo_id = s.articulo_id), 0)
      into v_disp
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

  -- 4) Con solicitud: se suelta lo apartado (lo que sí se entrega pasa a
  --    "prestado" abajo; lo demás queda disponible).
  if p_solicitud is not null then
    perform public.solicitud_liberar(p_solicitud);
  end if;

  -- 5) Registrar.
  if p_solicitud is not null then
    v_zona := v_sol.zona_id;
  else
    select z.id into v_zona
      from public.zonas z
     where z.evento_id = v_evento
       and (z.lider_id = p_receptor
            or exists (select 1 from public.zona_staff s where s.zona_id = z.id and s.usuario_id = p_receptor))
     limit 1;
  end if;

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
              'cables', e.etiqueta_cables is not null and coalesce((v_pieza ->> 'cables')::boolean, true),
              'solicitud', v_sol.folio));
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
            jsonb_build_object('folio', v_folio, 'solicitud', v_sol.folio));
    v_n := v_n + 1;
  end loop;

  if p_solicitud is not null then
    update public.solicitudes
       set estado = 'entregada', prestamo_id = v_prestamo, entregado_at = now()
     where id = p_solicitud;
  end if;

  return jsonb_build_object('ok', true, 'folio', v_folio, 'prestamo_id', v_prestamo,
    'mensaje', 'Entrega ' || v_folio || ' firmada por ' || v_receptor.nombre || ' (' || v_n || ' renglones)'
      || case when p_solicitud is not null then ' · solicitud ' || v_sol.folio || ' entregada.' else '.' end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke execute on function public.solicitud_normalizar_items(jsonb) from public, anon, authenticated;
revoke execute on function public.solicitud_liberar(uuid) from public, anon, authenticated;

revoke execute on function public.puede_aprobar_solicitud(uuid) from public, anon;
revoke execute on function public.puede_ver_solicitud(uuid, uuid) from public, anon;
revoke execute on function public.crear_solicitud(uuid, jsonb, timestamptz, text) from public, anon;
revoke execute on function public.ajustar_solicitud(uuid, jsonb, timestamptz, text) from public, anon;
revoke execute on function public.aprobar_solicitud(uuid) from public, anon;
revoke execute on function public.rechazar_solicitud(uuid, text) from public, anon;
revoke execute on function public.cancelar_solicitud(uuid, text) from public, anon;
revoke execute on function public.preparar_solicitud(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.deshacer_preparacion(uuid) from public, anon;
revoke execute on function public.registrar_entrega(uuid, text, jsonb, jsonb, text, uuid) from public, anon;

grant execute on function public.puede_aprobar_solicitud(uuid) to authenticated;
grant execute on function public.puede_ver_solicitud(uuid, uuid) to authenticated;
grant execute on function public.crear_solicitud(uuid, jsonb, timestamptz, text) to authenticated;
grant execute on function public.ajustar_solicitud(uuid, jsonb, timestamptz, text) to authenticated;
grant execute on function public.aprobar_solicitud(uuid) to authenticated;
grant execute on function public.rechazar_solicitud(uuid, text) to authenticated;
grant execute on function public.cancelar_solicitud(uuid, text) to authenticated;
grant execute on function public.preparar_solicitud(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.deshacer_preparacion(uuid) to authenticated;
grant execute on function public.registrar_entrega(uuid, text, jsonb, jsonb, text, uuid) to authenticated;

alter table public.solicitudes enable row level security;
alter table public.solicitud_items enable row level security;
alter table public.solicitud_reservas enable row level security;

grant select on public.solicitudes, public.solicitud_items, public.solicitud_reservas to authenticated;

create policy "solicitudes: lectura" on public.solicitudes
  for select to authenticated using (public.puede_ver_solicitud(solicitante_id, zona_id));
create policy "solicitud_items: lectura" on public.solicitud_items
  for select to authenticated
  using (exists (select 1 from public.solicitudes s
                  where s.id = solicitud_id and public.puede_ver_solicitud(s.solicitante_id, s.zona_id)));
create policy "solicitud_reservas: lectura" on public.solicitud_reservas
  for select to authenticated
  using (exists (select 1 from public.solicitudes s
                  where s.id = solicitud_id and public.puede_ver_solicitud(s.solicitante_id, s.zona_id)));
