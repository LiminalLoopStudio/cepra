import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { COLOR_FACTURA, dinero, ESTADO_FACTURA, fechaCorta } from "@/lib/compras";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compras" };

type Compra = {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string;
  proveedor: string | null;
  monto: number;
  moneda: string;
  vigencia_hasta: string | null;
  estado_factura: string;
  activo: boolean;
  cuenta: { correo: string; plataforma: { nombre: string } | null } | null;
  evento: { nombre: string } | null;
  archivos: { tipo: string }[];
};

export default async function ComprasPage({ searchParams }: PageProps<"/compras">) {
  await requireUsuario(["administrador", "lider"]);
  const params = await searchParams;
  const factura = typeof params.factura === "string" ? params.factura : "";
  const evento = typeof params.evento === "string" ? params.evento : "";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const anuladas = params.anuladas === "1";

  const supabase = await createClient();
  let consulta = supabase
    .from("compras")
    .select(
      "id, fecha, concepto, categoria, proveedor, monto, moneda, vigencia_hasta, estado_factura, activo, cuenta:cuentas(correo, plataforma:plataformas(nombre)), evento:eventos(nombre), archivos:compra_archivos(tipo)",
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (factura) consulta = consulta.eq("estado_factura", factura);
  if (evento) consulta = consulta.eq("evento_id", evento);
  if (!anuladas) consulta = consulta.eq("activo", true);
  if (q) {
    const limpio = q.replace(/[,()]/g, " ");
    consulta = consulta.or(
      `concepto.ilike.%${limpio}%,proveedor.ilike.%${limpio}%,folio_pedido.ilike.%${limpio}%,folio_factura.ilike.%${limpio}%,notas.ilike.%${limpio}%`,
    );
  }

  const [{ data, error }, { data: eventos }] = await Promise.all([
    consulta,
    supabase.from("eventos").select("id, nombre").order("fecha_inicio", { ascending: false }),
  ]);
  const compras = (data ?? []) as unknown as Compra[];

  // Totales por moneda de lo que se ve (sin anuladas).
  const vigentes = compras.filter((c) => c.activo);
  const total = (lista: Compra[]) =>
    Object.entries(
      lista.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.moneda]: (acc[c.moneda] ?? 0) + Number(c.monto) }), {}),
    )
      .map(([m, s]) => dinero(s, m))
      .join(" + ") || dinero(0, "MXN");
  const pendientes = vigentes.filter((c) => c.estado_factura === "pendiente");
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const en15 = new Date(Date.now() + 15 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const porVencer = vigentes.filter((c) => c.vigencia_hasta && c.vigencia_hasta >= hoy && c.vigencia_hasta <= en15);

  const enlace = (cambios: Record<string, string>) => {
    const s = new URLSearchParams({
      ...(factura ? { factura } : {}),
      ...(evento ? { evento } : {}),
      ...(q ? { q } : {}),
      ...(anuladas ? { anuladas: "1" } : {}),
      ...cambios,
    });
    for (const [k, val] of [...s.entries()]) if (!val) s.delete(k);
    const t = s.toString();
    return t ? `/compras?${t}` : "/compras";
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Compras</h1>
          <p className="text-sm text-muted">
            Suscripciones, juegos y servicios comprados para los eventos, con su comprobante y factura.
          </p>
        </div>
        <Link href="/compras/nueva" className="flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white">
          + Registrar compra
        </Link>
      </div>

      {/* Resumen de lo filtrado */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-foreground/10 p-4">
          <p className="text-xs text-muted">
            Total ({vigentes.length} {vigentes.length === 1 ? "compra" : "compras"})
          </p>
          <p className="text-lg font-semibold">{total(vigentes)}</p>
        </div>
        <Link href={enlace({ factura: "pendiente" })} className="rounded-xl border border-foreground/10 p-4 hover:border-brand">
          <p className="text-xs text-muted">Por facturar ({pendientes.length})</p>
          <p className="text-lg font-semibold">{total(pendientes)}</p>
        </Link>
        <div className="rounded-xl border border-foreground/10 p-4">
          <p className="text-xs text-muted">Suscripciones que vencen en 15 días</p>
          <p className="text-lg font-semibold">{porVencer.length}</p>
        </div>
      </div>

      {/* Filtros */}
      <form action="/compras" className="flex flex-wrap items-center gap-2">
        <select name="factura" defaultValue={factura} className="h-10 rounded-lg border border-foreground/15 bg-background px-3 text-sm">
          <option value="">Factura: todas</option>
          {Object.entries(ESTADO_FACTURA).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
        <select name="evento" defaultValue={evento} className="h-10 rounded-lg border border-foreground/15 bg-background px-3 text-sm">
          <option value="">Evento: todos</option>
          {(eventos ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        {anuladas ? <input type="hidden" name="anuladas" value="1" /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar concepto, tienda, folio…"
          className="h-10 min-w-56 flex-1 rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus:border-brand"
        />
        <button type="submit" className="h-10 rounded-lg border border-foreground/15 px-4 text-sm hover:border-brand">
          Filtrar
        </button>
        <Link href="/compras" className="text-sm text-muted underline">
          Limpiar
        </Link>
        <Link href={enlace({ anuladas: anuladas ? "" : "1" })} className="text-sm text-muted underline">
          {anuladas ? "Ocultar anuladas" : "Ver anuladas"}
        </Link>
      </form>

      {error ? (
        <p className="text-sm text-red-500">No se pudieron cargar: {error.message}</p>
      ) : compras.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
          {factura || evento || q ? "No hay compras con ese filtro." : "Aún no hay compras registradas."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-foreground/10">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-foreground/5 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Concepto</th>
                <th className="px-4 py-2 font-medium">Cuenta</th>
                <th className="px-4 py-2 font-medium">Evento</th>
                <th className="px-4 py-2 text-right font-medium">Monto</th>
                <th className="px-4 py-2 font-medium">Factura</th>
                <th className="px-4 py-2 font-medium">Archivos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {compras.map((c) => {
                const tieneComprobante = c.archivos.some((a) => a.tipo === "comprobante");
                return (
                  <tr key={c.id} className={c.activo ? "" : "opacity-50"}>
                    <td className="whitespace-nowrap px-4 py-2">{fechaCorta(c.fecha)}</td>
                    <td className="px-4 py-2">
                      <Link href={`/compras/${c.id}`} className="font-medium text-brand hover:underline">
                        {c.concepto}
                      </Link>
                      <span className="block text-xs text-muted">
                        {c.categoria}
                        {c.proveedor ? ` · ${c.proveedor}` : ""}
                        {c.vigencia_hasta ? ` · vence ${fechaCorta(c.vigencia_hasta)}` : ""}
                        {c.activo ? "" : " · ANULADA"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {c.cuenta ? `${c.cuenta.plataforma?.nombre ?? ""} · ${c.cuenta.correo}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">{c.evento?.nombre ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{dinero(Number(c.monto), c.moneda)}</td>
                    <td className="px-4 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${COLOR_FACTURA[c.estado_factura] ?? ""}`}>
                        {ESTADO_FACTURA[c.estado_factura] ?? c.estado_factura}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {c.archivos.length}
                      {!tieneComprobante ? <span className="ml-1 text-yellow-500">· sin comprobante</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
