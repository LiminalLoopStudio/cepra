-- =============================================================================
-- CEPRA — Migración 6: permisos para la llave secreta (rol service_role)
--
-- El proyecto se creó con "Automatically expose new tables" DESACTIVADO, así
-- que ni siquiera service_role (la llave secreta del servidor) recibió
-- permisos sobre nuestras tablas. service_role se salta las reglas RLS, pero
-- igual necesita GRANT. Sin esto, la pantalla de Usuarios falla con
-- "permission denied for table usuarios".
--
-- Es seguro: service_role solo se usa en el servidor (src/lib/supabase/admin.ts)
-- y siempre después de verificar que quien pide la acción es administrador.
-- Las reglas de la bitácora (movimientos inmutable) siguen aplicando porque
-- son triggers, no permisos.
-- =============================================================================

grant usage on schema public to service_role;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tablas, secuencias y funciones que se creen en migraciones futuras.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
