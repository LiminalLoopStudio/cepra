"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CamposPropietario = {
  nombre: string;
  tipo: string; // "patrocinador" | "prestamista" | "propio" (este último solo Gaming Partners)
  contacto: string;
};

export type EstadoPropietario = {
  ok?: boolean;
  error?: string;
  creado?: string;
  valores?: CamposPropietario;
};

function leer(formData: FormData): CamposPropietario {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    tipo: String(formData.get("tipo") ?? ""),
    contacto: String(formData.get("contacto") ?? "").trim(),
  };
}

function validar(v: CamposPropietario, permitirPropio: boolean): string | undefined {
  if (!v.nombre) return "Escribe el nombre de la empresa.";
  const tipos = permitirPropio ? ["propio", "patrocinador", "prestamista"] : ["patrocinador", "prestamista"];
  if (!tipos.includes(v.tipo)) return "Elige si es patrocinador o prestamista.";
  return undefined;
}

function mensajeError(error: { code?: string; message: string }, nombre: string) {
  if (error.code === "23505") return `Ya existe una empresa llamada "${nombre}".`;
  if (error.code === "42501") return "La base de datos rechazó el cambio: no tienes permiso.";
  return `No se pudo guardar: ${error.message}`;
}

async function esAdmin() {
  const usuario = await getUsuarioActual();
  return usuario?.rol === "administrador";
}

export async function crearPropietario(
  _prev: EstadoPropietario,
  formData: FormData,
): Promise<EstadoPropietario> {
  const valores = leer(formData);
  if (!(await esAdmin())) return { error: "Solo el administrador puede registrar empresas.", valores };

  // Solo puede existir un propietario "propio" (Gaming Partners), así que en altas no se permite.
  const error = validar(valores, false);
  if (error) return { error, valores };

  const supabase = await createClient();
  const { error: errorBd } = await supabase.from("propietarios").insert({
    nombre: valores.nombre,
    tipo: valores.tipo,
    contacto: valores.contacto || null,
  });
  if (errorBd) return { error: mensajeError(errorBd, valores.nombre), valores };

  revalidatePath("/propietarios");
  return { ok: true, creado: valores.nombre };
}

export async function actualizarPropietario(
  id: string,
  tipoActual: string,
  _prev: EstadoPropietario,
  formData: FormData,
): Promise<EstadoPropietario> {
  const valores = leer(formData);
  if (!(await esAdmin())) return { error: "Solo el administrador puede editar empresas.", valores };

  // Gaming Partners se queda como "propio"; las demás no pueden volverse "propio".
  if (tipoActual === "propio") valores.tipo = "propio";
  const error = validar(valores, tipoActual === "propio");
  if (error) return { error, valores };

  const supabase = await createClient();
  const { data, error: errorBd } = await supabase
    .from("propietarios")
    .update({ nombre: valores.nombre, tipo: valores.tipo, contacto: valores.contacto || null })
    .eq("id", id)
    .select("id");

  if (errorBd) return { error: mensajeError(errorBd, valores.nombre), valores };
  if (!data || data.length === 0) {
    return { error: "No se actualizó: la empresa no existe o no tienes permiso.", valores };
  }

  revalidatePath("/propietarios");
  redirect("/propietarios");
}

export async function cambiarActivoPropietario(id: string, activo: boolean): Promise<void> {
  if (!(await esAdmin())) return;
  const supabase = await createClient();
  await supabase.from("propietarios").update({ activo }).eq("id", id);
  revalidatePath("/propietarios");
  revalidatePath(`/propietarios/${id}`);
}
