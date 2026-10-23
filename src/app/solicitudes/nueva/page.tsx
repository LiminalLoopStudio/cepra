import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { articulosParaSolicitar } from "../datos";
import { SolicitudForm, type ZonaOpcion } from "../formulario";

export const metadata: Metadata = { title: "Nueva solicitud" };

type Zona = {
  id: string;
  nombre: string;
  lider_id: string | null;
  evento: { nombre: string; estado: string; fecha_inicio: string } | null;
  secciones: { nombre: string; lider_id: string | null }[];
  zona_staff: { usuario_id: string; seccion: { nombre: string } | null }[];
};

export default async function NuevaSolicitudPage() {
  const yo = await requireUsuario();
  const admin = yo.rol === "administrador";

  const supabase = await createClient();
  const [{ data }, articulos] = await Promise.all([
    supabase
      .from("zonas")
      .select("id, nombre, lider_id, evento:eventos!inner(nombre, estado, fecha_inicio), secciones(nombre, lider_id), zona_staff(usuario_id, seccion:secciones(nombre))")
      .neq("evento.estado", "cerrado"),
    articulosParaSolicitar(),
  ]);

  // Zonas donde puede pedir: las que lidera (zona o sección), donde es staff, o todas si es admin.
  const lugar = (z: Zona) =>
    z.secciones.find((s) => s.lider_id === yo.id)?.nombre ??
    z.zona_staff.find((s) => s.usuario_id === yo.id)?.seccion?.nombre ??
    null;
  const zonas: ZonaOpcion[] = ((data ?? []) as unknown as Zona[])
    .filter(
      (z) =>
        admin ||
        z.lider_id === yo.id ||
        z.secciones.some((s) => s.lider_id === yo.id) ||
        z.zona_staff.some((s) => s.usuario_id === yo.id),
    )
    .sort((a, b) =>
      (a.evento?.estado === "activo" ? 0 : 1) - (b.evento?.estado === "activo" ? 0 : 1) ||
      (a.evento?.fecha_inicio ?? "").localeCompare(b.evento?.fecha_inicio ?? "") ||
      a.nombre.localeCompare(b.nombre),
    )
    .map((z) => ({
      id: z.id,
      texto: `${z.nombre}${lugar(z) ? ` › ${lugar(z)}` : ""} · ${z.evento?.nombre ?? ""}${
        z.evento?.estado === "activo" ? " (activo)" : ""
      }${z.lider_id === yo.id || z.secciones.some((s) => s.lider_id === yo.id) ? " · eres líder" : ""}`,
    }));

  const esLider =
    admin ||
    ((data ?? []) as unknown as Zona[]).some((z) => z.lider_id === yo.id || z.secciones.some((s) => s.lider_id === yo.id));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/solicitudes" className="text-sm text-muted hover:text-foreground">
          ← Solicitudes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Nueva solicitud</h1>
        <p className="text-sm text-muted">
          {esLider
            ? "Como líder, tu solicitud va directo a almacén. Las de tu staff te llegan para aprobar."
            : "Tu líder (de sección o de zona) la revisa y la aprueba; después almacén la prepara."}
        </p>
      </div>
      <div className="rounded-2xl border border-foreground/10 p-5">
        <SolicitudForm modo="crear" articulos={articulos} zonas={zonas} />
      </div>
    </main>
  );
}
