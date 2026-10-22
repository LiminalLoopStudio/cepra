import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TipoForm } from "./tipo-form";

export const metadata: Metadata = { title: "Catálogo" };

export default async function CatalogoPage() {
  const usuario = await requireUsuario();
  const esAdmin = usuario.rol === "administrador";

  const supabase = await createClient();
  const [{ data: tipos, error }, { data: categorias }] = await Promise.all([
    supabase
      .from("catalogo_articulos")
      .select(
        "id, codigo_tipo, nombre, categoria, serializado, stock_minimo, puertos_default, lleva_control, lleva_cables, activo",
      )
      .order("categoria")
      .order("codigo_tipo"),
    supabase.from("categorias").select("id, nombre, prefijo").eq("activo", true).order("nombre"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Inicio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Catálogo de artículos</h1>
        <p className="text-sm text-muted">
          Tipos de equipo que maneja Gaming Partners. Las piezas individuales se registran después.
        </p>
      </div>

      {esAdmin ? (
        <section className="rounded-2xl border border-foreground/10 p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Agregar tipo</h2>
            <Link href="/catalogo/categorias" className="text-sm text-brand hover:underline">
              Administrar categorías
            </Link>
          </div>
          <TipoForm modo="crear" categorias={categorias ?? []} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-semibold">
          Tipos registrados <span className="text-muted">({tipos?.length ?? 0})</span>
        </h2>

        {error ? (
          <p className="text-sm text-red-500">No se pudo cargar el catálogo: {error.message}</p>
        ) : tipos && tipos.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-foreground/10">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-foreground/5 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Código</th>
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Categoría</th>
                  <th className="px-4 py-2 font-medium">Control</th>
                  <th className="px-4 py-2 text-right font-medium">Mínimo</th>
                  <th className="px-4 py-2 font-medium">Puertos</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {tipos.map((t) => (
                  <tr key={t.id} className={t.activo ? "" : "opacity-50"}>
                    <td className="px-4 py-2 font-mono">{t.codigo_tipo}</td>
                    <td className="px-4 py-2">
                      {t.nombre}
                      {!t.activo ? <span className="ml-2 text-xs text-muted">(inactivo)</span> : null}
                    </td>
                    <td className="px-4 py-2">{t.categoria}</td>
                    <td className="px-4 py-2">
                      {t.serializado ? "Por pieza" : "Por cantidad"}
                      {t.lleva_control || t.lleva_cables ? (
                        <span className="block text-xs text-muted">
                          +{" "}
                          {[t.lleva_control ? "control" : null, t.lleva_cables ? "cables" : null]
                            .filter(Boolean)
                            .join(" y ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.stock_minimo}</td>
                    <td className="px-4 py-2 text-muted">
                      {t.serializado ? t.puertos_default.join(", ") || "—" : "—"}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {!t.serializado ? (
                        <Link href={`/stock/${t.id}`} className="mr-4 text-brand hover:underline">
                          Stock
                        </Link>
                      ) : null}
                      {esAdmin ? (
                        <Link href={`/catalogo/${t.id}`} className="text-brand hover:underline">
                          Editar
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
            Aún no hay tipos registrados.
            {esAdmin ? " Agrega el primero con el formulario de arriba." : ""}
          </p>
        )}
      </section>
    </main>
  );
}
