-- =============================================================================
-- CEPRA — Limpieza de datos de prueba (se corre UNA vez, a mano)
--
-- NO es una migración: no está en supabase/migrations y `db push` no la corre.
-- Se pega completa en Supabase → SQL Editor → Run.
--
-- BORRA:
--   * Todo el historial de movimientos (la bitácora protegida).
--   * Todos los equipos, el stock por cantidad y todos los tipos del catálogo.
--   * Todas las empresas propietarias, excepto Gaming Partners.
--   * Las categorías agregadas a mano (las 11 de fábrica se quedan) y reinicia
--     sus consecutivos: el primer tipo de cada una vuelve a ser CN01, PT01…
--   * Los usuarios de prueba (correos que terminan en @cepra.test).
--
-- CONSERVA:
--   * Los demás usuarios (sus cuentas y contraseñas), con sus roles.
--   * Gaming Partners como propietario.
--   * Las 11 categorías de fábrica.
--
-- Todo ocurre en una sola transacción: si algo falla, no se borra nada.
-- =============================================================================

begin;

-- La bitácora no deja borrar ni vaciar (por diseño). Se apagan sus candados
-- solo dentro de esta transacción y se vuelven a encender al final.
alter table public.movimientos disable trigger movimientos_sin_update;
alter table public.movimientos disable trigger movimientos_sin_truncate;

-- Inventario completo (el orden importa por las referencias entre tablas).
truncate table
  public.movimientos,
  public.equipos,
  public.stock_cantidad,
  public.catalogo_articulos
restart identity;

alter table public.movimientos enable trigger movimientos_sin_update;
alter table public.movimientos enable trigger movimientos_sin_truncate;

-- Propietarios: solo queda Gaming Partners.
delete from public.propietarios where nombre <> 'Gaming Partners';

-- Categorías: quedan las 11 de fábrica, con sus consecutivos en 1.
delete from public.categorias
 where nombre not in (
   'Consola', 'Pantalla', 'PC', 'Laptop', 'Control', 'Periférico',
   'Cable', 'Adaptador', 'Extensión', 'Corriente', 'Consumible'
 );
update public.categorias set siguiente_numero = 1, activo = true;

-- Usuarios de prueba (su perfil en "usuarios" se borra en cascada).
delete from auth.users where email like '%@cepra.test';

commit;

-- -----------------------------------------------------------------------------
-- Verificación: debe dar 0 en todo menos propietarios (1), categorias (11)
-- y usuarios (los reales que conservaste).
-- -----------------------------------------------------------------------------
select 'movimientos'        as tabla, count(*) from public.movimientos
union all select 'equipos',            count(*) from public.equipos
union all select 'stock_cantidad',     count(*) from public.stock_cantidad
union all select 'catalogo_articulos', count(*) from public.catalogo_articulos
union all select 'propietarios',       count(*) from public.propietarios
union all select 'categorias',         count(*) from public.categorias
union all select 'usuarios',           count(*) from public.usuarios;
