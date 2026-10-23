import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { COLOR_EVENTO, ESTADO_EVENTO, rangoFechas } from "@/lib/eventos";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documentos maestros" };

type Fila = {
  id: string;
  nombre: string;
  lugar: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  maestro: { estado: string } | null;
  items: { count: number }[];
};

export default async function MaestrosPage() {
  await requireUsuario(["administrador", "almacenista", "lider"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("eventos")
    .select("id, nombre, lugar, fecha_inicio, fecha_fin, estado, maestro(estado), items:maestro_items(count)")
    .order("fecha_inicio", { ascending: false });
  const eventos = (data ?? []) as unknown as Fila[];
  const abiertos = eventos.filter((e) => e.estado !== "cerrado").sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const cerrados = eventos.filter((e) => e.estado === "cerrado").slice(0, 10);

  const tarjeta = (e: Fila) => {
    const n = e.items[0]?.count ?? 0;
    return (
      <Link
        key={e.id}
        href={`/eventos/${e.id}/maestro`}
        className="flex flex-col gap-1.5 rounded-2xl border border-foreground/10 p-4 transition-colors hover:border-brand"
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{e.nombre}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLOR_EVENTO[e.estado] ?? ""}`}>
            {ESTADO_EVENTO[e.estado]}
          </span>
        </span>
        <span className="text-sm text-muted">
          {rangoFechas(e.fecha_inicio, e.fecha_fin)}
          {e.lugar ? ` · ${e.lugar}` : ""}
        </span>
        <span className="text-xs">
          {n === 0 ? (
            <span className="text-muted">Sin documento maestro todavía</span>
          ) : e.maestro?.estado === "cerrado" ? (
            <span className="text-green-500">Cerrado · {n} renglones</span>
          ) : (
            <span className="text-yellow-500">En borrador · {n} renglones</span>
          )}
        </span>
      </Link>
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Inicio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Documentos maestros</h1>
        <p className="text-sm text-muted">
          Antes de cada evento, la organización registra qué equipo sale de la oficina a cada zona y sección, y quién lo
          recibe. Al cerrarlo, almacén recibe los pedidos listos.
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Próximos y en curso</h2>
        {abiertos.length === 0 ? (
          <p className="text-sm text-muted">No hay eventos planeados. Créalos en Eventos y zonas.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{abiertos.map(tarjeta)}</div>
        )}
      </section>
      {cerrados.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Eventos cerrados</h2>
          <div className="grid gap-3 md:grid-cols-2">{cerrados.map(tarjeta)}</div>
        </section>
      ) : null}
    </main>
  );
}
