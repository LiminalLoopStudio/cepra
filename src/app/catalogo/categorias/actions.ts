"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type EstadoCategoria = {
  ok?: boolean;
  error?: string;
  mensaje?: string;
  n?: number; // contador para limpiar el formulario tras un alta
  valores?: { nombre: string; prefijo: string };
};

function leer(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    prefijo: String(formData.get("prefijo") ?? "").trim().toUpperCase(),
  };
}

function validar(v: { nombre: string; prefijo: string }) {
  if (!v.nombre) return "Escribe el nombre.";
  if (!/^[A-Z]{2}$/.test(v.prefijo)) return "Las letras deben ser exactamente 2 (A-Z), por ejemplo CN.";
  return null;
}

function mensajeError(error: { code?: string; message: string }) {
  if (error.code === "23505") return "Ya existe una categoría con ese nombre o esas letras.";
  if (error.code === "42501") return "La base de datos rechazó el cambio: no tienes permiso.";
  return `No se pudo guardar: ${error.message}`;
}

async function esAdmin() {
  return (await getUsuarioActual())?.rol === "administrador";
}

export async function crearCategoria(
  prev: EstadoCategoria,
  formData: FormData,
): Promise<EstadoCategoria> {
  const valores = leer(formData);
  if (!(await esAdmin())) return { error: "Solo el administrador puede crear categorías.", valores };
  const invalido = validar(valores);
  if (invalido) return { error: invalido, valores };

  const supabase = await createClient();
  const { error } = await supabase.from("categorias").insert(valores);
  if (error) return { error: mensajeError(error), valores };

  revalidatePath("/catalogo/categorias");
  revalidatePath("/catalogo");
  return {
    ok: true,
    mensaje: `Categoría ${valores.nombre} creada. Sus tipos serán ${valores.prefijo}01, ${valores.prefijo}02…`,
    n: (prev.n ?? 0) + 1,
  };
}

export async function actualizarCategoria(
  id: string,
  _prev: EstadoCategoria,
  formData: FormData,
): Promise<EstadoCategoria> {
  const valores = leer(formData);
  if (!(await esAdmin())) return { error: "Solo el administrador puede editar categorías.", valores };
  const invalido = validar(valores);
  if (invalido) return { error: invalido, valores };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .update(valores)
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeError(error), valores };
  if (!data || data.length === 0) return { error: "No se actualizó: no tienes permiso.", valores };

  revalidatePath("/catalogo/categorias");
  revalidatePath("/catalogo");
  return { ok: true, mensaje: "Guardado.", valores };
}

export async function cambiarActivoCategoria(id: string, activo: boolean): Promise<void> {
  if (!(await esAdmin())) return;
  const supabase = await createClient();
  await supabase.from("categorias").update({ activo }).eq("id", id);
  revalidatePath("/catalogo/categorias");
  revalidatePath("/catalogo");
}
