-- =============================================================================
-- CEPRA — Migración 9: contraseña temporal
--
-- El administrador da (o restablece) una contraseña TEMPORAL. Al entrar, la
-- app obliga a la persona a crear la suya antes de usar cualquier pantalla.
-- La marca la cambia solo el servidor (llave secreta), nunca la app del usuario.
-- =============================================================================

alter table public.usuarios
  add column debe_cambiar_contrasena boolean not null default true;

comment on column public.usuarios.debe_cambiar_contrasena is
  'true = tiene una contraseña temporal puesta por el administrador y debe cambiarla al entrar.';

-- Usuarios que ya existían: quien ya entró alguna vez conserva su contraseña;
-- quien nunca ha entrado tendrá que cambiar la temporal la primera vez.
update public.usuarios u
   set debe_cambiar_contrasena = false
  from auth.users a
 where a.id = u.id
   and a.last_sign_in_at is not null;
