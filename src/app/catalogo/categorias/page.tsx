import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cambiarActivoCategoria } from "./actions";
import { EditarCategoriaForm, NuevaCategoriaForm } from "./formularios";

export const metadata: Metadata = { title: "Categorías" };

type Categoria = {
  id: string;
  nombre: string;
  prefijo: string;
  siguiente_numero: number;
  activo: boolean;
  tipos: { count: number }[];
};

export default async function CategoriasPage() {
  await requireUsuario(["administrador"]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre, prefijo, siguiente_numero, activo, tipos:catalogo_articulos(count)")
    .order("nombre");
  const categorias = (data ?? []) as unknown as Categoria[];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <div>
        <Link href="/catalogo" className="text-sm text-muted hover:text-foreground">
          ← Catálogo
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Categorías</h1>
        <p className="text-sm text-muted">
          Cada categoría tiene 2 letras con las que se arma el código de sus tipos: Consola (CN) →
          CN01, CN02… Las letras ya no se pueden cambiar cuando la categoría tiene tipos.
        </p>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-4 font-semibold">Nueva categoría</h2>
        <NuevaCategoriaForm />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">
          Categorías <span className="text-muted">({categorias.length})</span>
        </h2>
        {error ? (
          <p className="text-sm text-red-500">No se pudieron cargar: {error.message}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {categorias.map((c) => {
              const tipos = c.tipos?.[0]?.count ?? 0;
              const alternar = cambiarActivoCategoria.bind(null, c.id, !c.activo);
              return (
                <li
                  key={c.id}
                  className={`flex flex-col gap-2 rounded-xl border border-foreground/10 p-3 ${
                    c.activo ? "" : "opacity-60"
                  }`}
                >
                  <EditarCategoriaForm
                    id={c.id}
                    nombre={c.nombre}
                    prefijo={c.prefijo}
                    bloqueada={tipos > 0}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {tipos} {tipos === 1 ? "tipo" : "tipos"} · siguiente código:{" "}
                      <span className="font-mono">
                        {c.prefijo}
                        {String(c.siguiente_numero).padStart(2, "0")}
                      </span>
                      {c.activo ? "" : " · inactiva"}
                    </span>
                    <form action={alternar}>
                      <button type="submit" className="underline hover:text-foreground">
                        {c.activo ? "Desactivar" : "Reactivar"}
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
