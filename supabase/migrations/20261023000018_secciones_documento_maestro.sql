-- =============================================================================
-- CEPRA — Migración 18: secciones, roles de organización y documento maestro
--
-- 1. Coordinación, Project Manager y Stage Manager = mismos permisos que el
--    administrador (es_admin, es_almacen y es_lider_o_admin los incluyen).
-- 2. Consumo eléctrico (W) por tipo de artículo, para el documento maestro.
-- 3. SECCIONES dentro de cada zona (Arcadia → VR, Xbox, PlayStation…), cada
--    una con su propio líder. El staff se asigna a una sección, o a la zona
--    si no tiene secciones.
-- 4. Solicitudes: guardan su sección; el líder de la sección también aprueba.
-- 5. DOCUMENTO MAESTRO por evento: qué equipo va a cada zona/sección y de
--    dónde sale (almacén, compra, renta o patrocinio). Al cerrarlo genera las
--    solicitudes a almacén, ya aprobadas, a nombre del líder de cada lugar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Roles de organización = administrador
-- -----------------------------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('administrador', 'coordinacion', 'project_manager', 'stage_manager'), false);
$$;

create or replace function public.es_almacen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('administrador', 'coordinacion', 'project_manager', 'stage_manager', 'almacenista'), false);
$$;

create or replace function public.es_lider_o_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('administrador', 'coordinacion', 'project_manager', 'stage_manager', 'lider'), false);
$$;

-- -----------------------------------------------------------------------------
-- 2. Consumo eléctrico por tipo de artículo (watts por unidad)
-- -----------------------------------------------------------------------------
alter table public.catalogo_articulos
  add column consumo_w integer check (consumo_w is null or (consumo_w >= 0 and consumo_w <= 100000));

grant insert (consumo_w), update (consumo_w) on public.catalogo_articulos to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Secciones
-- -----------------------------------------------------------------------------
create table public.secciones (
  id          uuid primary key default gen_random_uuid(),
  zona_id     uuid not null references public.zonas (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) > 0),
  lider_id    uuid references public.usuarios (id),
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (zona_id, nombre)
);

create index secciones_zona_idx on public.secciones (zona_id);

create trigger secciones_updated_at
  before update on public.secciones
  for each row execute function public.tg_updated_at();

