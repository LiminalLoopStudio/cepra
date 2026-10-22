import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { COLOR_FACTURA, dinero, ESTADO_FACTURA, fechaCorta, TIPO_ARCHIVO } from "@/lib/compras";
import { createClient } from "@/lib/supabase/server";
import { borrarArchivo, cambiarActivoCompra } from "../actions";
import { CompraForm, SubirArchivo } from "../formularios";
import { opcionesCompra } from "../opciones";

export const metadata: Metadata = { title: "Compra" };

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });
}

function peso(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

type Compra = {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string;
  proveedor: string | null;
  cuenta_id: string | null;
  evento_id: string | null;
  monto: number;
  moneda: string;
  metodo_pago: string | null;
  tarjeta_ultimos4: string | null;
  folio_pedido: string | null;
  vigencia_hasta: string | null;
  estado_factura: string;
  folio_factura: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  creador: { nombre: string } | null;
  editor: { nombre: string } | null;
};

type Archivo = { id: string; tipo: string; nombre: string; ruta: string; tamano: number | null; created_at: string };

export default async function CompraPage({ params, searchParams }: PageProps<"/compras/[id]">) {
  const yo = await requireUsuario(["administrador", "lider"]);
  const { id } = await params;
  const { nueva } = await searchParams;

  const supabase = await createClient();
  const [{ data: compra }, { data: archivosData }, opciones] = await Promise.all([
    supabase
      .from("compras")
      .select(
        "id, fecha, concepto, categoria, proveedor, cuenta_id, evento_id, monto, moneda, metodo_pago, tarjeta_ultimos4, folio_pedido, vigencia_hasta, estado_factura, folio_factura, notas, activo, created_at, updated_at, creador:usuarios!compras_creado_por_fkey(nombre), editor:usuarios!compras_actualizado_por_fkey(nombre)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("compra_archivos")
      .select("id, tipo, nombre, ruta, tamano, created_at")
      .eq("compra_id", id)
      .order("created_at"),
    opcionesCompra(),
  ]);
  if (!compra) notFound();
  const c = compra as unknown as Compra;
  const archivos = (archivosData ?? []) as Archivo[];

  // Enlaces de descarga temporales (10 minutos): el bucket es privado.
  const { data: firmados } = archivos.length
    ? await supabase.storage.from("compras").createSignedUrls(archivos.map((a) => a.ruta), 600)
    : { data: [] };
  const urlDe = new Map((firmados ?? []).map((f) => [f.path, f.signedUrl]));
  const alternar = cambiarActivoCompra.bind(null, c.id, !c.activo);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/compras" className="text-sm text-muted hover:text-foreground">
            ← Compras
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{c.concepto}</h1>
          <p className="text-sm text-muted">
            {fechaCorta(c.fecha)} · {dinero(Number(c.monto), c.moneda)}
            {c.activo ? "" : " · ANULADA"}
          </p>
          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${COLOR_FACTURA[c.estado_factura] ?? ""}`}>
            {ESTADO_FACTURA[c.estado_factura] ?? c.estado_factura}
          </span>
        </div>
        <p className="text-xs text-muted">
          Registrada {fechaHora(c.created_at)}
          {c.creador ? ` por ${c.creador.nombre}` : ""}
          <br />
          Último cambio {fechaHora(c.updated_at)}
          {c.editor ? ` por ${c.editor.nombre}` : ""}
        </p>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-1 font-semibold">Comprobante y factura</h2>
        {nueva === "1" && archivos.length === 0 ? (
          <p className="mb-3 text-sm text-green-500">Compra registrada. Ahora adjunta el comprobante de pago.</p>
        ) : (
          <p className="mb-3 text-sm text-muted">Comprobante de pago, factura PDF y XML, capturas de la orden.</p>
        )}
        {archivos.length > 0 ? (
          <ul className="mb-4 flex flex-col divide-y divide-foreground/10 text-sm">
            {archivos.map((a) => {
              const borrar = borrarArchivo.bind(null, a.id, a.ruta, c.id);
              const url = urlDe.get(a.ruta);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="mr-2 rounded bg-foreground/5 px-2 py-0.5 text-xs">{TIPO_ARCHIVO[a.tipo] ?? a.tipo}</span>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                        {a.nombre}
                      </a>
                    ) : (
                      a.nombre
                    )}
                    <span className="ml-2 text-xs text-muted">{peso(a.tamano)}</span>
                  </span>
                  <form action={borrar}>
                    <button type="submit" className="text-xs text-muted underline hover:text-red-500">
                      Quitar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}
        <SubirArchivo compraId={c.id} />
      </section>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-4 font-semibold">Datos de la compra</h2>
        <CompraForm
          modo="editar"
          id={c.id}
          cuentas={opciones.cuentas}
          eventos={opciones.eventos}
          inicial={{
            fecha: c.fecha,
            concepto: c.concepto,
            categoria: c.categoria,
            proveedor: c.proveedor ?? "",
            cuenta_id: c.cuenta_id ?? "",
            evento_id: c.evento_id ?? "",
            monto: String(c.monto),
            moneda: c.moneda,
            metodo_pago: c.metodo_pago ?? "",
            tarjeta_ultimos4: c.tarjeta_ultimos4 ?? "",
            folio_pedido: c.folio_pedido ?? "",
            vigencia_hasta: c.vigencia_hasta ?? "",
            estado_factura: c.estado_factura,
            folio_factura: c.folio_factura ?? "",
            notas: c.notas ?? "",
          }}
        />
      </section>

      {yo.rol === "administrador" ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-foreground/10 p-5">
          <div>
            <h2 className="font-semibold">{c.activo ? "Compra vigente" : "Compra anulada"}</h2>
            <p className="text-sm text-muted">
              {c.activo
                ? "Anúlala si se registró por error o se canceló. No se borra: queda el registro."
                : "No cuenta en los totales. Puedes reactivarla."}
            </p>
          </div>
          <form action={alternar}>
            <button
              type="submit"
              className={`h-11 rounded-lg px-5 font-medium ${
                c.activo ? "border border-red-500/40 text-red-500 hover:bg-red-500/10" : "bg-brand text-white"
              }`}
            >
              {c.activo ? "Anular" : "Reactivar"}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
