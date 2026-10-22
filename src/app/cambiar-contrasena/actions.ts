"use server";

import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoCambio = { error?: string };

// La persona cambia SU contraseña (la temporal o la que ya tenía).
export async function cambiarMiContrasena(
  _prev: EstadoCambio,
  formData: FormData,
): Promise<EstadoCambio> {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");

  const nueva = String(formData.get("nueva") ?? "");
  const confirmar = String(formData.get("confirmar") ?? "");

  if (nueva.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (nueva !== confirmar) return { error: "Las dos contraseñas no coinciden." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) {
    if (error.code === "same_password") {
      return { error: "Debe ser distinta a la contraseña actual." };
    }
    if (error.code === "weak_password") {
      return { error: "La contraseña es muy débil. Usa una más larga o con números." };
    }
    return { error: `No se pudo cambiar: ${error.message}` };
  }

  // Ya no es temporal. Solo el servidor (llave secreta) puede quitar la marca.
  const admin = createAdminClient();
  await admin.from("usuarios").update({ debe_cambiar_contrasena: false }).eq("id", usuario.id);

  redirect("/?contrasena=ok");
}