create function public.es_lider_de_seccion(p_seccion uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_seccion is not null
     and exists (select 1 from public.secciones s where s.id = p_seccion and s.lider_id = auth.uid());
$$;

revoke execute on function public.es_lider_de_seccion(uuid) from public, anon;
grant execute on function public.es_lider_de_seccion(uuid) to authenticated;

alter table public.secciones enable row level security;
grant select on public.secciones to authenticated;
grant insert (zona_id, nombre, lider_id, notas), update (nombre, lider_id, notas), delete
  on public.secciones to authenticated;

create policy "secciones: lectura" on public.secciones for select to authenticated using (true);
create policy "secciones: alta" on public.secciones
  for insert to authenticated with check ((select public.es_admin()) or public.es_lider_de_zona(zona_id));
create policy "secciones: edición" on public.secciones
  for update to authenticated
  using ((select public.es_admin()) or public.es_lider_de_zona(zona_id))
  with check ((select public.es_admin()) or public.es_lider_de_zona(zona_id));
create policy "secciones: borrado" on public.secciones
  for delete to authenticated using ((select public.es_admin()) or public.es_lider_de_zona(zona_id));

-- El staff puede quedar en una sección de su zona.
alter table public.zona_staff
  add column seccion_id uuid references public.secciones (id) on delete set null;

create function public.tg_zona_staff_seccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seccion_id is not null
     and not exists (select 1 from public.secciones s where s.id = new.seccion_id and s.zona_id = new.zona_id) then
    raise exception 'Esa sección no es de esta zona' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_zona_staff_seccion() from public, anon, authenticated;

create trigger zona_staff_seccion
  before insert or update on public.zona_staff
  for each row execute function public.tg_zona_staff_seccion();

grant insert (seccion_id), update (seccion_id) on public.zona_staff to authenticated;

create policy "zona_staff: mover de sección" on public.zona_staff
  for update to authenticated
  using ((select public.es_admin()) or public.es_lider_de_zona(zona_id))
  with check ((select public.es_admin()) or public.es_lider_de_zona(zona_id));

-- Credencial: muestra zona y sección de quien recibe (evento activo).
create or replace function public.buscar_por_credencial(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_zona text;
begin
  if not public.es_almacen() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  select u.id, u.nombre, u.rol, u.activo, f.pin_hash is not null as tiene_pin,
         (f.pin_bloqueado_hasta is not null and f.pin_bloqueado_hasta > now()) as bloqueado
    into r
    from public.usuario_firma f
    join public.usuarios u on u.id = f.usuario_id
   where f.credencial = upper(trim(p_codigo));

  if not found then
    return jsonb_build_object('encontrado', false, 'mensaje', 'Credencial no reconocida: ' || upper(trim(p_codigo)));
  end if;

  -- Zona (y sección) en el evento activo: líder de zona, líder de sección o staff.
  select z.nombre || coalesce(' · ' || sc.nombre, '') into v_zona
    from public.zonas z
    join public.eventos e on e.id = z.evento_id and e.estado = 'activo'
    left join public.zona_staff st on st.zona_id = z.id and st.usuario_id = r.id
    left join public.secciones sc on sc.zona_id = z.id
         and (sc.id = st.seccion_id or sc.lider_id = r.id)
   where z.lider_id = r.id or st.usuario_id is not null or sc.lider_id = r.id
   order by sc.lider_id = r.id desc nulls last
   limit 1;

  return jsonb_build_object(
    'encontrado', true,
    'id', r.id, 'nombre', r.nombre, 'rol', r.rol, 'activo', r.activo,
    'tiene_pin', r.tiene_pin, 'bloqueado', r.bloqueado, 'zona', v_zona
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Solicitudes con sección y origen
-- -----------------------------------------------------------------------------
alter table public.solicitudes
  add column seccion_id uuid references public.secciones (id) on delete set null,
  add column origen text not null default 'manual' check (origen in ('manual', 'maestro'));

drop function public.puede_aprobar_solicitud(uuid);

create function public.puede_aprobar_solicitud(p_zona uuid, p_seccion uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin() or public.es_lider_de_zona(p_zona) or public.es_lider_de_seccion(p_seccion);
$$;

revoke execute on function public.puede_aprobar_solicitud(uuid, uuid) from public, anon;
grant execute on function public.puede_aprobar_solicitud(uuid, uuid) to authenticated;

-- Ver: además, los líderes de sección ven las solicitudes de su zona.
create or replace function public.puede_ver_solicitud(p_solicitante uuid, p_zona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_almacen()
      or p_solicitante = auth.uid()
      or public.es_lider_de_zona(p_zona)
      or exists (select 1 from public.secciones s where s.zona_id = p_zona and s.lider_id = auth.uid());
$$;

-- CREAR: quién pide puede ser líder de zona, líder de sección o staff (de la
-- zona o de una de sus secciones). Líderes y organización → aprobada directo.
create or replace function public.crear_solicitud(
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
  v_seccion uuid;
  v_staff   boolean;
  v_sec_staff uuid;
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

  -- Sección: la que lidera en esta zona, o en la que está como staff.
  select id into v_seccion from public.secciones where zona_id = z.id and lider_id = v_uid limit 1;
  select s.seccion_id into v_sec_staff from public.zona_staff s where s.zona_id = z.id and s.usuario_id = v_uid;
  v_staff := found;
  v_seccion := coalesce(v_seccion, v_sec_staff);

  v_aprueba := public.es_admin() or z.lider_id = v_uid
               or exists (select 1 from public.secciones where id = v_seccion and lider_id = v_uid);
  if not v_aprueba and not coalesce(v_staff, false) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo puedes pedir para una zona en la que estás asignado.');
  end if;

  v_items := public.solicitud_normalizar_items(p_items);

  insert into public.solicitudes (evento_id, zona_id, seccion_id, solicitante_id, necesita_para, notas, estado, aprobado_por, aprobado_at)
  values (z.evento_id, z.id, v_seccion, v_uid, p_necesita_para, nullif(trim(p_notas), ''),
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
                    else 'Solicitud ' || v_folio || ' enviada. Tu líder la tiene que aprobar.' end);
end;
$$;


-- Mismas funciones de la migración 16; ahora el líder de la SECCIÓN también aprueba.

create or replace function public.ajustar_solicitud(
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

  v_lider := public.puede_aprobar_solicitud(s.zona_id, s.seccion_id);
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

create or replace function public.aprobar_solicitud(p_solicitud uuid)
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
  if not public.puede_aprobar_solicitud(s.zona_id, s.seccion_id) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo el líder de la zona o de la sección, o la organización, aprueban.');
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

create or replace function public.rechazar_solicitud(p_solicitud uuid, p_motivo text)
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
  if not public.puede_aprobar_solicitud(s.zona_id, s.seccion_id) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo el líder de la zona o de la sección, o la organización, rechazan.');
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

create or replace function public.cancelar_solicitud(p_solicitud uuid, p_motivo text default null)
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
    if not (s.solicitante_id = auth.uid() or public.puede_aprobar_solicitud(s.zona_id, s.seccion_id) or public.es_almacen()) then
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

-- Entrega: la zona de quien recibe también se encuentra si es líder de una sección.

create or replace function public.registrar_entrega(
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
            or exists (select 1 from public.zona_staff s where s.zona_id = z.id and s.usuario_id = p_receptor)
            or exists (select 1 from public.secciones sc where sc.zona_id = z.id and sc.lider_id = p_receptor))
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
-- 5. Documento maestro
-- -----------------------------------------------------------------------------
create type public.origen_maestro as enum ('almacen', 'compra', 'renta', 'patrocinio');

-- Encabezado: uno por evento.
create table public.maestro (
  evento_id     uuid primary key references public.eventos (id) on delete cascade,
  estado        text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  notas         text,
  cerrado_por   uuid references public.usuarios (id),
  cerrado_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger maestro_updated_at
  before update on public.maestro
  for each row execute function public.tg_updated_at();

-- Renglones: N de un tipo de artículo para una zona (o una sección de ella),
-- y de dónde sale. Lo que no existe en el catálogo (una renta, por ejemplo)
-- se escribe como descripción libre.
create table public.maestro_items (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references public.eventos (id) on delete cascade,
  zona_id      uuid not null references public.zonas (id) on delete cascade,
  seccion_id   uuid references public.secciones (id) on delete cascade,
  articulo_id  uuid references public.catalogo_articulos (id),
  descripcion  text,
  cantidad     integer not null check (cantidad > 0 and cantidad <= 10000),
  origen       public.origen_maestro not null default 'almacen',
  consumo_w    integer check (consumo_w is null or consumo_w >= 0),   -- solo para lo que no está en catálogo
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (articulo_id is not null or (length(trim(coalesce(descripcion, ''))) > 0 and origen <> 'almacen'))
);

create index maestro_items_evento_idx on public.maestro_items (evento_id);
create index maestro_items_zona_idx on public.maestro_items (zona_id);

create trigger maestro_items_updated_at
  before update on public.maestro_items
  for each row execute function public.tg_updated_at();

-- Revisa que la sección sea de la zona, toma el evento de la zona, crea el
-- encabezado si no existe y bloquea cambios si el documento está cerrado.
create function public.tg_maestro_items_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento uuid;
  v_ev     uuid;
begin
  v_ev := case when tg_op = 'DELETE' then old.evento_id else new.evento_id end;
  if exists (select 1 from public.maestro m where m.evento_id = v_ev and m.estado = 'cerrado') then
    raise exception 'El documento maestro de este evento está cerrado: reábrelo para cambiarlo'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  select evento_id into v_evento from public.zonas where id = new.zona_id;
  if v_evento is null then
    raise exception 'La zona no existe' using errcode = 'foreign_key_violation';
  end if;
  new.evento_id := v_evento;
  if exists (select 1 from public.maestro m where m.evento_id = v_evento and m.estado = 'cerrado') then
    raise exception 'El documento maestro de este evento está cerrado: reábrelo para cambiarlo'
      using errcode = 'check_violation';
  end if;
  if new.seccion_id is not null
     and not exists (select 1 from public.secciones s where s.id = new.seccion_id and s.zona_id = new.zona_id) then
    raise exception 'Esa sección no es de esta zona' using errcode = 'check_violation';
  end if;
  if new.articulo_id is not null then
    new.descripcion := null;
    new.consumo_w := null;
  end if;
  insert into public.maestro (evento_id) values (v_evento) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.tg_maestro_items_validar() from public, anon, authenticated;

create trigger maestro_items_validar
  before insert or update or delete on public.maestro_items
  for each row execute function public.tg_maestro_items_validar();

-- Inventario por tipo: total en almacén (lo que es de la empresa o está a su
-- cargo, sin bajas) y disponible ahora mismo.
create view public.v_inventario_articulo
with (security_invoker = true) as
select
  a.id as articulo_id,
  a.codigo_tipo,
  a.nombre,
  a.categoria,
  a.serializado,
  a.consumo_w,
  a.activo,
  case when a.serializado
       then (select count(*) from public.equipos e
              where e.articulo_id = a.id and e.estado_operativo not in ('baja', 'devuelto_propietario'))
       else coalesce((select s.total from public.stock_cantidad s where s.articulo_id = a.id), 0)
  end::integer as total_almacen,
  case when a.serializado
       then (select count(*) from public.equipos e
              where e.articulo_id = a.id and e.estado_operativo = 'disponible')
       else coalesce((select s.total - s.reservado - public.stock_prestado(a.id)
                        from public.stock_cantidad s where s.articulo_id = a.id), 0)
  end::integer as disponible
from public.catalogo_articulos a;

-- Seguridad: todos los que tienen sesión lo leen; solo la organización
-- (y el admin) lo escribe.
alter table public.maestro enable row level security;
alter table public.maestro_items enable row level security;

grant select on public.maestro, public.maestro_items, public.v_inventario_articulo to authenticated;
grant insert (evento_id, notas), update (notas) on public.maestro to authenticated;
grant insert (zona_id, seccion_id, articulo_id, descripcion, cantidad, origen, consumo_w, notas),
      update (seccion_id, articulo_id, descripcion, cantidad, origen, consumo_w, notas),
      delete
  on public.maestro_items to authenticated;

create policy "maestro: lectura" on public.maestro for select to authenticated using (true);
create policy "maestro: alta" on public.maestro
  for insert to authenticated with check ((select public.es_admin()));
create policy "maestro: notas" on public.maestro
  for update to authenticated
  using ((select public.es_admin()) and estado = 'borrador')
  with check ((select public.es_admin()) and estado = 'borrador');

create policy "maestro_items: lectura" on public.maestro_items for select to authenticated using (true);
create policy "maestro_items: alta" on public.maestro_items
  for insert to authenticated with check ((select public.es_admin()));
create policy "maestro_items: edición" on public.maestro_items
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "maestro_items: borrado" on public.maestro_items
  for delete to authenticated using ((select public.es_admin()));

-- CERRAR: genera una solicitud APROBADA por cada zona/sección con equipo de
-- almacén, a nombre de su líder (el de la sección, o el de la zona).
create function public.cerrar_maestro(p_evento uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m        public.maestro%rowtype;
  g        record;
  v_lider  uuid;
  v_id     uuid;
  v_n      integer := 0;
  v_sin    text;
begin
  if not public.es_admin() then
    raise exception 'Solo la organización cierra el documento maestro' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.eventos where id = p_evento and estado = 'cerrado') then
    return jsonb_build_object('ok', false, 'mensaje', 'El evento ya está cerrado.');
  end if;

  insert into public.maestro (evento_id) values (p_evento) on conflict do nothing;
  select * into m from public.maestro where evento_id = p_evento for update;
  if m.estado = 'cerrado' then
    return jsonb_build_object('ok', false, 'mensaje', 'El documento ya está cerrado.');
  end if;
  if not exists (select 1 from public.maestro_items where evento_id = p_evento) then
    return jsonb_build_object('ok', false, 'mensaje', 'El documento no tiene equipo asignado.');
  end if;

  -- Cada lugar con equipo de almacén necesita líder para recibirlo.
  select string_agg(distinct z.nombre || coalesce(' / ' || sc.nombre, ''), ', ') into v_sin
    from public.maestro_items i
    join public.zonas z on z.id = i.zona_id
    left join public.secciones sc on sc.id = i.seccion_id
   where i.evento_id = p_evento and i.origen = 'almacen' and i.articulo_id is not null
     and coalesce(sc.lider_id, z.lider_id) is null;
  if v_sin is not null then
    return jsonb_build_object('ok', false, 'mensaje', 'Falta asignar líder en: ' || v_sin || '.');
  end if;

  if exists (select 1 from (select sum(i.cantidad) c from public.maestro_items i
                             where i.evento_id = p_evento and i.origen = 'almacen' and i.articulo_id is not null
                             group by i.zona_id, i.seccion_id, i.articulo_id) t where t.c > 500) then
    return jsonb_build_object('ok', false, 'mensaje', 'Un lugar tiene más de 500 de un mismo artículo: divídelo en secciones.');
  end if;

  for g in
    select i.zona_id, i.seccion_id from public.maestro_items i
     where i.evento_id = p_evento and i.origen = 'almacen' and i.articulo_id is not null
     group by i.zona_id, i.seccion_id
  loop
    select coalesce(sc.lider_id, z.lider_id) into v_lider
      from public.zonas z left join public.secciones sc on sc.id = g.seccion_id
     where z.id = g.zona_id;

    insert into public.solicitudes (evento_id, zona_id, seccion_id, solicitante_id, notas, estado,
                                    aprobado_por, aprobado_at, origen)
    values (p_evento, g.zona_id, g.seccion_id, v_lider, 'Generada por el documento maestro', 'aprobada',
            auth.uid(), now(), 'maestro')
    returning id into v_id;

    insert into public.solicitud_items (solicitud_id, articulo_id, cantidad)
    select v_id, i.articulo_id, sum(i.cantidad)
      from public.maestro_items i
     where i.evento_id = p_evento and i.zona_id = g.zona_id
       and i.seccion_id is not distinct from g.seccion_id
       and i.origen = 'almacen' and i.articulo_id is not null
     group by i.articulo_id;
    v_n := v_n + 1;
  end loop;

  update public.maestro set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_at = now()
   where evento_id = p_evento;

  return jsonb_build_object('ok', true, 'solicitudes', v_n,
    'mensaje', 'Documento cerrado: se enviaron ' || v_n || ' solicitudes aprobadas a almacén.');
end;
$$;

-- REABRIR: solo si almacén todavía no preparó nada de lo generado. Cancela las
-- solicitudes generadas para volver a crearlas al cerrar de nuevo.
create function public.reabrir_maestro(p_evento uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.es_admin() then
    raise exception 'Solo la organización reabre el documento maestro' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.maestro where evento_id = p_evento and estado = 'cerrado' for update;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'El documento no está cerrado.');
  end if;
  if exists (select 1 from public.solicitudes
              where evento_id = p_evento and origen = 'maestro' and estado in ('lista', 'entregada')) then
    return jsonb_build_object('ok', false, 'mensaje',
      'Almacén ya preparó o entregó equipo de este documento. Los cambios ahora se hacen con solicitudes.');
  end if;

  update public.solicitudes
     set estado = 'cancelada', motivo = 'Documento maestro reabierto', cerrado_por = auth.uid(), cerrado_at = now()
   where evento_id = p_evento and origen = 'maestro' and estado in ('pendiente', 'aprobada');
  get diagnostics v_n = row_count;

  update public.maestro set estado = 'borrador', cerrado_por = null, cerrado_at = null where evento_id = p_evento;
  return jsonb_build_object('ok', true,
    'mensaje', 'Documento reabierto. Se cancelaron ' || v_n || ' solicitudes generadas; se vuelven a crear al cerrar.');
end;
$$;

revoke execute on function public.cerrar_maestro(uuid) from public, anon;
revoke execute on function public.reabrir_maestro(uuid) from public, anon;
grant execute on function public.cerrar_maestro(uuid) to authenticated;
grant execute on function public.reabrir_maestro(uuid) to authenticated;
