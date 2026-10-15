import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditarEquipoForm } from "./editar-equipo-form";

export const metadata: Metadata = { title: "Editar equipo" };

export default async function EditarEquipoPage({ params }: PageProps<"/equipos/[id]/editar">) {
  await requireUsuario(["administrador"]);
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: e }, { data: propietarios }] = await Promise.all([
    supabase
      .from("equipos")
      .select(
        "id, etiqueta, marca, modelo, serie, puertos, propiedad, propietario_id, fecha_devolucion, notas",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("propietarios").select("id, nombre, tipo, activo").order("nombre"),
  ]);

  if (!e) notFound();

  // Empresas activas, más la actual aunque esté inactiva (para no perderla al editar).
  const empresas = (propietarios ?? []).filter(
    (p) => p.tipo !== "propio" && (p.activo || p.id === e.propietario_id),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href={`/equipos/${e.id}`} className="text-sm text-muted hover:text-foreground">
          ← {e.etiqueta}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          Editar <span className="font-mono">{e.etiqueta}</span>
        </h1>
        <p className="text-sm text-muted">
          La etiqueta y el tipo no se pueden cambiar. Cada cambio queda en el historial.
        </p>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <EditarEquipoForm
          id={e.id}
          empresas={empresas.map((p) => ({ id: p.id, nombre: p.nombre }))}
          inicial={{
            marca: e.marca ?? "",
            modelo: e.modelo ?? "",
            serie: e.serie ?? "",
            puertos: (e.puertos as string[]).join(", "),
            propiedad: e.propiedad,
            propietario_id: e.propietario_id ?? "",
            fecha_devolucion: e.fecha_devolucion ?? "",
            notas: e.notas ?? "",
          }}
        />
      </section>
    </main>
  );
}
