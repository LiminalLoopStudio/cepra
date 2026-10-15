"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type EstadoAjuste = {
  ok?: boolean;
  error?: string;
  mensaje?: string;
  n?: number; // contador para limpiar el formulario tras cada ajuste
};

const MOTIVOS_ENTRADA = ["compra", "prestamo_recibido", "correccion"];
const MOTIVOS_SALIDA = ["perdida", "baja", "devolucion_propietario", "correccion"];

export async function ajustarStock(
  articuloId: string,
  prev: EstadoAjuste,
  formData: FormData,
): Promise<EstadoAjuste> {
  const usuario = await getUsuarioActual();
  if (!usuario || usuario.rol !== "administrador") {
    return { error: "Solo el administrador puede ajustar existencias." };
  }

  const direccion = String(formData.get("direccion") ?? "");
  const cantidad = Number(formData.get("cantidad") ?? 0);
  const motivo = String(formData.get("motivo") ?? "");
  const nota = String(formData.get("nota") ?? "").trim();

  if (direccion !== "entrada" && direccion !== "salida") {
    return { error: "Elige si vas a agregar o quitar." };
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número entero mayor a 0." };
  }
  const permitidos = direccion === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SALIDA;
  if (!permitidos.includes(motivo)) {
    return { error: "Elige un motivo válido para este movimiento." };
  }

  const delta = direccion === "entrada" ? cantidad : -cantidad;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ajustar_stock", {
    p_articulo: articuloId,
    p_delta: delta,
    p_motivo: motivo,
    p_nota: nota || null,
  });

  if (error) return { error: error.message };

  const r = data as { total: number; disponible: number };
  revalidatePath("/stock");
  revalidatePath(`/stock/${articuloId}`);
  return {
    ok: true,
    mensaje: `${delta > 0 ? "+" : ""}${delta} registrado. Total: ${r.total} · Disponible: ${r.disponible}`,
    n: (prev.n ?? 0) + 1,
  };
}
