import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COLOR_ESTADO, ESTADO_FISICO, ESTADO_OPERATIVO, PROPIEDAD } from "@/lib/etiquetas";

export const metadata: Metadata = { title: "Equipos" };

type Fila = {
  id: string;
  etiqueta: string;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  estado_fisico: string;
  estado_operativo: string;
  propiedad: string;
  articulo: { codigo_tipo: string; nombre: string } | null;
  propietario: { nombre: string } | null;
};

export default async function EquiposPage() {
  const usuario = await requireUsuario();
  const esAdmin = usuario.rol === "administrador";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipos")
    .select(
      "id, etiqueta, marca, modelo, serie, estado_fisico, estado_operativo, propiedad, articulo:catalogo_articulos(codigo_tipo, nombre), propietario:propietarios(nombre)",
    )
    .order("etiqueta");

  const equipos = (data ?? []) as unknown as Fila[];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Equipos</h1>
          <p className="text-sm text-muted">Piezas individuales con su etiqueta QR.</p>
        </div>
        {esAdmin ? (
          <Link
            href="/equipos/nuevo"
            className="flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white"
          >
            + Registrar equipo
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-500">No se pudieron cargar los equipos: {error.message}</p>
      ) : equipos.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-foreground/10">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-foreground/5 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Etiqueta</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Marca / modelo</th>
                <th className="px-4 py-2 font-medium">Serie</th>
                <th className="px-4 py-2 font-medium">Propiedad</th>
                <th className="px-4 py-2 font-medium">Físico</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {equipos.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 font-mono font-medium">{e.etiqueta}</td>
                  <td className="px-4 py-2">{e.articulo?.nombre ?? "—"}</td>
                  <td className="px-4 py-2">
                    {[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{e.serie ?? "—"}</td>
                  <td className="px-4 py-2">
                    {PROPIEDAD[e.propiedad] ?? e.propiedad}
                    {e.propiedad !== "propio" && e.propietario ? (
                      <span className="block text-xs text-muted">{e.propietario.nombre}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{ESTADO_FISICO[e.estado_fisico] ?? e.estado_fisico}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        COLOR_ESTADO[e.estado_operativo] ?? ""
                      }`}
                    >
                      {ESTADO_OPERATIVO[e.estado_operativo] ?? e.estado_operativo}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
          Aún no hay equipos registrados.
        </p>
      )}
    </main>
  );
}
