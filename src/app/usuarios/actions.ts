"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual, type Rol } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES: Rol[] = ["administrador", "almacenista", "lider", "staff"];

// Bloqueo de cuenta en Authentication: ~100 años = "desactivado".
const BLOQUEO = "876000h";

export type EstadoUsuario = {
  ok?: boolean;
  error?: string;
  mensaje?: string;
  n?: number; // contador para limpiar el formulario tras un alta
  valores?: { nombre: string; email: string; rol: string };
};

async function exigirAdmin() {
  const usuario = await getUsuarioActual();
  return usuario?.rol === "administrador" ? usuario : null;
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------
export async function crearUsuario(prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  const valores = {
    nombre: String(formData.get("nombre") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    rol: String(formData.get("rol") ?? ""),
  };
  const password = String(formData.get("password") ?? "");

  if (!(await exigirAdmin())) return { error: "Solo el administrador puede dar de alta usuarios.", valores };
  if (!valores.nombre) return { error: "Escribe el nombre.", valores };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email)) return { error: "Correo no válido.", valores };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres.", valores };
  if (!ROLES.includes(valores.rol as Rol)) return { error: "Elige un rol.", valores };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: valores.email,
    password,
    email_confirm: true, // sin correo de confirmación: el admin responde por la cuenta
    user_metadata: { nombre: valores.nombre },
    app_metadata: { rol: valores.rol },
  });

  if (error) {
    if (error.code === "email_exists" || /already/i.test(error.message)) {
      return { error: "Ya existe un usuario con ese correo.", valores };
    }
    if (error.code === "weak_password") {
      return { error: "La contraseña es muy débil. Usa al menos 8 caracteres.", valores };
    }
    return { error: `No se pudo crear: ${error.message}`, valores };
  }

  // Supabase guarda el usuario ANTES de agregarle app_metadata, así que el
  // trigger de la base crea el perfil como "staff". Aquí se fija el rol real.
  const { error: errorRol } = await admin
    .from("usuarios")
    .update({ rol: valores.rol, nombre: valores.nombre, debe_cambiar_contrasena: true })
    .eq("id", data.user.id);

  if (errorRol) {
    revalidatePath("/usuarios");
    return {
      error: `El usuario se creó, pero no se pudo asignar el rol (${errorRol.message}). Corrígelo en Editar.`,
      valores,
    };
  }

  revalidatePath("/usuarios");
  return {
    ok: true,
    mensaje: `${valores.nombre} creado. Dale su correo y la contraseña temporal: al entrar se le pedirá crear la suya.`,
    n: (prev.n ?? 0) + 1,
  };
}

// ---------------------------------------------------------------------------
// Edición de nombre y rol
// ---------------------------------------------------------------------------
export async function actualizarUsuario(
  id: string,
  _prev: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const rol = String(formData.get("rol") ?? "") as Rol;

  const yo = await exigirAdmin();
  if (!yo) return { error: "Solo el administrador puede editar usuarios." };
  if (!nombre) return { error: "Escribe el nombre." };
  if (!ROLES.includes(rol)) return { error: "Elige un rol." };
  if (id === yo.id && rol !== "administrador") {
    return { error: "No puedes quitarte a ti mismo el rol de administrador." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("usuarios").update({ nombre, rol }).eq("id", id);
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  // Mantiene el rol también en Authentication (por consistencia).
  await admin.auth.admin.updateUserById(id, { app_metadata: { rol }, user_metadata: { nombre } });

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}`);
  return { ok: true, mensaje: "Cambios guardados." };
}

// ---------------------------------------------------------------------------
// Contraseña temporal (cuando alguien la olvida): al entrar deberá cambiarla
// ---------------------------------------------------------------------------
export async function cambiarContrasena(
  id: string,
  _prev: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const password = String(formData.get("password") ?? "");

  if (!(await exigirAdmin())) return { error: "Solo el administrador puede cambiar contraseñas." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { error: `No se pudo cambiar: ${error.message}` };

  await admin.from("usuarios").update({ debe_cambiar_contrasena: true }).eq("id", id);
  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}`);

  return {
    ok: true,
    mensaje: "Contraseña temporal puesta. Al entrar con ella se le pedirá crear la suya.",
    n: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Activar / desactivar (no se borra: su historial se conserva)
// ---------------------------------------------------------------------------
export async function cambiarActivoUsuario(id: string, activo: boolean): Promise<void> {
  const yo = await exigirAdmin();
  if (!yo || id === yo.id) return; // nadie se desactiva a sí mismo

  const admin = createAdminClient();
  await admin.from("usuarios").update({ activo }).eq("id", id);
  // Bloquea (o desbloquea) el inicio de sesión en Authentication.
  await admin.auth.admin.updateUserById(id, { ban_duration: activo ? "none" : BLOQUEO });

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}`);
}
