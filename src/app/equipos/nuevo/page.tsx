import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EquipoForm } from "./equipo-form";

export const metadata: Metadata = { title: "Registrar equipo" };

export default async function NuevoEquipoPage() {
  await requireUsuario(["administrador"]);
  const supabase = await createClient();

  const [{ data: tipos }, { data: propietarios }] = await Promise.all([
    // Solo tipos activos que se controlan por pieza.
    supabase
      .from("catalogo_articulos")
      .select("id, codigo_tipo, nombre, puertos_default")
      .eq("serializado", true)
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("propietarios")
      .select("id, nombre, tipo")
      .eq("activo", true)
      .order("nombre"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/equipos" className="text-sm text-muted hover:text-foreground">
          ← Equipos
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Registrar equipo</h1>
        <p className="text-sm text-muted">
          La etiqueta se asigna sola al guardar. Para registrar varias piezas iguales, el
          formulario conserva tipo, marca y modelo.
        </p>
      </div>

      {tipos && tipos.length > 0 ? (
        <section className="rounded-2xl border border-foreground/10 p-5">
          <EquipoForm tipos={tipos} propietarios={propietarios ?? []} />
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
          No hay tipos activos que se controlen por pieza.{" "}
          <Link href="/catalogo" className="text-brand hover:underline">
            Agrega uno en el catálogo
          </Link>
          .
        </p>
      )}
    </main>
  );
}
