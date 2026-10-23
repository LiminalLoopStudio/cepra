import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { ABIERTAS, COLOR_SOLICITUD, ESTADO_SOLICITUD, fechaHora, resumenItems } from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Solicitudes" };

type Fila = {
  id: string;
  folio: number;
  estado: string;
  necesita_para: string | null;
  created_at: string;
  solicitante_id: string;
  zona: { nombre: string; lider_id: string | null } | null;
  evento: { nombre: string } | null;
  solicitante: { nombre: string } | null;
  items: { cantidad: number; articulo: { nombre: string } | null }[];
};

function Tarjeta({ s }: { s: Fila }) {
  return (
    <Link
      href={`/solicitudes/${s.id}`}
      className="flex flex-col gap-1.5 rounded-2xl border border-foreground/10 p-4 transition-colors hover:border-brand"
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          Solicitud <span className="font-mono">#{s.folio}</span>
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COLOR_SOLICITUD[s.estado]}`}>
          {ESTADO_SOLICITUD[s.estado]}
        </span>
      </span>
      <span className="text-sm">{resumenItems(s.items)}</span>
      <span className="text-xs text-muted">
        {s.solicitante?.nombre} · Zona {s.zona?.nombre} · {s.evento?.nombre}
        {s.necesita_para ? ` · para ${fechaHora(s.necesita_para)}` : ""}
      </span>
    </Link>
  );
}

function Seccion({ titulo, ayuda, filas }: { titulo: string; ayuda?: string; filas: Fila[] }) {
  if (filas.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">
          {titulo} <span className="text-muted">({filas.length})</span>
        </h2>
        {ayuda ? <p className="text-sm text-muted">{ayuda}</p> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {filas.map((s) => (
          <Tarjeta key={s.id} s={s} />
        ))}
      </div>
    </section>
  );
}

export default async function SolicitudesPage({ searchParams }: PageProps<"/solicitudes">) {
  const yo = await requireUsuario();
  const { ver } = await searchParams;
  const todas = ver === "todas";
  const admin = yo.rol === "administrador";
  const almacen = admin || yo.rol === "almacenista";

  const supabase = await createClient();
  // RLS: almacén y admin ven todas; el líder las de su zona; cada quien las suyas.
  let consulta = supabase
    .from("solicitudes")
    .select(
      "id, folio, estado, necesita_para, created_at, solicitante_id, zona:zonas(nombre, lider_id), evento:eventos(nombre), solicitante:usuarios!solicitudes_solicitante_id_fkey(nombre), items:solicitud_items(cantidad, articulo:catalogo_articulos(nombre))",
    )
    .order("folio", { ascending: false })
    .limit(300);
  if (!todas) consulta = consulta.in("estado", ABIERTAS);
  const { data } = await consulta;
  const filas = (data ?? []) as unknown as Fila[];

  const lideraZona = (s: Fila) => admin || s.zona?.lider_id === yo.id;
  const porAprobar = filas.filter((s) => s.estado === "pendiente" && lideraZona(s));
  const porPreparar = almacen ? filas.filter((s) => s.estado === "aprobada") : [];
  const listas = almacen ? filas.filter((s) => s.estado === "lista") : [];
  const usadas = new Set([...porAprobar, ...porPreparar, ...listas].map((s) => s.id));
  const mias = filas.filter((s) => s.solicitante_id === yo.id && !usadas.has(s.id));
  mias.forEach((s) => usadas.add(s.id));
  const resto = filas.filter((s) => !usadas.has(s.id));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Solicitudes</h1>
          <p className="text-sm text-muted">
            Pide el equipo que necesita tu zona. El líder aprueba, almacén lo aparta y lo recoges firmando con tu PIN.
          </p>
        </div>
        <Link href="/solicitudes/nueva" className="flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white">
          Nueva solicitud
        </Link>
      </div>

      <nav className="flex gap-2 text-sm">
        <Link
          href="/solicitudes"
          className={`rounded-full px-3 py-1 ${!todas ? "bg-brand/15 font-semibold text-brand" : "text-muted hover:text-foreground"}`}
        >
          Abiertas
        </Link>
        <Link
          href="/solicitudes?ver=todas"
          className={`rounded-full px-3 py-1 ${todas ? "bg-brand/15 font-semibold text-brand" : "text-muted hover:text-foreground"}`}
        >
          Todas
        </Link>
      </nav>

      {filas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-foreground/15 p-8 text-center text-sm text-muted">
          {todas ? "Todavía no hay solicitudes." : "No hay solicitudes abiertas."}
        </p>
      ) : null}

      <Seccion titulo="Por aprobar" ayuda="Pedidos de tu staff: revísalos, ajústalos si hace falta y apruébalos." filas={porAprobar} />
      <Seccion titulo="Por preparar" ayuda="Aprobadas: aparta las piezas y cantidades." filas={porPreparar} />
      <Seccion titulo="Listas para recoger" ayuda="Se entregan en Entregar, al escanear la credencial de quien pidió." filas={listas} />
      <Seccion titulo="Mis solicitudes" filas={mias} />
      <Seccion titulo={almacen ? "Otras" : "De mi zona"} filas={resto} />
    </main>
  );
}
