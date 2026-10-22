import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cambiarActivoPlataforma } from "../actions";
import { EditarPlataformaForm, NuevaPlataformaForm } from "../formularios";

export const metadata: Metadata = { title: "Clasificaciones de cuentas" };

type Plataforma = { id: string; nombre: string; orden: number; activo: boolean; cuentas: { count: number }[] };

export default async function ClasificacionesPage() {
  await requireUsuario(["administrador", "lider"]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plataformas")
    .select("id, nombre, orden, activo, cuentas(count)")
    .order("orden")
    .order("nombre");
  const plataformas = (data ?? []) as unknown as Plataforma[];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <div>
        <Link href="/cuentas" className="text-sm text-muted hover:text-foreground">
          ← Cuentas
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Clasificaciones de cuentas</h1>
        <p className="text-sm text-muted">
          Plataformas en las que se agrupan las cuentas. El número es el orden en la lista (menor = más arriba).
        </p>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-4 font-semibold">Nueva clasificación</h2>
        <NuevaPlataformaForm />
      </section>

      <section>
        {error ? (
          <p className="text-sm text-red-500">No se pudieron cargar: {error.message}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plataformas.map((p) => {
              const total = p.cuentas?.[0]?.count ?? 0;
              const alternar = cambiarActivoPlataforma.bind(null, p.id, !p.activo);
              return (
                <li
                  key={p.id}
                  className={`flex flex-col gap-2 rounded-xl border border-foreground/10 p-3 ${p.activo ? "" : "opacity-60"}`}
                >
                  <EditarPlataformaForm id={p.id} nombre={p.nombre} orden={p.orden} />
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      {total} {total === 1 ? "cuenta" : "cuentas"}
                      {p.activo ? "" : " · desactivada"}
                    </span>
                    <form action={alternar}>
                      <button type="submit" className="underline hover:text-foreground">
                        {p.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
