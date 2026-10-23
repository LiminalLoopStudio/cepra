import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { COLOR_SOLICITUD, ESTADO_SOLICITUD, fechaHora } from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/server";
import { articulosParaSolicitar } from "../datos";
import { Acciones } from "./acciones";
import { Preparar, type RenglonPreparar } from "./preparar";

export const metadata: Metadata = { title: "Solicitud" };

type Solicitud = {
  id: string;
  folio: number;
  estado: string;
  necesita_para: string | null;
  notas: string | null;
  motivo: string | null;
  created_at: string;
  aprobado_at: string | null;
  ajustado_at: string | null;
  preparado_at: string | null;
  entregado_at: string | null;
  cerrado_at: string | null;
  solicitante_id: string;
  origen: string;
  zona: { nombre: string; lider_id: string | null } | null;
  seccion: { nombre: string; lider_id: string | null } | null;
  evento: { id: string; nombre: string } | null;
  solicitante: { nombre: string } | null;
  aprobador: { nombre: string } | null;
  ajustador: { nombre: string } | null;
  preparador: { nombre: string } | null;
  cerrador: { nombre: string } | null;
  prestamo: { id: string; folio: number } | null;
  items: {
    id: string;
    articulo_id: string;
    cantidad: number;
    reservado_cantidad: number;
    articulo: { nombre: string; serializado: boolean } | null;
  }[];
  reservas: { item_id: string; equipo: { id: string; etiqueta: string } | null }[];
};

