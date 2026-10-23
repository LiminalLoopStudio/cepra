import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { puedeLiderar, requireUsuario, ROL_ETIQUETA, type Rol } from "@/lib/auth";
import { COLOR_EVENTO, ESTADO_EVENTO, rangoFechas } from "@/lib/eventos";
import { createClient } from "@/lib/supabase/server";
import { borrarSeccion, borrarZona, moverStaff, quitarStaff } from "../actions";
import {
  AsignarStaffForm,
  EditarSeccionForm,
  EditarZonaForm,
  EstadoEventoBotones,
  EventoForm,
  NuevaSeccionForm,
  NuevaZonaForm,
  type Persona,
} from "../formularios";

export const metadata: Metadata = { title: "Evento" };

type Seccion = {
  id: string;
  nombre: string;
  lider_id: string | null;
  lider: { nombre: string } | null;
};

type Zona = {
  id: string;
  nombre: string;
  lider_id: string | null;
  lider: { nombre: string } | null;
  secciones: Seccion[];
  staff: { usuario_id: string; seccion_id: string | null; usuario: { nombre: string; rol: string } | null }[];
};

export default async function EventoPage({ params }: PageProps<"/eventos/[id]">) {
  const yo = await requireUsuario();
  const esAdmin = yo.rol === "administrador"; // incluye Coordinación, PM y Stage Manager
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: evento }, { data: zonasData }, { data: personas }, { data: maestro }] = await Promise.all([
    supabase
      .from("eventos")
      .select("id, nombre, lugar, fecha_inicio, fecha_fin, estado, notas")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("zonas")
      .select(
        "id, nombre, lider_id, lider:usuarios!zonas_lider_id_fkey(nombre), secciones(id, nombre, lider_id, lider:usuarios!secciones_lider_id_fkey(nombre)), staff:zona_staff(usuario_id, seccion_id, usuario:usuarios(nombre, rol))",
      )
      .eq("evento_id", id)
      .order("nombre"),
    supabase.from("usuarios").select("id, nombre, rol").eq("activo", true).order("nombre"),
    supabase.from("maestro").select("estado").eq("evento_id", id).maybeSingle(),
  ]);
  if (!evento) notFound();

  const zonas = (zonasData ?? []) as unknown as Zona[];
  zonas.forEach((z) => z.secciones.sort((a, b) => a.nombre.localeCompare(b.nombre)));
  const activos = (personas ?? []) as Persona[];
  const lideres = activos.filter((p) => puedeLiderar(p.rol));
  // Ya tienen lugar en este evento: staff, líderes de zona y líderes de sección.
  const conLugar = new Set([
    ...zonas.flatMap((z) => z.staff.map((s) => s.usuario_id)),
    ...zonas.flatMap((z) => (z.lider_id ? [z.lider_id] : [])),
    ...zonas.flatMap((z) => z.secciones.flatMap((s) => (s.lider_id ? [s.lider_id] : []))),
  ]);
  const disponibles = activos.filter((p) => !conLugar.has(p.id));
  // Una persona solo lidera un lugar por evento: en cada selector se ofrecen
  // los que no lideran nada más (y el líder actual de ese lugar).
  const yaLideran = new Set([
    ...zonas.flatMap((z) => (z.lider_id ? [z.lider_id] : [])),
    ...zonas.flatMap((z) => z.secciones.flatMap((s) => (s.lider_id ? [s.lider_id] : []))),
  ]);
  const lideresPara = (actual: string | null) => lideres.filter((p) => p.id === actual || !yaLideran.has(p.id));
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

      <nav className="flex gap-1 border-b border-foreground/10 text-sm">
        <span className="border-b-2 border-brand px-3 py-2 font-semibold text-brand">Zonas y personal</span>
        <Link href={`/eventos/${evento.id}/maestro`} className="px-3 py-2 text-muted hover:text-foreground">
          Documento maestro
          {maestro ? (
            <span className="ml-1.5 rounded-full bg-foreground/10 px-2 py-0.5 text-xs">
              {maestro.estado === "cerrado" ? "cerrado" : "borrador"}
            </span>
          ) : null}
        </Link>
      </nav>

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
          <ul className="flex flex-col gap-4">
            {zonas.map((z) => {
              const puedeAsignar = !cerrado && (esAdmin || z.lider_id === yo.id);
              const borrar = borrarZona.bind(null, z.id, evento.id);
              const grupos = [
                ...z.secciones.map((s) => ({ seccion: s as Seccion | null, staff: z.staff.filter((x) => x.seccion_id === s.id) })),
                { seccion: null, staff: z.staff.filter((x) => !x.seccion_id) },
              ].filter((g) => g.seccion || g.staff.length > 0 || z.secciones.length === 0);

              return (
                <li key={z.id} className="flex flex-col gap-4 rounded-2xl border border-foreground/10 p-4">
                  {esAdmin ? (
                    <EditarZonaForm
                      zonaId={z.id}
                      eventoId={evento.id}
                      nombre={z.nombre}
                      liderId={z.lider_id}
                      lideres={lideresPara(z.lider_id)}
                    />
                  ) : (
                    <div>
                      <p className="font-semibold">{z.nombre}</p>
                      <p className="text-sm text-muted">Líder de zona: {z.lider?.nombre ?? "sin asignar"}</p>
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    {grupos.map((g) => (
                      <div key={g.seccion?.id ?? "general"} className="flex flex-col gap-2 rounded-xl bg-foreground/[0.03] p-3">
                        {g.seccion ? (
                          puedeAsignar ? (
                            <EditarSeccionForm
                              seccionId={g.seccion.id}
                              eventoId={evento.id}
                              nombre={g.seccion.nombre}
                              liderId={g.seccion.lider_id}
                              lideres={lideresPara(g.seccion.lider_id)}
                            />
                          ) : (
                            <div>
                              <p className="font-medium">{g.seccion.nombre}</p>
                              <p className="text-xs text-muted">Líder: {g.seccion.lider?.nombre ?? "sin asignar"}</p>
                            </div>
                          )
                        ) : (
                          <p className="text-sm font-medium">
                            {z.secciones.length > 0 ? "Zona general (sin sección)" : "Staff de la zona"}
                          </p>
                        )}

                        {g.staff.length === 0 ? (
                          <p className="text-xs text-muted">Sin staff.</p>
                        ) : (
                          <ul className="flex flex-col divide-y divide-foreground/10 text-sm">
                            {g.staff.map((s) => {
                              const quitar = quitarStaff.bind(null, z.id, s.usuario_id, evento.id);
                              const mover = moverStaff.bind(null, z.id, s.usuario_id, evento.id);
                              return (
                                <li key={s.usuario_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                  <span>
                                    {s.usuario?.nombre ?? "—"}
                                    <span className="ml-2 text-xs text-muted">{ROL_ETIQUETA[s.usuario?.rol as Rol] ?? ""}</span>
                                  </span>
                                  {puedeAsignar ? (
                                    <span className="flex items-center gap-2">
                                      {z.secciones.length > 0 ? (
                                        <form action={mover}>
                                          <select
                                            name="seccion_id"
                                            defaultValue={s.seccion_id ?? ""}
                                            aria-label="Mover a sección"
                                            className="h-8 rounded-md border border-foreground/15 bg-background px-1 text-xs"
                                          >
                                            <option value="">General</option>
                                            {z.secciones.map((sec) => (
                                              <option key={sec.id} value={sec.id}>
                                                {sec.nombre}
                                              </option>
                                            ))}
                                          </select>
                                          <button type="submit" className="ml-1 text-xs text-brand underline">
                                            Mover
                                          </button>
                                        </form>
                                      ) : null}
                                      <form action={quitar}>
                                        <button type="submit" className="text-xs text-muted underline hover:text-red-500">
                                          Quitar
                                        </button>
                                      </form>
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {g.seccion && puedeAsignar && g.staff.length === 0 ? (
                          <form action={borrarSeccion.bind(null, g.seccion.id, evento.id)}>
                            <button type="submit" className="text-xs text-muted underline hover:text-red-500">
                              Borrar sección
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {puedeAsignar ? (
                    <div className="flex flex-col gap-2 border-t border-foreground/10 pt-3">
                      <AsignarStaffForm
                        zonaId={z.id}
                        eventoId={evento.id}
                        disponibles={disponibles}
                        secciones={z.secciones.map((s) => ({ id: s.id, nombre: s.nombre }))}
                      />
                      <NuevaSeccionForm zonaId={z.id} eventoId={evento.id} lideres={lideresPara(null)} />
                    </div>
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
            <NuevaZonaForm eventoId={evento.id} lideres={lideresPara(null)} />
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
