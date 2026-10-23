-- =============================================================================
-- CEPRA — Limpieza de datos de prueba (se corre UNA vez, a mano)
--
-- NO es una migración: no está en supabase/migrations y `db push` no la corre.
-- Se pega completa en Supabase → SQL Editor → Run.
--
-- BORRA:
--   * Solicitudes, préstamos, entregas y devoluciones, y todo el historial de movimientos.
--   * Todos los equipos, el stock por cantidad y todos los tipos del catálogo.
--   * Eventos, zonas y staff asignado.
--   * Cuentas de plataformas y compras (con el registro de sus archivos).
--   * Empresas propietarias, excepto Gaming Partners.
--   * Categorías y clasificaciones agregadas a mano (las de fábrica se quedan)
--     y reinicia los consecutivos: el primer tipo de cada categoría será CN01, PT01…
--   * Los usuarios de prueba (correos que terminan en @cepra.test).
--
-- CONSERVA:
--   * Los demás usuarios con su rol, contraseña, credencial y PIN.
--   * Gaming Partners, las 11 categorías y las 9 clasificaciones de fábrica.
--
-- DESPUÉS, A MANO: Supabase → Storage → bucket "compras" → selecciona todo →
-- Delete (Supabase no deja borrar archivos desde SQL).
--
-- Todo ocurre en una sola transacción: si algo falla, no se borra nada.
-- =============================================================================

begin;

-- La bitácora no deja borrar ni vaciar (por diseño). Se apagan sus candados
-- solo dentro de esta transacción y se vuelven a encender al final.
alter table public.movimientos disable trigger movimientos_sin_update;
alter table public.movimientos disable trigger movimientos_sin_truncate;

truncate table
  public.solicitud_reservas,
  public.solicitud_items,
  public.solicitudes,
  public.movimientos,
  public.prestamo_items,
  public.prestamos,
  public.compra_archivos,
  public.compras,
  public.cuentas,
  public.equipos,
  public.stock_cantidad,
  public.catalogo_articulos,
  public.zona_staff,
  public.zonas,
  public.eventos
restart identity;

alter table public.movimientos enable trigger movimientos_sin_update;
alter table public.movimientos enable trigger movimientos_sin_truncate;

-- Propietarios: solo queda Gaming Partners.
delete from public.propietarios where nombre <> 'Gaming Partners';

-- Categorías de fábrica, con sus consecutivos en 1.
delete from public.categorias
 where nombre not in (
   'Consola', 'Pantalla', 'PC', 'Laptop', 'Control', 'Periférico',
   'Cable', 'Adaptador', 'Extensión', 'Corriente', 'Consumible'
 );
update public.categorias set siguiente_numero = 1, activo = true;

-- Clasificaciones de cuentas de fábrica.
delete from public.plataformas
 where nombre not in ('Steam', 'Epic Games', 'PlayStation', 'Nintendo', 'Oculus VR', 'Xbox', 'Riot', 'Móvil', 'Otros');
update public.plataformas set activo = true;

-- Usuarios de prueba (su perfil, credencial y PIN se borran en cascada).
delete from auth.users where email like '%@cepra.test';

commit;

-- -----------------------------------------------------------------------------
-- Verificación: 0 en todo, excepto propietarios (1), categorias (11),
-- plataformas (9) y usuarios (los reales que conservaste).
-- -----------------------------------------------------------------------------
select 'movimientos'        as tabla, count(*) from public.movimientos
union all select 'solicitudes',        count(*) from public.solicitudes
union all select 'prestamos',          count(*) from public.prestamos
union all select 'equipos',            count(*) from public.equipos
union all select 'catalogo_articulos', count(*) from public.catalogo_articulos
union all select 'eventos',            count(*) from public.eventos
union all select 'cuentas',            count(*) from public.cuentas
union all select 'compras',            count(*) from public.compras
union all select 'propietarios',       count(*) from public.propietarios
union all select 'categorias',         count(*) from public.categorias
union all select 'plataformas',        count(*) from public.plataformas
union all select 'usuarios',           count(*) from public.usuarios;
