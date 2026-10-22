-- =============================================================================
-- CEPRA — Migración 6: edición de usuarios por el administrador
--
-- Las ALTAS de usuario las hace el servidor con la llave secreta de Supabase
-- (crea el login en auth.users y el trigger de la migración 2 crea el perfil).
-- Aquí habilitamos que el administrador EDITE perfiles desde la app:
-- nombre, rol y activo. Nada más.
--
-- Reglas que protege la base de datos (aunque falle la app):
--   1. Nadie puede quitarse a sí mismo el rol de administrador ni desactivarse.
--   2. Siempre debe quedar al menos un administrador activo.
-- =============================================================================

-- Solo estas tres columnas son editables desde la app.
grant update (nombre, rol, activo) on public.usuarios to authenticated;

create policy "usuarios: edición por administrador"
  on public.usuarios
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- -----------------------------------------------------------------------------
-- Protección de administradores
-- -----------------------------------------------------------------------------
create function public.tg_usuarios_proteger_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo nos importa si cambió el rol o el estado activo.
  if new.rol = old.rol and new.activo = old.activo then
    return new;
  end if;

  -- Regla 1: no te puedes degradar ni desactivar a ti mismo.
  -- (auth.uid() es null cuando el cambio viene del servidor con llave secreta.)
  if old.id = (select auth.uid())
     and (new.rol <> old.rol or new.activo <> old.activo) then
    raise exception 'No puedes cambiar tu propio rol ni desactivarte'
      using errcode = 'check_violation';
  end if;

  -- Regla 2: si este usuario deja de ser administrador activo,
  -- debe quedar otro administrador activo.
  if old.rol = 'administrador' and old.activo
     and (new.rol <> 'administrador' or not new.activo) then
    -- Bloqueo para que dos cambios simultáneos no dejen el sistema sin admin.
    perform pg_advisory_xact_lock(hashtext('cepra_usuarios_admin'));

    if not exists (
      select 1 from public.usuarios u
       where u.rol = 'administrador' and u.activo and u.id <> old.id
    ) then
      raise exception 'Debe quedar al menos un administrador activo'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.tg_usuarios_proteger_admin() from public, anon, authenticated;

create trigger usuarios_proteger_admin
  before update on public.usuarios
  for each row execute function public.tg_usuarios_proteger_admin();
