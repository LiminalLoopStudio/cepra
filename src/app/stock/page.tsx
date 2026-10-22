import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage() {
  const usuario = await requireUsuario();
  const esAdmin = usuario.rol === "administrador";

  const supabase = await createClient();
  const { data: articulos, error } = await supabase
    .from("v_stock_cantidad")
    .select("*")
    .order("categoria")
    .order("nombre");

  const bajos = (articulos ?? []).filter((a) => a.activo && a.disponible < a.stock_minimo).length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Inicio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Stock por cantidad</h1>
        <p className="text-sm text-muted">
          Artículos que se cuentan sin QR por pieza: cables baratos, consumibles. Para agregar un
          artículo nuevo, créalo en el{" "}
          <Link href="/catalogo" className="text-brand hover:underline">
            catálogo
          </Link>{" "}
          como &quot;Por cantidad&quot;.
        </p>
      </div>

      {bajos > 0 ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {bajos} {bajos === 1 ? "artículo está" : "artículos están"} por debajo del stock mínimo.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-500">No se pudo cargar: {error.message}</p>
      ) : articulos && articulos.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-foreground/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-foreground/5 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Artículo</th>
                <th className="px-4 py-2 text-right font-medium">Disponible</th>
                <th className="px-4 py-2 text-right font-medium">Prestado</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Mínimo</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10 tabular-nums">
              {articulos.map((a) => {
                const bajo = a.disponible < a.stock_minimo;
                return (
                  <tr key={a.articulo_id} className={a.activo ? "" : "opacity-50"}>
                    <td className="px-4 py-2 font-mono">{a.codigo_tipo}</td>
                    <td className="px-4 py-2">
                      <Link href={`/stock/${a.articulo_id}`} className="text-brand hover:underline">
                        {a.nombre}
                      </Link>
                      <span className="block text-xs text-muted">{a.categoria}</span>
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${bajo ? "text-red-500" : ""}`}>
                      {a.disponible}
                      {bajo ? <span className="ml-1 text-xs font-normal">bajo</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right">{a.prestado}</td>
                    <td className="px-4 py-2 text-right text-muted">{a.total}</td>
                    <td className="px-4 py-2 text-right text-muted">{a.stock_minimo}</td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/stock/${a.articulo_id}`}
                        className={
                          esAdmin
                            ? "rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                            : "text-brand hover:underline"
                        }
                      >
                        {esAdmin ? "Ajustar" : "Ver"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
          No hay artículos por cantidad. Crea uno en el catálogo marcando &quot;Por cantidad&quot;.
        </p>
      )}
    </main>
  );
}
