import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario, ROL_ETIQUETA, type Rol } from "@/lib/auth";
import { COLOR_EVENTO, ESTADO_EVENTO, rangoFechas } from "@/lib/eventos";
import { createClient } from "@/lib/supabase/server";
import { borrarZona, quitarStaff } from "../actions";
import {
  AsignarStaffForm,
  EditarZonaForm,
  EstadoEventoBotones,
  EventoForm,
  NuevaZonaForm,
  type Persona,
} from "../formularios";

export const metadata: Metadata = { title: "Evento" };

type Zona = {
  id: string;
  nombre: string;
  lider_id: string | null;
  lider: { nombre: string } | null;
  staff: { usuario_id: string; usuario: { nombre: string; rol: string } | null }[];
};

export default async function EventoPage({ params }: PageProps<"/eventos/[id]">) {
  const yo = await requireUsuario();
  const esAdmin = yo.rol === "administrador";
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: evento }, { data: zonasData }, { data: personas }] = await Promise.all([
    supabase
      .from("eventos")
      .select("id, nombre, lugar, fecha_inicio, fecha_fin, estado, notas")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("zonas")
      .select(
        "id, nombre, lider_id, lider:usuarios!zonas_lider_id_fkey(nombre), staff:zona_staff(usuario_id, usuario:usuarios(nombre, rol))",
      )
      .eq("evento_id", id)
      .order("nombre"),
    supabase.from("usuarios").select("id, nombre, rol").eq("activo", true).order("nombre"),
  ]);
  if (!evento) notFound();

  const zonas = (zonasData ?? []) as unknown as Zona[];
  const activos = (personas ?? []) as Persona[];
  const lideres = activos.filter((p) => p.rol === "lider" || p.rol === "administrador");
  // Ya tienen lugar en este evento: el staff asignado y los líderes de zona.
  const conZona = new Set([
    ...zonas.flatMap((z) => z.staff.map((s) => s.usuario_id)),
    ...zonas.flatMap((z) => (z.lider_id ? [z.lider_id] : [])),
  ]);
  const disponibles = activos.filter((p) => !conZona.has(p.id));
  const cerrado = evento.estado === "cerrado";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/eventos" className="text-sm text-muted hover:text-foreground">
            ← Eventos
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{evento.nombre}</h1>
          <p className="text-sm text-muted">
            {rangoFechas(evento.fecha_inicio, evento.fecha_fin)}
            {evento.lugar ? ` · ${evento.lugar}` : ""}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${COLOR_EVENTO[evento.estado] ?? ""}`}
          >
            {ESTADO_EVENTO[evento.estado] ?? evento.estado}
          </span>
        </div>
        {esAdmin ? <EstadoEventoBotones id={evento.id} estado={evento.estado} /> : null}
      </div>

      {evento.notas ? <p className="whitespace-pre-wrap text-sm">{evento.notas}</p> : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Zonas <span className="text-muted">({zonas.length})</span>
        </h2>

        {zonas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
            Este evento aún no tiene zonas.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {zonas.map((z) => {
              const puedeAsignar = !cerrado && (esAdmin || z.lider_id === yo.id);
              const borrar = borrarZona.bind(null, z.id, evento.id);
              return (
                <li key={z.id} className="flex flex-col gap-3 rounded-2xl border border-foreground/10 p-4">
                  {esAdmin ? (
                    <EditarZonaForm
                      zonaId={z.id}
                      eventoId={evento.id}
                      nombre={z.nombre}
                      liderId={z.lider_id}
                      lideres={lideres}
                    />
                  ) : (
                    <div>
                      <p className="font-semibold">{z.nombre}</p>
                      <p className="text-sm text-muted">Líder: {z.lider?.nombre ?? "sin asignar"}</p>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-xs text-muted">
                      Staff ({z.staff.length})
                    </p>
                    {z.staff.length === 0 ? (
                      <p className="text-sm text-muted">Nadie asignado.</p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-foreground/10 text-sm">
                        {z.staff.map((s) => {
                          const quitar = quitarStaff.bind(null, z.id, s.usuario_id, evento.id);
                          return (
                            <li key={s.usuario_id} className="flex items-center justify-between gap-2 py-1.5">
                              <span>
                                {s.usuario?.nombre ?? "—"}
                                <span className="ml-2 text-xs text-muted">
                                  {ROL_ETIQUETA[s.usuario?.rol as Rol] ?? ""}
                                </span>
                              </span>
                              {puedeAsignar ? (
                                <form action={quitar}>
                                  <button type="submit" className="text-xs text-muted underline hover:text-red-500">
                                    Quitar
                                  </button>
                                </form>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {puedeAsignar ? (
                    <AsignarStaffForm zonaId={z.id} eventoId={evento.id} disponibles={disponibles} />
                  ) : null}

                  {esAdmin ? (
                    <form action={borrar} className="text-right">
                      <button type="submit" className="text-xs text-muted underline hover:text-red-500">
                        Borrar zona
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {esAdmin && !cerrado ? (
          <div className="rounded-2xl border border-foreground/10 p-4">
            <h3 className="mb-3 text-sm font-semibold">Nueva zona</h3>
            <NuevaZonaForm eventoId={evento.id} lideres={lideres} />
          </div>
        ) : null}
      </section>

      {esAdmin ? (
        <section className="rounded-2xl border border-foreground/10 p-5">
          <h2 className="mb-4 font-semibold">Datos del evento</h2>
          <EventoForm
            modo="editar"
            id={evento.id}
            inicial={{
              nombre: evento.nombre,
              lugar: evento.lugar ?? "",
              fecha_inicio: evento.fecha_inicio,
              fecha_fin: evento.fecha_fin,
              notas: evento.notas ?? "",
            }}
          />
        </section>
      ) : null}
    </main>
  );
}
