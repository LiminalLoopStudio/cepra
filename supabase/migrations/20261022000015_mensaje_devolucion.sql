-- =============================================================================
-- CEPRA — Migración 15: mensaje más claro al recibir equipo
-- (Solo cambia el texto que responde registrar_devolucion.)
-- =============================================================================

create or replace function public.registrar_devolucion(p_items jsonb, p_notas text default null)
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
    'mensaje', 'Recibido: ' || array_to_string(array_remove(array[
        case when v_piezas > 0 then v_piezas || case when v_piezas = 1 then ' pieza' else ' piezas' end end,
        case when v_unid > 0 then v_unid || case when v_unid = 1 then ' unidad' else ' unidades' end end,
        case when v_acc > 0 then 'accesorios que faltaban de ' || v_acc || case when v_acc = 1 then ' pieza' else ' piezas' end end
      ], null), ', ') ||
      case when v_falt > 0 then '. Ojo: ' || v_falt || case when v_falt = 1 then ' pieza llegó' else ' piezas llegaron' end || ' sin control o cables.' else '.' end);
end;
$$;

