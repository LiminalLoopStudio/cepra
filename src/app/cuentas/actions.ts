"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Estado = {
  ok?: boolean;
  error?: string;
  mensaje?: string;
  n?: number;
  valores?: Record<string, string>;
};

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? "").trim();
}

function mensajeError(error: { code?: string; message: string }) {
  if (error.code === "42501") return error.message.startsWith("Solo") ? error.message : "No tienes permiso para hacer esto.";
  if (error.code === "23505") {
    if (error.message.includes("cuentas_correo_por_plataforma")) {
      return "Ese correo ya está registrado en esa plataforma.";
    }
    return "Ya existe una clasificación con ese nombre.";
  }
  return `No se pudo guardar: ${error.message}`;
}

async function puede() {
  const rol = (await getUsuarioActual())?.rol;
  return rol === "administrador" || rol === "lider";
}

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------
function leerCuenta(formData: FormData) {
  const valores = {
    plataforma_id: texto(formData, "plataforma_id"),
    correo: texto(formData, "correo"),
    usuario: texto(formData, "usuario"),
    equipo_id: texto(formData, "equipo_id"),
    notas: texto(formData, "notas"),
  };
  let error: string | undefined;
  if (!valores.plataforma_id) error = "Elige la plataforma.";
  else if (!valores.correo) error = "Escribe el correo de la cuenta.";
  const fila = {
    plataforma_id: valores.plataforma_id,
    correo: valores.correo,
    usuario: valores.usuario || null,
    equipo_id: valores.equipo_id || null,
    notas: valores.notas || null,
  };
  return { valores, fila, error };
}

export async function crearCuenta(prev: Estado, formData: FormData): Promise<Estado> {
  const { valores, fila, error } = leerCuenta(formData);
  if (!(await puede())) return { error: "Solo líderes y administradores registran cuentas.", valores };
  if (error) return { error, valores };

  const supabase = await createClient();
  const { error: e } = await supabase.from("cuentas").insert(fila);
  if (e) return { error: mensajeError(e), valores };

  revalidatePath("/cuentas");
  // Se conserva la plataforma para registrar varias cuentas seguidas.
  return {
    ok: true,
    mensaje: `Cuenta ${fila.correo} registrada.`,
    n: (prev.n ?? 0) + 1,
    valores: { plataforma_id: valores.plataforma_id },
  };
}

export async function actualizarCuenta(id: string, _prev: Estado, formData: FormData): Promise<Estado> {
  const { valores, fila, error } = leerCuenta(formData);
  if (!(await puede())) return { error: "Solo líderes y administradores editan cuentas.", valores };
  if (error) return { error, valores };

  const supabase = await createClient();
  const { error: e } = await supabase.from("cuentas").update(fila).eq("id", id);
  if (e) return { error: mensajeError(e), valores };

  revalidatePath("/cuentas");
  redirect("/cuentas");
}

export async function cambiarActivoCuenta(id: string, activo: boolean): Promise<void> {
  if ((await getUsuarioActual())?.rol !== "administrador") return;
  const supabase = await createClient();
  await supabase.from("cuentas").update({ activo }).eq("id", id);
  revalidatePath("/cuentas");
  revalidatePath(`/cuentas/${id}`);
}

// ---------------------------------------------------------------------------
// Clasificaciones (plataformas)
// ---------------------------------------------------------------------------
export async function crearPlataforma(prev: Estado, formData: FormData): Promise<Estado> {
  const nombre = texto(formData, "nombre");
  if (!(await puede())) return { error: "No tienes permiso.", valores: { nombre } };
  if (!nombre) return { error: "Escribe el nombre.", valores: { nombre } };

  const supabase = await createClient();
  const { error } = await supabase.from("plataformas").insert({ nombre });
  if (error) return { error: mensajeError(error), valores: { nombre } };

  revalidatePath("/cuentas");
  revalidatePath("/cuentas/clasificaciones");
  return { ok: true, mensaje: `Clasificación ${nombre} agregada.`, n: (prev.n ?? 0) + 1 };
}

export async function actualizarPlataforma(id: string, _prev: Estado, formData: FormData): Promise<Estado> {
  const nombre = texto(formData, "nombre");
  const orden = Number(texto(formData, "orden") || "100");
  const valores = { nombre, orden: String(orden) };
  if (!(await puede())) return { error: "No tienes permiso.", valores };
  if (!nombre) return { error: "Escribe el nombre.", valores };
  if (!Number.isInteger(orden) || orden < 0) return { error: "El orden debe ser un número entero.", valores };

  const supabase = await createClient();
  const { error } = await supabase.from("plataformas").update({ nombre, orden }).eq("id", id);
  if (error) return { error: mensajeError(error), valores };

  revalidatePath("/cuentas");
  revalidatePath("/cuentas/clasificaciones");
  return { ok: true, mensaje: "Guardado.", valores };
}

export async function cambiarActivoPlataforma(id: string, activo: boolean): Promise<void> {
  if (!(await puede())) return;
  const supabase = await createClient();
  await supabase.from("plataformas").update({ activo }).eq("id", id);
  revalidatePath("/cuentas");
  revalidatePath("/cuentas/clasificaciones");
}
