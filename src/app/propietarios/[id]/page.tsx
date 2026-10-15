import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cambiarActivoPropietario } from "../actions";
import { PropietarioForm } from "../propietario-form";

export const metadata: Metadata = { title: "Editar empresa" };

export default async function EditarPropietarioPage({ params }: PageProps<"/propietarios/[id]">) {
  await requireUsuario(["administrador"]);
  const { id } = await params;

  const supabase = await createClient();
  const { data: p } = await supabase
    .from("propietarios")
    .select("id, nombre, tipo, contacto, activo")
    .eq("id", id)
    .maybeSingle();

  if (!p) notFound();

  const alternarActivo = cambiarActivoPropietario.bind(null, p.id, !p.activo);
  const esPropio = p.tipo === "propio";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/propietarios" className="text-sm text-muted hover:text-foreground">
          ← Propietarios
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Editar {p.nombre}</h1>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <PropietarioForm
          modo="editar"
          id={p.id}
          inicial={{ nombre: p.nombre, tipo: p.tipo, contacto: p.contacto ?? "" }}
        />
      </section>

      {!esPropio ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-foreground/10 p-5">
          <div>
            <h2 className="font-semibold">{p.activo ? "Empresa activa" : "Empresa inactiva"}</h2>
            <p className="text-sm text-muted">
              {p.activo
                ? "Desactívala si ya no presta equipo. No se borra: su equipo conserva el historial."
                : "No aparece para nuevas altas de equipo. Puedes reactivarla."}
            </p>
          </div>
          <form action={alternarActivo}>
            <button
              type="submit"
              className={`h-11 rounded-lg px-5 font-medium ${
                p.activo
                  ? "border border-red-500/40 text-red-500 hover:bg-red-500/10"
                  : "bg-brand text-white"
              }`}
            >
              {p.activo ? "Desactivar" : "Reactivar"}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
