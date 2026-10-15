import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PropietarioForm } from "./propietario-form";

export const metadata: Metadata = { title: "Propietarios" };

const TIPO: Record<string, string> = {
  propio: "Propio",
  patrocinador: "Patrocinador",
  prestamista: "Prestamista",
};

export default async function PropietariosPage() {
  const usuario = await requireUsuario();
  const esAdmin = usuario.rol === "administrador";

  const supabase = await createClient();
  const { data: propietarios, error } = await supabase
    .from("propietarios")
    .select("id, nombre, tipo, contacto, activo")
    .order("tipo")
    .order("nombre");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Inicio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Propietarios</h1>
        <p className="text-sm text-muted">
          Empresas dueñas del equipo. El equipo patrocinado o prestado debe regresarse a su dueño.
        </p>
      </div>

      {esAdmin ? (
        <section className="rounded-2xl border border-foreground/10 p-5">
          <h2 className="mb-4 font-semibold">Registrar empresa</h2>
          <PropietarioForm modo="crear" />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-semibold">
          Empresas <span className="text-muted">({propietarios?.length ?? 0})</span>
        </h2>
        {error ? (
          <p className="text-sm text-red-500">No se pudo cargar: {error.message}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-foreground/10">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-foreground/5 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Contacto</th>
                  {esAdmin ? <th className="px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {propietarios?.map((p) => (
                  <tr key={p.id} className={p.activo ? "" : "opacity-50"}>
                    <td className="px-4 py-2">
                      {p.nombre}
                      {!p.activo ? <span className="ml-2 text-xs text-muted">(inactiva)</span> : null}
                    </td>
                    <td className="px-4 py-2">{TIPO[p.tipo] ?? p.tipo}</td>
                    <td className="px-4 py-2 text-muted">{p.contacto ?? "—"}</td>
                    {esAdmin ? (
                      <td className="px-4 py-2 text-right">
                        <Link href={`/propietarios/${p.id}`} className="text-brand hover:underline">
                          Editar
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
