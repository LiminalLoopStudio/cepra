import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COLOR_EVENTO, ESTADO_EVENTO, rangoFechas } from "@/lib/eventos";
import { EventoForm } from "./formularios";

export const metadata: Metadata = { title: "Eventos" };

type Evento = {
  id: string;
  nombre: string;
  lugar: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  zonas: { count: number }[];
};

export default async function EventosPage() {
  const usuario = await requireUsuario();
  const esAdmin = usuario.rol === "administrador";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos")
    .select("id, nombre, lugar, fecha_inicio, fecha_fin, estado, zonas(count)")
    .order("fecha_inicio", { ascending: false });
  const eventos = (data ?? []) as unknown as Evento[];
  // El activo primero; después por fecha (más reciente arriba).
  eventos.sort((a, b) => Number(b.estado === "activo") - Number(a.estado === "activo"));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Inicio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Eventos</h1>
        <p className="text-sm text-muted">
          Cada evento se divide en zonas con su líder y su staff. Solo un evento puede estar activo:
          a ese se presta el equipo.
        </p>
      </div>

      {esAdmin ? (
        <section className="rounded-2xl border border-foreground/10 p-5">
          <h2 className="mb-4 font-semibold">Nuevo evento</h2>
          <EventoForm modo="crear" />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-semibold">
          Eventos <span className="text-muted">({eventos.length})</span>
        </h2>
        {error ? (
          <p className="text-sm text-red-500">No se pudieron cargar: {error.message}</p>
        ) : eventos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
            Aún no hay eventos.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eventos.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/eventos/${e.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-foreground/10 px-4 py-3 hover:border-brand"
                >
                  <div>
                    <p className="font-semibold">{e.nombre}</p>
                    <p className="text-sm text-muted">
                      {rangoFechas(e.fecha_inicio, e.fecha_fin)}
                      {e.lugar ? ` · ${e.lugar}` : ""} · {e.zonas?.[0]?.count ?? 0}{" "}
                      {(e.zonas?.[0]?.count ?? 0) === 1 ? "zona" : "zonas"}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${COLOR_EVENTO[e.estado] ?? ""}`}>
                    {ESTADO_EVENTO[e.estado] ?? e.estado}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
