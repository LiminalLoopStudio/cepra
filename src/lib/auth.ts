import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Rol = "administrador" | "almacenista" | "lider" | "staff";

export type UsuarioActual = {
  id: string;
  nombre: string;
  rol: Rol;
};

export const ROL_ETIQUETA: Record<Rol, string> = {
  administrador: "Administrador",
  almacenista: "Almacenista",
  lider: "Líder de zona",
  staff: "Staff",
};

// Lee la sesión y el perfil UNA vez por petición (React cache).
// Devuelve null si no hay sesión, no hay perfil o el usuario está inactivo.
export const getUsuarioActual = cache(async (): Promise<UsuarioActual | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, activo")
    .eq("id", userId)
    .maybeSingle();

  if (!perfil || !perfil.activo) return null;
  return { id: perfil.id, nombre: perfil.nombre, rol: perfil.rol as Rol };
});

// Para páginas y acciones: exige sesión (y opcionalmente ciertos roles).
export async function requireUsuario(roles?: Rol[]): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    // ¿Hay sesión pero el usuario está desactivado (o sin perfil)? Cerrarla,
    // si no quedaría rebotando entre "/" y "/login".
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims?.sub ? "/salir?motivo=inactivo" : "/login");
  }
  if (roles && !roles.includes(usuario.rol)) redirect("/");
  return usuario;
}
