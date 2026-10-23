-- =============================================================================
-- CEPRA — Migración 13: credencial QR y PIN de firma
--
-- Cada persona tiene:
--   * Una CREDENCIAL: código único (GPU-XXXXXXXXXX) que va en un QR. En el
--     almacén se escanea para saber quién recibe o devuelve equipo.
--   * Un PIN de 4 a 6 dígitos con el que FIRMA lo que recibe. Se guarda
--     cifrado (bcrypt); 5 intentos fallidos lo bloquean 15 minutos.
-- Ninguno de los dos se puede leer desde la app: solo con funciones del
-- servidor. Si alguien pierde su credencial, el admin genera otra (la vieja
-- deja de servir); si olvida su PIN, el admin lo borra y la persona pone uno nuevo.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create function public.nuevo_codigo_credencial()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'GPU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

create table public.usuario_firma (
  usuario_id          uuid primary key references public.usuarios (id) on delete cascade,
  credencial          text not null unique default public.nuevo_codigo_credencial(),
  pin_hash            text,
  pin_intentos        integer not null default 0,
  pin_bloqueado_hasta timestamptz,
  pin_actualizado_at  timestamptz,
  credencial_at       timestamptz not null default now()
);

comment on table public.usuario_firma is
  'Credencial QR y PIN (bcrypt) de cada usuario. Sin acceso directo desde la app.';

-- Nadie la lee ni escribe desde la app (solo funciones y la llave secreta).
alter table public.usuario_firma enable row level security;
revoke all on public.usuario_firma from anon, authenticated;

-- Todo usuario tiene su fila (los de antes y los nuevos).
insert into public.usuario_firma (usuario_id) select id from public.usuarios on conflict do nothing;

create function public.tg_usuario_firma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuario_firma (usuario_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger usuarios_firma
  after insert on public.usuarios
  for each row execute function public.tg_usuario_firma();

revoke execute on function public.tg_usuario_firma() from public, anon, authenticated;
revoke execute on function public.nuevo_codigo_credencial() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Verificar un PIN (uso interno: lo llamarán entrega y devolución).
-- Devuelve 'ok' | 'incorrecto' | 'bloqueado' | 'sin_pin'. NO lanza error en un
-- PIN incorrecto: así el contador de intentos sí se guarda.
-- -----------------------------------------------------------------------------
create function public.verificar_pin(p_usuario uuid, p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.usuario_firma%rowtype;
begin
  select * into f from public.usuario_firma where usuario_id = p_usuario for update;
  if not found or f.pin_hash is null then
    return 'sin_pin';
  end if;
  if f.pin_bloqueado_hasta is not null and f.pin_bloqueado_hasta > now() then
    return 'bloqueado';
  end if;

  if extensions.crypt(coalesce(p_pin, ''), f.pin_hash) = f.pin_hash then
    update public.usuario_firma
       set pin_intentos = 0, pin_bloqueado_hasta = null
     where usuario_id = p_usuario;
    return 'ok';
  end if;

  if f.pin_intentos + 1 >= 5 then
    update public.usuario_firma
       set pin_intentos = 0, pin_bloqueado_hasta = now() + interval '15 minutes'
     where usuario_id = p_usuario;
    return 'bloqueado';
  end if;
  update public.usuario_firma set pin_intentos = pin_intentos + 1 where usuario_id = p_usuario;
  return 'incorrecto';
end;
$$;

revoke execute on function public.verificar_pin(uuid, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lo mío: credencial y si ya tengo PIN.
-- -----------------------------------------------------------------------------
create function public.mi_firma()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'credencial', f.credencial,
    'tiene_pin', f.pin_hash is not null,
    'bloqueado_hasta', case when f.pin_bloqueado_hasta > now() then f.pin_bloqueado_hasta end
  )
  from public.usuario_firma f
  where f.usuario_id = auth.uid();
$$;

-- Poner o cambiar MI PIN. Para cambiarlo hay que dar el actual.
create function public.establecer_mi_pin(p_pin text, p_pin_actual text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tiene boolean;
  v_check text;
begin
  if v_uid is null then
    raise exception 'Sin sesión' using errcode = 'insufficient_privilege';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'mensaje', 'El PIN debe tener de 4 a 6 números.');
  end if;
  if p_pin ~ '^(.)\1+$' or p_pin in ('1234', '12345', '123456', '4321', '54321', '654321', '0123', '01234', '012345') then
    return jsonb_build_object('ok', false, 'mensaje', 'Ese PIN es muy fácil de adivinar. Elige otro.');
  end if;

  select pin_hash is not null into v_tiene from public.usuario_firma where usuario_id = v_uid;
  if v_tiene then
    v_check := public.verificar_pin(v_uid, p_pin_actual);
    if v_check = 'bloqueado' then
      return jsonb_build_object('ok', false, 'mensaje', 'PIN bloqueado por intentos fallidos. Espera 15 minutos o pide al admin que lo restablezca.');
    elsif v_check <> 'ok' then
      return jsonb_build_object('ok', false, 'mensaje', 'El PIN actual no es correcto.');
    end if;
  end if;

  update public.usuario_firma
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
         pin_intentos = 0, pin_bloqueado_hasta = null, pin_actualizado_at = now()
   where usuario_id = v_uid;

  return jsonb_build_object('ok', true, 'mensaje', case when v_tiene then 'PIN cambiado.' else 'PIN guardado.' end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Administrador: borrar el PIN de alguien (lo olvidó) o darle credencial nueva.
-- -----------------------------------------------------------------------------
create function public.admin_restablecer_pin(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador' using errcode = 'insufficient_privilege';
  end if;
  update public.usuario_firma
     set pin_hash = null, pin_intentos = 0, pin_bloqueado_hasta = null, pin_actualizado_at = now()
   where usuario_id = p_usuario;
end;
$$;

create function public.admin_nueva_credencial(p_usuario uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador' using errcode = 'insufficient_privilege';
  end if;
  update public.usuario_firma
     set credencial = public.nuevo_codigo_credencial(), credencial_at = now()
   where usuario_id = p_usuario
  returning credencial into v;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Almacén: ¿de quién es esta credencial? (al escanearla en entrega/devolución)
-- -----------------------------------------------------------------------------
create function public.buscar_por_credencial(p_codigo text)
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

  -- Zona en el evento activo (como líder o como staff).
  select z.nombre into v_zona
    from public.zonas z
    join public.eventos e on e.id = z.evento_id and e.estado = 'activo'
   where z.lider_id = r.id
      or exists (select 1 from public.zona_staff s where s.zona_id = z.id and s.usuario_id = r.id)
   limit 1;

  return jsonb_build_object(
    'encontrado', true,
    'id', r.id, 'nombre', r.nombre, 'rol', r.rol, 'activo', r.activo,
    'tiene_pin', r.tiene_pin, 'bloqueado', r.bloqueado, 'zona', v_zona
  );
end;
$$;

revoke execute on function public.mi_firma() from public, anon;
revoke execute on function public.establecer_mi_pin(text, text) from public, anon;
revoke execute on function public.admin_restablecer_pin(uuid) from public, anon;
revoke execute on function public.admin_nueva_credencial(uuid) from public, anon;
revoke execute on function public.buscar_por_credencial(text) from public, anon;
grant execute on function public.mi_firma() to authenticated;
grant execute on function public.establecer_mi_pin(text, text) to authenticated;
grant execute on function public.admin_restablecer_pin(uuid) to authenticated;
grant execute on function public.admin_nueva_credencial(uuid) to authenticated;
grant execute on function public.buscar_por_credencial(text) to authenticated;
