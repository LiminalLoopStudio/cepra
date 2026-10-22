import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cambiarActivoCuenta } from "../actions";
import { CuentaForm, type Opcion } from "../formularios";

export const metadata: Metadata = { title: "Editar cuenta" };

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function EditarCuentaPage({ params }: PageProps<"/cuentas/[id]">) {
  const yo = await requireUsuario(["administrador", "lider"]);
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: cuenta }, { data: plataformas }, { data: equiposData }] = await Promise.all([
    supabase
      .from("cuentas")
      .select(
        "id, plataforma_id, correo, usuario, equipo_id, notas, activo, created_at, updated_at, creador:usuarios!cuentas_creado_por_fkey(nombre), editor:usuarios!cuentas_actualizado_por_fkey(nombre), plataforma:plataformas(nombre)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("plataformas").select("id, nombre, activo").order("orden").order("nombre"),
    supabase
      .from("equipos")
      .select("id, etiqueta, articulo:catalogo_articulos(nombre)")
      .order("etiqueta"),
  ]);
  if (!cuenta) notFound();

  const c = cuenta as unknown as {
    id: string;
    plataforma_id: string;
    correo: string;
    usuario: string | null;
    equipo_id: string | null;
    notas: string | null;
    activo: boolean;
    created_at: string;
    updated_at: string;
    creador: { nombre: string } | null;
    editor: { nombre: string } | null;
    plataforma: { nombre: string } | null;
  };

  // Plataformas activas + la actual (aunque esté desactivada).
  const opcionesPlataforma: Opcion[] = (plataformas ?? [])
    .filter((p) => p.activo || p.id === c.plataforma_id)
    .map((p) => ({ id: p.id, texto: p.nombre }));
  const equipos: Opcion[] = ((equiposData ?? []) as unknown as { id: string; etiqueta: string; articulo: { nombre: string } | null }[]).map(
    (e) => ({ id: e.id, texto: `${e.etiqueta} — ${e.articulo?.nombre ?? ""}` }),
  );
  const alternar = cambiarActivoCuenta.bind(null, c.id, !c.activo);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/cuentas" className="text-sm text-muted hover:text-foreground">
          ← Cuentas
        </Link>
        <h1 className="mt-2 break-all text-2xl font-bold">{c.correo}</h1>
        <p className="text-sm text-muted">
          {c.plataforma?.nombre} · registrada {fecha(c.created_at)}
          {c.creador ? ` por ${c.creador.nombre}` : ""} · último cambio {fecha(c.updated_at)}
          {c.editor ? ` por ${c.editor.nombre}` : ""}
        </p>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <CuentaForm
          modo="editar"
          id={c.id}
          plataformas={opcionesPlataforma}
          equipos={equipos}
          inicial={{
            plataforma_id: c.plataforma_id,
            correo: c.correo,
            usuario: c.usuario ?? "",
            equipo_id: c.equipo_id ?? "",
            notas: c.notas ?? "",
          }}
        />
      </section>

      {yo.rol === "administrador" ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-foreground/10 p-5">
          <div>
            <h2 className="font-semibold">{c.activo ? "Cuenta activa" : "Cuenta desactivada"}</h2>
            <p className="text-sm text-muted">
              {c.activo
                ? "Desactívala si ya no se usa. No se borra: queda el registro."
                : "No aparece en la lista normal. Puedes reactivarla."}
            </p>
          </div>
          <form action={alternar}>
            <button
              type="submit"
              className={`h-11 rounded-lg px-5 font-medium ${
                c.activo ? "border border-red-500/40 text-red-500 hover:bg-red-500/10" : "bg-brand text-white"
              }`}
            >
              {c.activo ? "Desactivar" : "Reactivar"}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
