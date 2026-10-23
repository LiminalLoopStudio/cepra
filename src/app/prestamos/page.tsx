import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Préstamos" };

type Item = {
  prestamo_id: string;
  folio: number;
  entregado_at: string;
  estado: "prestado" | "faltante" | "devuelto";
  cantidad: number;
  pendiente: number;
  equipo: { etiqueta: string } | null;
  articulo: { nombre: string } | null;
  receptor: { nombre: string } | null;
  zona: { nombre: string } | null;
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });
}

const ESTADOS: Record<string, string> = {
  abiertos: "Con algo pendiente",
  faltantes: "Con faltantes de control o cables",
  todos: "Todos",
};

export default async function PrestamosPage({ searchParams }: PageProps<"/prestamos">) {
  const yo = await requireUsuario();
  const params = await searchParams;
  const ver = typeof params.ver === "string" && params.ver in ESTADOS ? params.ver : "abiertos";
  const evento = typeof params.evento === "string" ? params.evento : "";
  const verTodo = yo.rol === "administrador" || yo.rol === "almacenista";

  const supabase = await createClient();
  const { data: eventos } = await supabase.from("eventos").select("id, nombre, estado").order("fecha_inicio", { ascending: false });
  const activo = (eventos ?? []).find((e) => e.estado === "activo");
  const eventoId = evento || activo?.id || "";

  // RLS: almacén y admin ven todo; el líder lo de su zona; cada quien lo suyo.
  let consulta = supabase
    .from("v_prestamo_items")
    .select(
      "prestamo_id, folio, entregado_at, estado, cantidad, pendiente, equipo:equipos(etiqueta), articulo:catalogo_articulos(nombre), receptor:usuarios!prestamos_receptor_id_fkey(nombre), zona:zonas(nombre)",
    )
    .order("entregado_at", { ascending: false })
    .limit(2000);
  if (eventoId && eventoId !== "todos") consulta = consulta.eq("evento_id", eventoId);
  const { data, error } = await consulta;
  const items = (data ?? []) as unknown as Item[];

  // Agrupar por préstamo.
  const grupos = new Map<string, Item[]>();
  for (const i of items) grupos.set(i.prestamo_id, [...(grupos.get(i.prestamo_id) ?? []), i]);
  const prestamos = [...grupos.values()].filter((g) =>
    ver === "todos" ? true : ver === "faltantes" ? g.some((i) => i.estado === "faltante") : g.some((i) => i.estado !== "devuelto"),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{verTodo ? "Préstamos" : "Mis préstamos"}</h1>
          <p className="text-sm text-muted">
            {verTodo
              ? "Todo lo entregado: quién lo tiene, qué falta por regresar."
              : yo.rol === "lider"
                ? "Lo que tienes tú y lo que tiene el staff de tu zona."
                : "El equipo que tienes a tu nombre."}
          </p>
        </div>
        {verTodo ? (
          <div className="flex gap-3">
            <Link href="/entregas" className="flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white">
              Entregar
            </Link>
            <Link href="/devoluciones" className="flex h-10 items-center rounded-lg border border-foreground/15 px-4 text-sm font-medium hover:border-brand">
              Recibir
            </Link>
          </div>
        ) : null}
      </div>

      <form action="/prestamos" className="flex flex-wrap items-center gap-2">
        <select name="ver" defaultValue={ver} className="h-10 rounded-lg border border-foreground/15 bg-background px-3 text-sm">
          {Object.entries(ESTADOS).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <select name="evento" defaultValue={eventoId || "todos"} className="h-10 rounded-lg border border-foreground/15 bg-background px-3 text-sm">
          <option value="todos">Todos los eventos</option>
          {(eventos ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
              {e.estado === "activo" ? " (activo)" : ""}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-lg border border-foreground/15 px-4 text-sm hover:border-brand">
          Ver
        </button>
      </form>

      {error ? (
        <p className="text-sm text-red-500">No se pudieron cargar: {error.message}</p>
      ) : prestamos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
          No hay préstamos con ese filtro.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {prestamos.map((g) => {
            const p = g[0];
            const prestado = g.filter((i) => i.estado === "prestado");
            const faltante = g.filter((i) => i.estado === "faltante");
            return (
              <li key={p.prestamo_id}>
                <Link
                  href={`/prestamos/${p.prestamo_id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-foreground/10 px-4 py-3 hover:border-brand"
                >
                  <div>
                    <p className="font-semibold">
                      <span className="font-mono text-muted">#{p.folio}</span> {p.receptor?.nombre}
                      {p.zona ? <span className="ml-2 text-sm font-normal text-muted">Zona {p.zona.nombre}</span> : null}
                    </p>
                    <p className="text-sm text-muted">
                      {fecha(p.entregado_at)} ·{" "}
                      {g
                        .map((i) => (i.equipo ? i.equipo.etiqueta : `${i.cantidad} × ${i.articulo?.nombre ?? ""}`))
                        .slice(0, 4)
                        .join(", ")}
                      {g.length > 4 ? ` y ${g.length - 4} más` : ""}
                    </p>
                  </div>
                  <span className="flex flex-wrap gap-2 text-xs font-medium">
                    {prestado.length > 0 ? (
                      <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-blue-500">{prestado.length} pendientes</span>
                    ) : null}
                    {faltante.length > 0 ? (
                      <span className="rounded-full bg-yellow-500/15 px-2.5 py-1 text-yellow-500">{faltante.length} con faltantes</span>
                    ) : null}
                    {prestado.length === 0 && faltante.length === 0 ? (
                      <span className="rounded-full bg-green-500/15 px-2.5 py-1 text-green-500">Devuelto</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