export default async function SolicitudPage({ params, searchParams }: PageProps<"/solicitudes/[id]">) {
  const yo = await requireUsuario();
  const { id } = await params;
  const { nueva } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from("solicitudes")
    .select(
      `id, folio, estado, necesita_para, notas, motivo, created_at, aprobado_at, ajustado_at, preparado_at, entregado_at, cerrado_at, solicitante_id, origen,
       zona:zonas(nombre, lider_id), seccion:secciones(nombre, lider_id), evento:eventos(id, nombre),
       solicitante:usuarios!solicitudes_solicitante_id_fkey(nombre),
       aprobador:usuarios!solicitudes_aprobado_por_fkey(nombre),
       ajustador:usuarios!solicitudes_ajustado_por_fkey(nombre),
       preparador:usuarios!solicitudes_preparado_por_fkey(nombre),
       cerrador:usuarios!solicitudes_cerrado_por_fkey(nombre),
       prestamo:prestamos(id, folio),
       items:solicitud_items(id, articulo_id, cantidad, reservado_cantidad, articulo:catalogo_articulos(nombre, serializado)),
       reservas:solicitud_reservas(item_id, equipo:equipos(id, etiqueta))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const s = data as unknown as Solicitud;

  const admin = yo.rol === "administrador";
  const almacen = admin || yo.rol === "almacenista";
  const esLider = admin || s.zona?.lider_id === yo.id || s.seccion?.lider_id === yo.id;
  const esMia = s.solicitante_id === yo.id;
  const abierta = s.estado === "pendiente" || s.estado === "aprobada";

  const puedeAprobar = esLider && s.estado === "pendiente";
  const puedeAjustar = (esLider && abierta) || (esMia && s.estado === "pendiente");
  const puedeCancelar = (abierta && (esMia || esLider || almacen)) || (s.estado === "lista" && almacen);
  const puedeDeshacer = almacen && s.estado === "lista";
  const puedePreparar = almacen && s.estado === "aprobada";

  // Catálogo (para ajustar) y existencias por cantidad (para preparar), solo si hacen falta.
  const articulos = puedeAjustar || puedePreparar ? await articulosParaSolicitar() : [];
  const libres = new Map(articulos.map((a) => [a.id, a.disponibles]));
  const renglones: RenglonPreparar[] = s.items.map((i) => ({
    item_id: i.id,
    articulo_id: i.articulo_id,
    nombre: i.articulo?.nombre ?? "",
    serializado: Boolean(i.articulo?.serializado),
    cantidad: i.cantidad,
    disponibles: libres.get(i.articulo_id) ?? 0,
  }));

  const historia = [
    { cuando: s.created_at, texto: `Pidió ${s.solicitante?.nombre ?? ""}` },
    s.ajustado_at ? { cuando: s.ajustado_at, texto: `Ajustó ${s.ajustador?.nombre ?? ""}` } : null,
    s.aprobado_at
      ? {
          cuando: s.aprobado_at,
          texto: s.aprobado_at === s.created_at ? `Aprobada al pedirla (líder)` : `Aprobó ${s.aprobador?.nombre ?? ""}`,
        }
      : null,
    s.preparado_at ? { cuando: s.preparado_at, texto: `Preparó ${s.preparador?.nombre ?? ""} (almacén)` } : null,
    s.entregado_at ? { cuando: s.entregado_at, texto: `Entregada con firma de PIN` } : null,
    s.cerrado_at
      ? {
          cuando: s.cerrado_at,
          texto: `${s.estado === "rechazada" ? "Rechazó" : "Canceló"} ${s.cerrador?.nombre ?? ""}${s.motivo ? `: ${s.motivo}` : ""}`,
        }
      : null,
  ]
    .filter((h): h is { cuando: string; texto: string } => h !== null)
    .sort((a, b) => a.cuando.localeCompare(b.cuando));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/solicitudes" className="text-sm text-muted hover:text-foreground">
          ← Solicitudes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            Solicitud <span className="font-mono">#{s.folio}</span>
          </h1>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${COLOR_SOLICITUD[s.estado]}`}>
            {ESTADO_SOLICITUD[s.estado]}
          </span>
          {s.origen === "maestro" ? (
            <Link
              href={`/eventos/${s.evento?.id}/maestro`}
              className="rounded-full bg-brand/15 px-3 py-1 text-sm font-medium text-brand hover:underline"
            >
              Del documento maestro
            </Link>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          {s.solicitante?.nombre} · Zona {s.zona?.nombre}
          {s.seccion ? ` · ${s.seccion.nombre}` : ""} · {s.evento?.nombre}
          {s.necesita_para ? ` · la necesita para ${fechaHora(s.necesita_para)}` : ""}
        </p>
        {s.notas ? <p className="mt-2 text-sm">{s.notas}</p> : null}
      </div>

      {nueva ? (
        <p role="status" className="rounded-xl bg-green-500/15 px-4 py-3 text-sm text-green-500">
          {s.estado === "pendiente"
            ? "Solicitud enviada. Tu líder la tiene que aprobar."
            : "Solicitud enviada a almacén."}
        </p>
      ) : null}

      {s.estado === "lista" ? (
        <p className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm">
          {esMia ? (
            <>Ya está lista: pasa a almacén con tu credencial y tu PIN para recogerla.</>
          ) : almacen ? (
            <>
              Para entregarla ve a{" "}
              <Link href="/entregas" className="font-semibold text-brand underline">
                Entregar
              </Link>{" "}
              y escanea la credencial de {s.solicitante?.nombre}: la solicitud se carga sola.
            </>
          ) : (
            <>Lista para que {s.solicitante?.nombre} la recoja en almacén.</>
          )}
        </p>
      ) : null}

      {/* Lo que se pidió */}
      <div className="overflow-x-auto rounded-xl border border-foreground/10">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-foreground/5 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Artículo</th>
              <th className="px-4 py-2 font-medium">Pedido</th>
              <th className="px-4 py-2 font-medium">Apartado por almacén</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/10">
            {s.items.map((i) => {
              const piezas = s.reservas.filter((r) => r.item_id === i.id);
              const apartado = i.articulo?.serializado ? piezas.length : i.reservado_cantidad;
              return (
                <tr key={i.id}>
                  <td className="px-4 py-2 font-medium">{i.articulo?.nombre}</td>
                  <td className="px-4 py-2 tabular-nums">{i.cantidad}</td>
                  <td className="px-4 py-2">
                    {s.estado === "lista" ? (
                      <>
                        <span className={apartado < i.cantidad ? "text-yellow-500" : "text-green-500"}>
                          {apartado} de {i.cantidad}
                        </span>
                        {piezas.length > 0 ? (
                          <span className="ml-2 font-mono text-xs text-muted">
                            {piezas.map((p) => p.equipo?.etiqueta).join(", ")}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {puedePreparar ? <Preparar solicitudId={s.id} renglones={renglones} /> : null}

      <Acciones
        solicitudId={s.id}
        puedeAprobar={puedeAprobar}
        puedeAjustar={puedeAjustar}
        puedeCancelar={puedeCancelar}
        puedeDeshacer={puedeDeshacer}
        articulos={articulos}
        inicial={{
          lineas: s.items.map((i) => ({ articulo_id: i.articulo_id, cantidad: i.cantidad })),
          necesita_para: s.necesita_para,
          notas: s.notas,
        }}
      />

      {/* Historial */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Historial</h2>
        <ol className="flex flex-col gap-2 border-l border-foreground/15 pl-4 text-sm">
          {historia.map((h) => (
            <li key={h.cuando + h.texto}>
              <span className="text-muted">{fechaHora(h.cuando)}</span> · {h.texto}
            </li>
          ))}
          {s.prestamo ? (
            <li>
              <Link href={`/prestamos/${s.prestamo.id}`} className="text-brand hover:underline">
                Ver préstamo #{s.prestamo.folio}
              </Link>
            </li>
          ) : null}
        </ol>
      </section>
    </main>
  );
}
