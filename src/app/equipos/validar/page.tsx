import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Validador } from "./validador";

export const metadata: Metadata = { title: "Validar etiquetas" };

type Pendiente = {
  id: string;
  etiqueta: string;
  marca: string | null;
  modelo: string | null;
  articulo: { nombre: string } | null;
};

export default async function ValidarPage() {
  await requireUsuario(["administrador", "almacenista"]);

  const supabase = await createClient();
  const { data } = await supabase
    .from("equipos")
    .select("id, etiqueta, marca, modelo, articulo:catalogo_articulos(nombre)")
    .eq("estado_operativo", "por_validar")
    .order("etiqueta")
    .limit(300);
  const pendientes = (data ?? []) as unknown as Pendiente[];

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
      <section>
        <Link href="/equipos" className="text-sm text-muted hover:text-foreground">
          ← Equipos
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Validar etiquetas</h1>
        <p className="mb-4 text-sm text-muted">
          Un equipo nuevo queda disponible solo cuando su etiqueta y la de su caja coinciden.
        </p>
        <Validador />
      </section>

      <aside className="h-fit rounded-xl border border-foreground/10 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Por validar <span className="text-muted">({pendientes.length})</span>
        </h2>
        {pendientes.length > 0 ? (
          <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto text-sm">
            {pendientes.map((e) => (
              <li key={e.id} className="rounded-lg bg-foreground/5 px-3 py-2">
                <p className="font-mono font-medium">{e.etiqueta}</p>
                <p className="text-xs text-muted">
                  {e.articulo?.nombre}
                  {e.marca ? ` · ${e.marca}` : ""}
                  {e.modelo ? ` ${e.modelo}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Todo validado.</p>
        )}
      </aside>
    </main>
  );
}
