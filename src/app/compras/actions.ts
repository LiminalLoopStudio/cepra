"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { ESTADO_FACTURA } from "@/lib/compras";
import { createClient } from "@/lib/supabase/server";

export type Estado = {
  ok?: boolean;
  error?: string;
  mensaje?: string;
  valores?: Record<string, string>;
};

const CAMPOS = [
  "fecha",
  "concepto",
  "categoria",
  "proveedor",
  "cuenta_id",
  "evento_id",
  "monto",
  "moneda",
  "metodo_pago",
  "tarjeta_ultimos4",
  "folio_pedido",
  "vigencia_hasta",
  "estado_factura",
  "folio_factura",
  "notas",
] as const;

function leerCompra(formData: FormData) {
  const valores = Object.fromEntries(
    CAMPOS.map((c) => [c, String(formData.get(c) ?? "").trim()]),
  ) as Record<(typeof CAMPOS)[number], string>;

  const monto = Number(valores.monto.replace(/[$,\s]/g, ""));
  let error: string | undefined;
  if (!valores.fecha) error = "Pon la fecha de la compra.";
  else if (!valores.concepto) error = "Escribe qué se compró.";
  else if (!valores.monto || !Number.isFinite(monto) || monto < 0) error = "El monto debe ser un número, 0 o mayor.";
  else if (valores.tarjeta_ultimos4 && !/^\d{4}$/.test(valores.tarjeta_ultimos4)) {
    error = "De la tarjeta escribe solo los últimos 4 dígitos.";
  } else if (!(valores.estado_factura in ESTADO_FACTURA)) error = "Elige el estado de la factura.";

  const nulo = (s: string) => s || null;
  const fila = {
    fecha: valores.fecha,
    concepto: valores.concepto,
    categoria: valores.categoria || "Otro",
    proveedor: nulo(valores.proveedor),
    cuenta_id: nulo(valores.cuenta_id),
    evento_id: nulo(valores.evento_id),
    monto: Math.round(monto * 100) / 100,
    moneda: valores.moneda || "MXN",
    metodo_pago: nulo(valores.metodo_pago),
    tarjeta_ultimos4: nulo(valores.tarjeta_ultimos4),
    folio_pedido: nulo(valores.folio_pedido),
    vigencia_hasta: nulo(valores.vigencia_hasta),
    estado_factura: valores.estado_factura,
    folio_factura: nulo(valores.folio_factura),
    notas: nulo(valores.notas),
  };
  return { valores, fila, error };
}

function mensajeError(error: { code?: string; message: string }) {
  if (error.code === "42501") return error.message.startsWith("Solo") ? error.message : "No tienes permiso para hacer esto.";
  if (error.code === "23514") return "Algún dato no es válido (monto, moneda o últimos 4 dígitos).";
  return `No se pudo guardar: ${error.message}`;
}

async function puede() {
  const rol = (await getUsuarioActual())?.rol;
  return rol === "administrador" || rol === "lider";
}

export async function crearCompra(_prev: Estado, formData: FormData): Promise<Estado> {
  const { valores, fila, error } = leerCompra(formData);
  if (!(await puede())) return { error: "Solo líderes y administradores registran compras.", valores };
  if (error) return { error, valores };

  const supabase = await createClient();
  const { data, error: e } = await supabase.from("compras").insert(fila).select("id").single();
  if (e) return { error: mensajeError(e), valores };

  revalidatePath("/compras");
  // A la ficha, para adjuntar el comprobante.
  redirect(`/compras/${data.id}?nueva=1`);
}

export async function actualizarCompra(id: string, _prev: Estado, formData: FormData): Promise<Estado> {
  const { valores, fila, error } = leerCompra(formData);
  if (!(await puede())) return { error: "Solo líderes y administradores editan compras.", valores };
  if (error) return { error, valores };

  const supabase = await createClient();
  const { error: e } = await supabase.from("compras").update(fila).eq("id", id);
  if (e) return { error: mensajeError(e), valores };

  revalidatePath("/compras");
  revalidatePath(`/compras/${id}`);
  return { ok: true, mensaje: "Cambios guardados.", valores };
}

export async function cambiarActivoCompra(id: string, activo: boolean): Promise<void> {
  if ((await getUsuarioActual())?.rol !== "administrador") return;
  const supabase = await createClient();
  await supabase.from("compras").update({ activo }).eq("id", id);
  revalidatePath("/compras");
  revalidatePath(`/compras/${id}`);
}

// Borra el archivo de Storage y su registro.
export async function borrarArchivo(archivoId: string, ruta: string, compraId: string): Promise<void> {
  if (!(await puede())) return;
  const supabase = await createClient();
  await supabase.storage.from("compras").remove([ruta]);
  await supabase.from("compra_archivos").delete().eq("id", archivoId);
  revalidatePath(`/compras/${compraId}`);
  revalidatePath("/compras");
}
