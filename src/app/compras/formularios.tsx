"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { CATEGORIAS_COMPRA, ESTADO_FACTURA, PROVEEDORES, TIPO_ARCHIVO } from "@/lib/compras";
import { createClient } from "@/lib/supabase/client";
import { actualizarCompra, crearCompra, type Estado } from "./actions";

export type Opcion = { id: string; texto: string };

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function Aviso({ estado, className = "" }: { estado: Estado; className?: string }) {
  if (estado.error) {
    return (
      <p role="alert" className={`rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500 ${className}`}>
        {estado.error}
      </p>
    );
  }
  if (estado.ok && estado.mensaje) {
    return (
      <p role="status" className={`rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-500 ${className}`}>
        {estado.mensaje}
      </p>
    );
  }
  return null;
}

function Campo({ etiqueta, children, ancho = false, ayuda }: { etiqueta: string; children: React.ReactNode; ancho?: boolean; ayuda?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{etiqueta}</span>
      {children}
      {ayuda ? <span className="text-xs text-muted">{ayuda}</span> : null}
    </label>
  );
}

export type DatosCompra = Record<
  | "fecha"
  | "concepto"
  | "categoria"
  | "proveedor"
  | "cuenta_id"
  | "evento_id"
  | "monto"
  | "moneda"
  | "metodo_pago"
  | "tarjeta_ultimos4"
  | "folio_pedido"
  | "vigencia_hasta"
  | "estado_factura"
  | "folio_factura"
  | "notas",
  string
>;

