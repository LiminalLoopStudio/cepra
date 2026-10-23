"use server";

import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoCambio = { error?: string };

// La persona cambia SU contraseña (la temporal o la que ya tenía).
// Nada aquí debe "tronar": cualquier falla se muestra como mensaje en el
// formulario y queda en los logs del contenedor (docker compose logs).
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

  // 1) Cambiar la contraseña en Supabase Auth.
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) {
      console.error("[cambiar-contrasena] updateUser:", error.code, error.message);
      if (error.code === "same_password") {
        return { error: "Debe ser distinta a la contraseña actual." };
      }
      if (error.code === "weak_password") {
        return { error: "La contraseña es muy débil. Usa una más larga o con números." };
      }
      if (error.code === "reauthentication_needed") {
        return { error: "Por seguridad, sal y vuelve a entrar antes de cambiarla." };
      }
      return { error: `No se pudo cambiar: ${error.message}` };
    }
  } catch (e) {
    console.error("[cambiar-contrasena] excepción en updateUser:", e);
    return { error: "No se pudo cambiar la contraseña (error del servidor). Intenta de nuevo." };
  }

  // 2) Quitar la marca de "temporal". Si esto falla la contraseña YA cambió:
  //    se avisa, pero no se pierde el cambio.
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("usuarios")
      .update({ debe_cambiar_contrasena: false })
      .eq("id", usuario.id);
    if (error) {
      console.error("[cambiar-contrasena] marca temporal:", error.code, error.message);
      return {
        error:
          "Tu contraseña nueva ya quedó guardada, pero no se pudo quitar el aviso de contraseña temporal. Avisa al administrador.",
      };
    }
  } catch (e) {
    console.error("[cambiar-contrasena] excepción al quitar la marca:", e);
    return {
      error:
        "Tu contraseña nueva ya quedó guardada, pero no se pudo quitar el aviso de contraseña temporal. Avisa al administrador.",
    };
  }

  // redirect() va fuera de los try: lanza una excepción especial a propósito.
  redirect("/?contrasena=ok");
}
