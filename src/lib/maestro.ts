import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Origen } from "./maestro-textos";

export type InventarioArticulo = {
  articulo_id: string;
  codigo_tipo: string;
  nombre: string;
  categoria: string;
  serializado: boolean;
  consumo_w: number | null;
  activo: boolean;
  total_almacen: number;
  disponible: number;
};

export type Persona = { id: string; nombre: string; rol: string };

export type SeccionMaestro = {
  id: string;
  nombre: string;
  lider: Persona | null;
  staff: Persona[];
};

export type ZonaMaestro = {
  id: string;
  nombre: string;
  lider: Persona | null;
  staff: Persona[]; // sin sección
  secciones: SeccionMaestro[];
};

export type RenglonMaestro = {
  id: string;
  zona_id: string;
  seccion_id: string | null;
  articulo_id: string | null;
  descripcion: string | null;
  cantidad: number;
  origen: Origen;
  consumo_w: number | null;
  notas: string | null;
};

export type DatosMaestro = {
  evento: { id: string; nombre: string; lugar: string | null; fecha_inicio: string; fecha_fin: string; estado: string };
  estado: "borrador" | "cerrado";
  cerradoAt: string | null;
  cerradoPor: string | null;
  zonas: ZonaMaestro[];
  renglones: RenglonMaestro[];
  inventario: InventarioArticulo[];
  solicitudes: { estado: string; n: number }[];
};

type ZonaFila = {
  id: string;
  nombre: string;
  lider: Persona | null;
  secciones: { id: string; nombre: string; lider: Persona | null }[];
  staff: { seccion_id: string | null; usuario: Persona | null }[];
};

export async function cargarMaestro(eventoId: string): Promise<DatosMaestro | null> {
  const supabase = await createClient();
  const [{ data: evento }, { data: m }, { data: zonasData }, { data: items }, { data: inv }, { data: sols }] =
    await Promise.all([
      supabase.from("eventos").select("id, nombre, lugar, fecha_inicio, fecha_fin, estado").eq("id", eventoId).maybeSingle(),
      supabase
        .from("maestro")
        .select("estado, cerrado_at, cerrador:usuarios!maestro_cerrado_por_fkey(nombre)")
        .eq("evento_id", eventoId)
        .maybeSingle(),
      supabase
        .from("zonas")
        .select(
          "id, nombre, lider:usuarios!zonas_lider_id_fkey(id, nombre, rol), secciones(id, nombre, lider:usuarios!secciones_lider_id_fkey(id, nombre, rol)), staff:zona_staff(seccion_id, usuario:usuarios(id, nombre, rol))",
        )
        .eq("evento_id", eventoId)
        .order("nombre"),
      supabase
        .from("maestro_items")
        .select("id, zona_id, seccion_id, articulo_id, descripcion, cantidad, origen, consumo_w, notas")
        .eq("evento_id", eventoId)
        .order("created_at"),
      supabase.from("v_inventario_articulo").select("*").order("nombre"),
      supabase.from("solicitudes").select("estado").eq("evento_id", eventoId).eq("origen", "maestro"),
    ]);
  if (!evento) return null;

  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre);
  const zonas: ZonaMaestro[] = ((zonasData ?? []) as unknown as ZonaFila[]).map((z) => ({
    id: z.id,
    nombre: z.nombre,
    lider: z.lider,
    staff: z.staff.filter((s) => !s.seccion_id && s.usuario).map((s) => s.usuario!).sort(porNombre),
    secciones: z.secciones
      .map((sec) => ({
        id: sec.id,
        nombre: sec.nombre,
        lider: sec.lider,
        staff: z.staff.filter((s) => s.seccion_id === sec.id && s.usuario).map((s) => s.usuario!).sort(porNombre),
      }))
      .sort(porNombre),
  }));

  const conteo = new Map<string, number>();
  for (const s of sols ?? []) conteo.set(s.estado, (conteo.get(s.estado) ?? 0) + 1);

  const cerrador = (m as unknown as { cerrador: { nombre: string } | null } | null)?.cerrador;
  return {
    evento,
    estado: (m?.estado as "borrador" | "cerrado") ?? "borrador",
    cerradoAt: m?.cerrado_at ?? null,
    cerradoPor: cerrador?.nombre ?? null,
    zonas,
    renglones: (items ?? []) as RenglonMaestro[],
    inventario: (inv ?? []) as InventarioArticulo[],
    solicitudes: [...conteo].map(([estado, n]) => ({ estado, n })),
  };
}

// Balance por artículo: cuánto hay en almacén, cuánto se asigna de almacén y
// cuánto viene de fuera (compra, renta, patrocinio).
export type Balance = {
  clave: string;
  articulo_id: string | null;
  codigo: string;
  nombre: string;
  categoria: string;
  consumo_w: number;
  total_almacen: number | null; // null = no está en catálogo
  disponible: number | null;
  asignado: number; // de almacén
  compra: number;
  renta: number;
  patrocinio: number;
  porZona: Map<string, number>; // zona_id → total (todas las fuentes)
};

export function calcularBalance(d: DatosMaestro): Balance[] {
  const inv = new Map(d.inventario.map((a) => [a.articulo_id, a]));
  const mapa = new Map<string, Balance>();
  for (const r of d.renglones) {
    const a = r.articulo_id ? inv.get(r.articulo_id) : undefined;
    const clave = r.articulo_id ?? `libre:${(r.descripcion ?? "").trim().toLowerCase()}`;
    let b = mapa.get(clave);
    if (!b) {
      b = {
        clave,
        articulo_id: r.articulo_id,
        codigo: a?.codigo_tipo ?? "—",
        nombre: a?.nombre ?? r.descripcion ?? "",
        categoria: a?.categoria ?? "Fuera de catálogo",
        consumo_w: (a ? a.consumo_w : r.consumo_w) ?? 0,
        total_almacen: a ? a.total_almacen : null,
        disponible: a ? a.disponible : null,
        asignado: 0,
        compra: 0,
        renta: 0,
        patrocinio: 0,
        porZona: new Map(),
      };
      mapa.set(clave, b);
    }
    if (r.origen === "almacen") b.asignado += r.cantidad;
    else b[r.origen] += r.cantidad;
    b.porZona.set(r.zona_id, (b.porZona.get(r.zona_id) ?? 0) + r.cantidad);
  }
  return [...mapa.values()].sort(
    (x, y) => x.categoria.localeCompare(y.categoria) || x.nombre.localeCompare(y.nombre),
  );
}

export function consumoRenglon(r: RenglonMaestro, inv: Map<string, InventarioArticulo>) {
  const w = r.articulo_id ? (inv.get(r.articulo_id)?.consumo_w ?? 0) : (r.consumo_w ?? 0);
  return w * r.cantidad;
}
