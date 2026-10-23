import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ArticuloOpcion } from "./formulario";

// Tipos activos del catálogo con cuántos hay disponibles (solo informativo:
// almacén confirma al preparar).
export async function articulosParaSolicitar(): Promise<ArticuloOpcion[]> {
  const supabase = await createClient();
  const [{ data: articulos }, { data: piezas }, { data: stock }] = await Promise.all([
    supabase.from("catalogo_articulos").select("id, nombre, categoria, serializado").eq("activo", true).order("nombre"),
    supabase.from("equipos").select("articulo_id").eq("estado_operativo", "disponible").limit(10000),
    supabase.from("v_stock_cantidad").select("articulo_id, disponible"),
  ]);

  const libres = new Map<string, number>();
  for (const p of piezas ?? []) libres.set(p.articulo_id, (libres.get(p.articulo_id) ?? 0) + 1);
  for (const s of stock ?? []) libres.set(s.articulo_id as string, Number(s.disponible ?? 0));

  return (articulos ?? []).map((a) => ({
    id: a.id,
    nombre: a.nombre,
    categoria: a.categoria,
    serializado: a.serializado,
    disponibles: libres.get(a.id) ?? 0,
  }));
}
