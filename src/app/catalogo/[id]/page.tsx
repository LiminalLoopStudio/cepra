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
  const [{ data: tipo }, { data: categorias }] = await Promise.all([
    supabase
      .from("catalogo_articulos")
      .select(
        "id, codigo_tipo, nombre, categoria_id, serializado, stock_minimo, puertos_default, lleva_control, lleva_cables, activo",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("categorias").select("id, nombre, prefijo, activo").order("nombre"),
  ]);

  if (!tipo) notFound();

  // Categorías activas + la actual (aunque esté desactivada).
  const opciones = (categorias ?? []).filter((c) => c.activo || c.id === tipo.categoria_id);

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
          codigo={tipo.codigo_tipo}
          categorias={opciones}
          inicial={{
            nombre: tipo.nombre,
            categoria_id: tipo.categoria_id ?? "",
            serializado: tipo.serializado ? "si" : "no",
            stock_minimo: String(tipo.stock_minimo),
            puertos: (tipo.puertos_default as string[]).join(", "),
            lleva_control: tipo.lleva_control ? "si" : "",
            lleva_cables: tipo.lleva_cables ? "si" : "",
          }}
        />
        <p className="mt-4 text-xs text-muted">
          La categoría (y con ella el código) y la forma de control solo se pueden cambiar
          mientras el tipo no tenga piezas ni movimientos; si los tiene, el sistema lo rechaza
          para no descuadrar etiquetas ni inventario. Cambiar &quot;trae control / cables&quot; solo
          afecta a las piezas que se registren después.
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
