-- =============================================================================
-- CEPRA — Migración 7: etiquetas de accesorios (control y cables originales)
--
-- Algunos tipos (consolas) traen un control y un juego de cables originales
-- que viajan siempre con su equipo. Cada uno lleva su propia etiqueta QR:
--   GP-XBS-0001        equipo
--   GP-XBS-0001-C      caja
--   GP-XBS-0001-CTRL   control
--   GP-XBS-0001-CBL    juego de cables originales (HDMI + corriente)
--
-- Se decide por TIPO en el catálogo y se fija en cada pieza al darla de alta,
-- para que las etiquetas ya impresas nunca cambien aunque el catálogo cambie.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo: ¿este tipo trae control / cables originales?
-- -----------------------------------------------------------------------------
alter table public.catalogo_articulos
  add column lleva_control boolean not null default false,
  add column lleva_cables  boolean not null default false;

comment on column public.catalogo_articulos.lleva_control is
  'Cada pieza de este tipo trae un control con etiqueta propia (-CTRL).';
comment on column public.catalogo_articulos.lleva_cables is
  'Cada pieza de este tipo trae un juego de cables originales con etiqueta propia (-CBL).';

-- -----------------------------------------------------------------------------
-- Equipos: etiquetas de accesorios (null = esa pieza no lo trae)
-- No hay permiso de escritura desde la app: las pone el trigger de alta.
-- -----------------------------------------------------------------------------
alter table public.equipos
  add column etiqueta_control text unique,
  add column etiqueta_cables  text unique;

-- -----------------------------------------------------------------------------
-- Alta: además del número, asigna las etiquetas de accesorios según el tipo.
-- -----------------------------------------------------------------------------
create or replace function public.tg_equipos_asignar_etiqueta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo      text;
  v_serializado boolean;
  v_activo      boolean;
  v_control     boolean;
  v_cables      boolean;
  v_numero      integer;
begin
  update public.catalogo_articulos
     set siguiente_numero = siguiente_numero + 1
   where id = new.articulo_id
  returning codigo_tipo, serializado, activo, lleva_control, lleva_cables, siguiente_numero - 1
       into v_codigo, v_serializado, v_activo, v_control, v_cables, v_numero;

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
  new.etiqueta_control := case when v_control then new.etiqueta || '-CTRL' end;
  new.etiqueta_cables  := case when v_cables  then new.etiqueta || '-CBL'  end;
  -- Toda pieza nueva arranca sin validar y sin responsable.
  new.estado_operativo := 'por_validar';
  new.responsable_id := null;
  new.etiquetas_validadas_at := null;
  return new;
end;
$$;

revoke execute on function public.tg_equipos_asignar_etiqueta() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Las etiquetas de accesorios tampoco cambian después del alta.
-- -----------------------------------------------------------------------------
create or replace function public.tg_equipos_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.etiqueta is distinct from old.etiqueta
     or new.etiqueta_control is distinct from old.etiqueta_control
     or new.etiqueta_cables is distinct from old.etiqueta_cables then
    raise exception 'Las etiquetas no se pueden modificar' using errcode = 'check_violation';
  end if;
  if new.articulo_id is distinct from old.articulo_id then
    raise exception 'El tipo de una pieza no se puede modificar' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Validación: si escanean la etiqueta de un accesorio, decirlo claro.
-- (Se valida equipo ↔ caja; control y cables se revisan en entrega/devolución.)
-- -----------------------------------------------------------------------------
create or replace function public.validar_etiquetas(p_codigo_a text, p_codigo_b text)
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

  if a like '%-CTRL' or a like '%-CBL' or b like '%-CTRL' or b like '%-CBL' then
    return jsonb_build_object('nivel', 'error',
      'mensaje', 'Esa es la etiqueta de un control o de cables. Aquí se escanean equipo y caja');
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
