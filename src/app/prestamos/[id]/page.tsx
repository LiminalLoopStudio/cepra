import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Préstamo" };

function fecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });
}

type Prestamo = {
  id: string;
  folio: number;
  created_at: string;
  notas: string | null;
  evento: { id: string; nombre: string } | null;
  zona: { nombre: string } | null;
  receptor: { nombre: string } | null;
  entregador: { nombre: string } | null;
};

type Item = {
  id: string;
  estado: "prestado" | "faltante" | "devuelto";
  cantidad: number;
  devuelto_cantidad: number;
  con_control: boolean;
  con_cables: boolean;
  falta_control: boolean;
  falta_cables: boolean;
  con_falla: boolean;
  devuelto_at: string | null;
  nota_devolucion: string | null;
  equipo: { id: string; etiqueta: string } | null;
  articulo: { nombre: string } | null;
};

const COLOR: Record<string, string> = {
  prestado: "bg-blue-500/15 text-blue-500",
  faltante: "bg-yellow-500/15 text-yellow-500",
  devuelto: "bg-green-500/15 text-green-500",
};
const TEXTO: Record<string, string> = { prestado: "Prestado", faltante: "Faltante", devuelto: "Devuelto" };

export default async function PrestamoPage({ params }: PageProps<"/prestamos/[id]">) {
  await requireUsuario();
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: prestamo }, { data: itemsData }] = await Promise.all([
    supabase
      .from("prestamos")
      .select(
        "id, folio, created_at, notas, evento:eventos(id, nombre), zona:zonas(nombre), receptor:usuarios!prestamos_receptor_id_fkey(nombre), entregador:usuarios!prestamos_entregado_por_fkey(nombre)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("v_prestamo_items")
      .select(
        "id, estado, cantidad, devuelto_cantidad, con_control, con_cables, falta_control, falta_cables, con_falla, devuelto_at, nota_devolucion, equipo:equipos(id, etiqueta), articulo:catalogo_articulos(nombre)",
      )
      .eq("prestamo_id", id),
  ]);
  if (!prestamo) notFound();
  const p = prestamo as unknown as Prestamo;
  const items = (itemsData ?? []) as unknown as Item[];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/prestamos" className="text-sm text-muted hover:text-foreground">
          ← Préstamos
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          Préstamo <span className="font-mono">#{p.folio}</span>
        </h1>
        <p className="text-sm text-muted">
          {p.receptor?.nombre} · {p.zona ? `Zona ${p.zona.nombre} · ` : ""}
          {p.evento?.nombre} · firmado con PIN el {fecha(p.created_at)} · entregó {p.entregador?.nombre}
        </p>
        {p.notas ? <p className="mt-2 text-sm">{p.notas}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-foreground/10">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-foreground/5 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Pieza / artículo</th>
              <th className="px-4 py-2 font-medium">Accesorios</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Regresó</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/10">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2">
                  {i.equipo ? (
                    <Link href={`/equipos/${i.equipo.id}`} className="font-mono text-brand hover:underline">
                      {i.equipo.etiqueta}
                    </Link>
                  ) : (
                    <span className="font-medium">{i.cantidad} ×</span>
                  )}{" "}
                  {i.articulo?.nombre}
                  {i.con_falla ? <span className="ml-2 text-xs text-red-500">regresó con falla</span> : null}
                  {i.nota_devolucion ? <span className="block text-xs text-muted">{i.nota_devolucion}</span> : null}
                </td>
                <td className="px-4 py-2 text-xs">
                  {i.con_control ? (
                    <span className={i.falta_control && i.devuelto_at ? "text-yellow-500" : ""}>
                      control{i.falta_control && i.devuelto_at ? " (falta)" : ""}
                    </span>
                  ) : null}
                  {i.con_control && i.con_cables ? " · " : null}
                  {i.con_cables ? (
                    <span className={i.falta_cables && i.devuelto_at ? "text-yellow-500" : ""}>
                      cables{i.falta_cables && i.devuelto_at ? " (faltan)" : ""}
                    </span>
                  ) : null}
                  {!i.con_control && !i.con_cables ? "—" : null}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${COLOR[i.estado]}`}>
                    {TEXTO[i.estado]}
                    {!i.equipo && i.estado === "prestado" && i.devuelto_cantidad > 0
                      ? ` (${i.devuelto_cantidad} de ${i.cantidad} regresaron)`
                      : ""}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-muted">{fecha(i.devuelto_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
