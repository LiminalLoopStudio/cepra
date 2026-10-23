import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { esRolAdmin, type Rol } from "./auth-etiquetas";

export { esRolAdmin, puedeLiderar, ROL_ETIQUETA, ROLES_ORGANIZACION, type Rol } from "./auth-etiquetas";

export type UsuarioActual = {
  id: string;
  nombre: string;
  // Para permisos: Coordinación, Project Manager y Stage Manager cuentan como
  // "administrador" (igual que en la base de datos, es_admin()).
  rol: Rol;
  // El rol tal cual, para mostrarlo en pantalla.
  rolReal: Rol;
  debeCambiarContrasena: boolean; // tiene una contraseña temporal puesta por el admin
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
    .select("id, nombre, rol, activo, debe_cambiar_contrasena")
    .eq("id", userId)
    .maybeSingle();

  if (!perfil || !perfil.activo) return null;
  return {
    id: perfil.id,
    nombre: perfil.nombre,
    rol: esRolAdmin(perfil.rol) ? "administrador" : (perfil.rol as Rol),
    rolReal: perfil.rol as Rol,
    debeCambiarContrasena: Boolean(perfil.debe_cambiar_contrasena),
  };
});

// Para páginas y acciones: exige sesión (y opcionalmente ciertos roles).
// Si la persona entró con una contraseña temporal, la manda a crear la suya
// antes de dejarle usar cualquier pantalla.
export async function requireUsuario(roles?: Rol[]): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    // ¿Hay sesión pero el usuario está desactivado (o sin perfil)? Cerrarla,
    // si no quedaría rebotando entre "/" y "/login".
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims?.sub ? "/salir?motivo=inactivo" : "/login");
  }
  if (usuario.debeCambiarContrasena) redirect("/cambiar-contrasena");
  if (roles && !roles.includes(usuario.rol)) redirect("/");
  return usuario;
}
