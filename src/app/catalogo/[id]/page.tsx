import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cambiarActivo } from "../actions";
import { TipoForm } from "../tipo-form";

export const metadata: Metadata = { title: "Editar tipo" };

export default async function EditarTipoPage({ params }: PageProps<"/catalogo/[id]">) {
  await requireUsuario(["administrador"]);
  const { id } = await params;

  const supabase = await createClient();
  const { data: tipo } = await supabase
    .from("catalogo_articulos")
    .select("id, codigo_tipo, nombre, categoria, serializado, stock_minimo, puertos_default, activo")
    .eq("id", id)
    .maybeSingle();

  if (!tipo) notFound();

  const alternarActivo = cambiarActivo.bind(null, tipo.id, !tipo.activo);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/catalogo" className="text-sm text-muted hover:text-foreground">
          ← Catálogo
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          Editar <span className="font-mono">{tipo.codigo_tipo}</span>
        </h1>
        <p className="text-sm text-muted">{tipo.nombre}</p>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <TipoForm
          modo="editar"
          id={tipo.id}
          inicial={{
            codigo_tipo: tipo.codigo_tipo,
            nombre: tipo.nombre,
            categoria: tipo.categoria,
            serializado: tipo.serializado ? "si" : "no",
            stock_minimo: String(tipo.stock_minimo),
            puertos: (tipo.puertos_default as string[]).join(", "),
          }}
        />
        <p className="mt-4 text-xs text-muted">
          Cambiar el código o el tipo de control está bien mientras no haya piezas registradas
          de este tipo. Más adelante el sistema lo bloqueará para no descuadrar etiquetas.
        </p>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-foreground/10 p-5">
        <div>
          <h2 className="font-semibold">{tipo.activo ? "Tipo activo" : "Tipo inactivo"}</h2>
          <p className="text-sm text-muted">
            {tipo.activo
              ? "Desactívalo si ya no se usa. No se borra: se conserva para el historial."
              : "No aparece para nuevas altas. Puedes reactivarlo cuando quieras."}
          </p>
        </div>
        <form action={alternarActivo}>
          <button
            type="submit"
            className={`h-11 rounded-lg px-5 font-medium ${
              tipo.activo
                ? "border border-red-500/40 text-red-500 hover:bg-red-500/10"
                : "bg-brand text-white"
            }`}
          >
            {tipo.activo ? "Desactivar" : "Reactivar"}
          </button>
        </form>
      </section>
    </main>
  );
}