export function CompraForm(
  props: { cuentas: Opcion[]; eventos: Opcion[]; inicial: DatosCompra } & ({ modo: "crear" } | { modo: "editar"; id: string }),
) {
  const accionServidor = props.modo === "crear" ? crearCompra : actualizarCompra.bind(null, props.id);
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(accionServidor, {});
  const v = (estado.valores as DatosCompra | undefined) ?? props.inicial;

  return (
    <form action={accion} onReset={(e) => e.preventDefault()} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Qué se compró" ancho>
        <input name="concepto" required placeholder="Xbox Game Pass Ultimate 3 meses" defaultValue={v.concepto} className={campo} />
      </Campo>

      <Campo etiqueta="Fecha de compra">
        <input name="fecha" type="date" required defaultValue={v.fecha} className={campo} />
      </Campo>
      <Campo etiqueta="Categoría">
        <select name="categoria" defaultValue={v.categoria || "Suscripción"} className={campo}>
          {CATEGORIAS_COMPRA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Campo>

      <Campo etiqueta="Monto (con impuestos)">
        <input name="monto" inputMode="decimal" required placeholder="499.00" defaultValue={v.monto} className={campo} />
      </Campo>
      <Campo etiqueta="Moneda">
        <select name="moneda" defaultValue={v.moneda || "MXN"} className={campo}>
          <option value="MXN">MXN — pesos</option>
          <option value="USD">USD — dólares</option>
        </select>
      </Campo>

      <Campo etiqueta="Tienda / proveedor">
        <input name="proveedor" list="proveedores" placeholder="Microsoft Store" defaultValue={v.proveedor} className={campo} />
        <datalist id="proveedores">
          {PROVEEDORES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Campo>
      <Campo etiqueta="Folio / número de pedido">
        <input name="folio_pedido" placeholder="Número de orden de la tienda" defaultValue={v.folio_pedido} className={campo} />
      </Campo>

      <Campo etiqueta="Cuenta en la que se compró">
        <select name="cuenta_id" defaultValue={v.cuenta_id} className={campo}>
          <option value="">Ninguna / no aplica</option>
          {props.cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.texto}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Evento">
        <select name="evento_id" defaultValue={v.evento_id} className={campo}>
          <option value="">Sin evento</option>
          {props.eventos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.texto}
            </option>
          ))}
        </select>
      </Campo>

      <Campo etiqueta="Método de pago">
        <input name="metodo_pago" placeholder="Tarjeta empresa, PayPal…" defaultValue={v.metodo_pago} className={campo} />
      </Campo>
      <Campo etiqueta="Tarjeta: últimos 4 dígitos" ayuda="Nunca el número completo.">
        <input
          name="tarjeta_ultimos4"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]{4}"
          placeholder="1234"
          defaultValue={v.tarjeta_ultimos4}
          className={`${campo} font-mono`}
        />
      </Campo>

      <Campo etiqueta="Vigente hasta (suscripciones)">
        <input name="vigencia_hasta" type="date" defaultValue={v.vigencia_hasta} className={campo} />
      </Campo>
      <Campo etiqueta="Factura">
        <select name="estado_factura" defaultValue={v.estado_factura || "pendiente"} className={campo}>
          {Object.entries(ESTADO_FACTURA).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </Campo>

      <Campo etiqueta="Folio / UUID de la factura (opcional)" ancho>
        <input name="folio_factura" placeholder="UUID del CFDI cuando ya esté facturada" defaultValue={v.folio_factura} className={`${campo} font-mono`} />
      </Campo>

      <Campo etiqueta="Notas (opcional)" ancho>
        <textarea
          name="notas"
          rows={2}
          defaultValue={v.notas}
          className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </Campo>

      <Aviso estado={estado} className="sm:col-span-2" />

      <div className="sm:col-span-2">
        <button type="submit" disabled={pendiente} className="h-11 rounded-lg bg-brand px-6 font-semibold text-white disabled:opacity-60">
          {pendiente ? "Guardando…" : props.modo === "crear" ? "Registrar compra" : "Guardar cambios"}
        </button>
        {props.modo === "crear" ? (
          <span className="ml-3 text-sm text-muted">Después podrás adjuntar comprobante y factura.</span>
        ) : null}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Adjuntar archivos: sube directo del navegador a Storage (bucket privado
// "compras"; las reglas de la base solo dejan a líderes y administradores).
// ---------------------------------------------------------------------------
const MAX_MB = 10;

function tipoPorExtension(nombre: string) {
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
  const tipos: Record<string, string> = {
    pdf: "application/pdf",
    xml: "application/xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    heic: "image/heic",
  };
  return tipos[ext] ?? "";
}

export function SubirArchivo({ compraId }: { compraId: string }) {
  const router = useRouter();
  const [tipo, setTipo] = useState("comprobante");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState(0); // limpia el campo de archivo tras subir

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setError(null);
    setSubiendo(true);
    const supabase = createClient();
    try {
      for (const archivo of Array.from(archivos)) {
        if (archivo.size > MAX_MB * 1024 * 1024) {
          throw new Error(`${archivo.name} pesa más de ${MAX_MB} MB.`);
        }
        const limpio = archivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
        const ruta = `${compraId}/${crypto.randomUUID()}-${limpio}`;
        // Windows a veces no dice el tipo del archivo (pasa con los XML): se
        // deduce por la extensión, si no Storage lo rechaza.
        const tipoArchivo = archivo.type || tipoPorExtension(archivo.name);
        const cuerpo = archivo.type ? archivo : new File([archivo], archivo.name, { type: tipoArchivo });
        const { error: e1 } = await supabase.storage
          .from("compras")
          .upload(ruta, cuerpo, { contentType: tipoArchivo || undefined });
        if (e1) throw new Error(`No se pudo subir ${archivo.name}: ${e1.message}`);
        const { error: e2 } = await supabase
          .from("compra_archivos")
          .insert({ compra_id: compraId, tipo, nombre: archivo.name, ruta, tamano: archivo.size });
        if (e2) {
          await supabase.storage.from("compras").remove([ruta]);
          throw new Error(`No se pudo registrar ${archivo.name}: ${e2.message}`);
        }
      }
      setClave((k) => k + 1);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          aria-label="Tipo de archivo"
          className="h-10 rounded-lg border border-foreground/15 bg-background px-3 text-sm"
        >
          {Object.entries(TIPO_ARCHIVO).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
        <label
          className={`flex h-10 cursor-pointer items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white ${subiendo ? "opacity-60" : ""}`}
        >
          {subiendo ? "Subiendo…" : "Elegir archivo…"}
          <input
            key={clave}
            type="file"
            multiple
            disabled={subiendo}
            accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,.xml,application/xml,text/xml"
            onChange={(e) => subir(e.target.files)}
            className="hidden"
          />
        </label>
        <span className="text-xs text-muted">PDF, imagen o XML · máx. {MAX_MB} MB</span>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
