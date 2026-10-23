"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoPin = { ok?: boolean; error?: string; mensaje?: string; n?: number };

export async function guardarMiPin(prev: EstadoPin, formData: FormData): Promise<EstadoPin> {
  const actual = String(formData.get("actual") ?? "");
  const nuevo = String(formData.get("nuevo") ?? "");
  const confirmar = String(formData.get("confirmar") ?? "");

  if (!/^\d{4,6}$/.test(nuevo)) return { error: "El PIN debe tener de 4 a 6 números." };
  if (nuevo !== confirmar) return { error: "Los dos PIN no coinciden." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("establecer_mi_pin", {
    p_pin: nuevo,
    p_pin_actual: actual || null,
  });
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  const r = data as { ok: boolean; mensaje: string };
  if (!r.ok) return { error: r.mensaje };

  revalidatePath("/mi-credencial");
  revalidatePath("/");
  return { ok: true, mensaje: r.mensaje, n: (prev.n ?? 0) + 1 };
}
