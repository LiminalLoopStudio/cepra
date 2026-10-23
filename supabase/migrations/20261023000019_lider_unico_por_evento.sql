-- =============================================================================
-- CEPRA — Migración 19: una persona solo lidera UN lugar por evento
--
-- En un mismo evento, alguien puede ser líder de una zona O de una sección,
-- pero no de dos lugares. Se revisa al asignar o cambiar líder (no toca los
-- datos que ya existían).
-- =============================================================================

create function public.tg_lider_unico_por_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento uuid;
  v_nombre text;
  v_lugar  text;
begin
  if new.lider_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.lider_id is not distinct from old.lider_id then
    return new;
  end if;

  if tg_table_name = 'zonas' then
    v_evento := new.evento_id;
  else
    select z.evento_id into v_evento from public.zonas z where z.id = new.zona_id;
  end if;

  -- Evita que dos asignaciones al mismo tiempo se cuelen.
  perform pg_advisory_xact_lock(hashtext('cepra_lider_' || v_evento::text));

  select 'la zona ' || z.nombre into v_lugar
    from public.zonas z
   where z.evento_id = v_evento and z.lider_id = new.lider_id
     and (tg_table_name <> 'zonas' or z.id <> new.id)
   limit 1;

  if v_lugar is null then
    select 'la sección ' || s.nombre || ' (zona ' || z.nombre || ')' into v_lugar
      from public.secciones s
      join public.zonas z on z.id = s.zona_id
     where z.evento_id = v_evento and s.lider_id = new.lider_id
       and (tg_table_name <> 'secciones' or s.id <> new.id)
     limit 1;
  end if;

  if v_lugar is not null then
    select nombre into v_nombre from public.usuarios where id = new.lider_id;
    raise exception '% ya es líder de % en este evento. Una persona solo puede liderar un lugar por evento.',
      coalesce(v_nombre, 'Esa persona'), v_lugar;
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_lider_unico_por_evento() from public, anon, authenticated;

create trigger zonas_lider_unico
  before insert or update of lider_id on public.zonas
  for each row execute function public.tg_lider_unico_por_evento();

create trigger secciones_lider_unico
  before insert or update of lider_id on public.secciones
  for each row execute function public.tg_lider_unico_por_evento();
