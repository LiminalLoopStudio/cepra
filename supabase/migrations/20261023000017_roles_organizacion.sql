-- =============================================================================
-- CEPRA — Migración 17: roles del equipo de organización
--
-- Coordinación, Project Manager y Stage Manager. Tienen los mismos permisos
-- que el administrador (eso se define en la migración 18, porque un valor
-- nuevo de un enum no se puede usar en la misma migración que lo crea).
-- =============================================================================

alter type public.rol_usuario add value if not exists 'coordinacion';
alter type public.rol_usuario add value if not exists 'project_manager';
alter type public.rol_usuario add value if not exists 'stage_manager';
