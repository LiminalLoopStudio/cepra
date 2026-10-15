import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AjusteForm } from "./ajuste-form";

export const metadata: Metadata = { title: "Stock" };

const MOTIVO: Record<string, string> = {
  compra: "Compra",
  prestamo_recibido: "Préstamo recibido",
  perdida: "Pérdida",
  baja: "Baja",
  devolucion_propietario: "Devolución a la empresa dueña",
  correccion: "Corrección de conteo",
};

type Ajuste = {
  id: number;
  cantidad: number;
  nota: string | null;
  datos: { motivo?: string; total_anterior?: number; total_nuevo?: number };
  created_at: string;
  realizado: { nombre: string } | null;
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function StockArticuloPage({ params }: PageProps<"/stock/[id]">) {
  const usuario = await requireUsuario();
  const esAdmin = usuario.rol === "administrador";
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: s }, { data: movs }] = await Promise.all([
    supabase.from("v_stock_cantidad").select("*").eq("articulo_id", id).maybeSingle(),
    supabase
      .from("movimientos")
      .select("id, cantidad, nota, datos, created_at, realizado:usuarios!movimientos_realizado_por_fkey(nombre)")
      .eq("articulo_id", id)
      .eq("tipo", "ajuste_stock")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (!s) notFound();
  const ajustes = (movs ?? []) as unknown as Ajuste[];
  const bajo = s.disponible < s.stock_minimo;

  const cifras: [string, number, string?][] = [
    ["Disponible", s.disponible, bajo ? "text-red-500" : ""],
    ["Total en almacén", s.total],
    ["Prestado", s.prestado],
    ["Reservado", s.reservado],
    ["Mínimo", s.stock_minimo],
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/stock" className="text-sm text-muted hover:text-foreground">
          ← Stock
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {s.nombre} <span className="font-mono text-muted">{s.codigo_tipo}</span>
        </h1>
        {bajo ? (
          <p className="mt-2 inline-block rounded-full bg-red-500/15 px-3 py-1 text-sm font-medium text-red-500">
            Por debajo del mínimo
          </p>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cifras.map(([k, v, color]) => (
          <div key={k} className="rounded-xl border border-foreground/10 p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${color ?? ""}`}>{v}</p>
          </div>
        ))}
      </section>

      {esAdmin ? (
        <section className="rounded-2xl border border-foreground/10 p-5">
          <h2 className="mb-4 font-semibold">Ajustar existencias</h2>
          <AjusteForm articuloId={s.articulo_id} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-semibold">Historial de ajustes</h2>
        {ajustes.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-foreground/10">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-foreground/5 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-2 font-medium">Motivo</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Quién / nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {ajustes.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-muted">{fecha(a.created_at)}</td>
                    <td
                      className={`px-4 py-2 text-right font-semibold tabular-nums ${
                        a.cantidad > 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {a.cantidad > 0 ? "+" : ""}
                      {a.cantidad}
                    </td>
                    <td className="px-4 py-2">{MOTIVO[a.datos.motivo ?? ""] ?? a.datos.motivo}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">
                      {a.datos.total_anterior} → {a.datos.total_nuevo}
                    </td>
                    <td className="px-4 py-2">
                      {a.realizado?.nombre ?? "—"}
                      {a.nota ? <span className="block text-xs text-muted">{a.nota}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Sin ajustes todavía.</p>
        )}
      </section>
    </main>
  );
}
