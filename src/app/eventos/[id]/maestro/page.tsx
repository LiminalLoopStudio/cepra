import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { COLOR_EVENTO, ESTADO_EVENTO, rangoFechas } from "@/lib/eventos";
import { cargarMaestro } from "@/lib/maestro";
import { ESTADO_SOLICITUD, fechaHora } from "@/lib/solicitudes";
import { EditorMaestro } from "./editor";

export const metadata: Metadata = { title: "Documento maestro" };

export default async function MaestroPage({ params }: PageProps<"/eventos/[id]/maestro">) {
  const yo = await requireUsuario(["administrador", "almacenista", "lider"]);
  const { id } = await params;
  const d = await cargarMaestro(id);
  if (!d) notFound();

  // "administrador" incluye Coordinación, Project Manager y Stage Manager.
  const organizacion = yo.rol === "administrador";
  const eventoCerrado = d.evento.estado === "cerrado";
  const editable = organizacion && d.estado === "borrador" && !eventoCerrado;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/maestro" className="text-sm text-muted hover:text-foreground">
          ← Documentos maestros
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{d.evento.nombre}</h1>
        <p className="text-sm text-muted">
          {rangoFechas(d.evento.fecha_inicio, d.evento.fecha_fin)}
          {d.evento.lugar ? ` · ${d.evento.lugar}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-3 py-1 font-medium ${COLOR_EVENTO[d.evento.estado] ?? ""}`}>
            Evento {ESTADO_EVENTO[d.evento.estado]?.toLowerCase()}
          </span>
          <span
            className={`rounded-full px-3 py-1 font-medium ${
              d.estado === "cerrado" ? "bg-green-500/15 text-green-500" : "bg-yellow-500/15 text-yellow-500"
            }`}
          >
            Documento {d.estado === "cerrado" ? `cerrado${d.cerradoPor ? ` por ${d.cerradoPor}` : ""} · ${fechaHora(d.cerradoAt)}` : "en borrador"}
          </span>
          {d.solicitudes.map((s) => (
            <span key={s.estado} className="rounded-full bg-foreground/10 px-3 py-1">
              Solicitudes generadas · {ESTADO_SOLICITUD[s.estado]?.toLowerCase()}: {s.n}
            </span>
          ))}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-foreground/10 text-sm">
        <Link href={`/eventos/${d.evento.id}`} className="px-3 py-2 text-muted hover:text-foreground">
          Zonas y personal
        </Link>
        <span className="border-b-2 border-brand px-3 py-2 font-semibold text-brand">Documento maestro</span>
      </nav>

      <p className="text-sm text-muted">
        {editable
          ? "Asigna a cada zona y sección el equipo que lleva y de dónde sale. Los líderes y el staff se asignan en \"Zonas y personal\". Al cerrar, almacén recibe una solicitud aprobada por cada lugar con equipo de almacén."
          : d.estado === "cerrado"
            ? "El documento está cerrado: almacén ya tiene las solicitudes. Los ajustes se piden con Solicitudes, o la organización puede reabrirlo mientras almacén no haya preparado nada."
            : "Solo Coordinación, Project Manager, Stage Manager y el administrador editan el documento maestro."}
      </p>

      <EditorMaestro
        eventoId={d.evento.id}
        editable={editable}
        puedeCerrar={organizacion && !eventoCerrado}
        estado={d.estado}
        zonas={d.zonas}
        renglones={d.renglones}
        inventario={d.inventario}
      />
    </main>
  );
}
