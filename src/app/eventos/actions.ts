"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Estado = {
  ok?: boolean;
  error?: string;
  mensaje?: string;
  n?: number; // cambia tras un alta para limpiar el formulario
  valores?: Record<string, string>;
};

const ESTADOS = ["planeado", "activo", "cerrado"] as const;

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? "").trim();
}

function mensajeError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  if (error.code === "23505") {
    if (error.message.includes("eventos_un_solo_activo")) {
      return "Ya hay otro evento activo. Ciérralo antes de activar este.";
    }
    if (error.message.includes("zona_staff_evento_id_usuario_id")) {
      return "Esa persona ya está asignada a otra zona de este evento. Quítala de esa zona primero.";
    }
    if (error.message.includes("zonas_evento_id_nombre")) {
      return "Ya existe una zona con ese nombre en este evento.";
    }
    return "Ese registro ya existe.";
  }
  if (error.code === "23514") return "La fecha de fin no puede ser antes de la de inicio.";
  return `No se pudo guardar: ${error.message}`;
}

async function rol() {
  return (await getUsuarioActual())?.rol;
}

// ---------------------------------------------------------------------------
// Eventos (administrador)
// ---------------------------------------------------------------------------
function leerEvento(formData: FormData) {
  const valores = {
    nombre: texto(formData, "nombre"),
    lugar: texto(formData, "lugar"),
    fecha_inicio: texto(formData, "fecha_inicio"),
    fecha_fin: texto(formData, "fecha_fin"),
    notas: texto(formData, "notas"),
  };
  let error: string | undefined;
  if (!valores.nombre) error = "Escribe el nombre del evento.";
  else if (!valores.fecha_inicio || !valores.fecha_fin) error = "Pon la fecha de inicio y de fin.";
  else if (valores.fecha_fin < valores.fecha_inicio) error = "La fecha de fin no puede ser antes de la de inicio.";
  const fila = {
    nombre: valores.nombre,
    lugar: valores.lugar || null,
    fecha_inicio: valores.fecha_inicio,
    fecha_fin: valores.fecha_fin,
    notas: valores.notas || null,
  };
  return { valores, fila, error };
}

export async function crearEvento(prev: Estado, formData: FormData): Promise<Estado> {
  const { valores, fila, error } = leerEvento(formData);
  if ((await rol()) !== "administrador") return { error: "Solo el administrador crea eventos.", valores };
  if (error) return { error, valores };

  const supabase = await createClient();
  const { error: e } = await supabase.from("eventos").insert(fila);
  if (e) return { error: mensajeError(e), valores };

  revalidatePath("/eventos");
  return { ok: true, mensaje: `Evento "${fila.nombre}" creado.`, n: (prev.n ?? 0) + 1 };
}

export async function actualizarEvento(id: string, _prev: Estado, formData: FormData): Promise<Estado> {
  const { valores, fila, error } = leerEvento(formData);
  if ((await rol()) !== "administrador") return { error: "Solo el administrador edita eventos.", valores };
  if (error) return { error, valores };

  const supabase = await createClient();
  const { error: e } = await supabase.from("eventos").update(fila).eq("id", id);
  if (e) return { error: mensajeError(e), valores };

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${id}`);
  return { ok: true, mensaje: "Cambios guardados.", valores };
}

export async function cambiarEstadoEvento(id: string, _prev: Estado, formData: FormData): Promise<Estado> {
  const estado = texto(formData, "estado") as (typeof ESTADOS)[number];
  if ((await rol()) !== "administrador") return { error: "Solo el administrador cambia el estado." };
  if (!ESTADOS.includes(estado)) return { error: "Estado no válido." };

  const supabase = await createClient();
  const { error } = await supabase.from("eventos").update({ estado }).eq("id", id);
  if (error) return { error: mensajeError(error) };

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${id}`);
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Zonas (administrador)
// ---------------------------------------------------------------------------
export async function crearZona(eventoId: string, prev: Estado, formData: FormData): Promise<Estado> {
  const valores = { nombre: texto(formData, "nombre"), lider_id: texto(formData, "lider_id") };
  if ((await rol()) !== "administrador") return { error: "Solo el administrador crea zonas.", valores };
  if (!valores.nombre) return { error: "Escribe el nombre de la zona.", valores };

  const supabase = await createClient();
  const { error } = await supabase
    .from("zonas")
    .insert({ evento_id: eventoId, nombre: valores.nombre, lider_id: valores.lider_id || null });
  if (error) return { error: mensajeError(error), valores };

  revalidatePath(`/eventos/${eventoId}`);
  return { ok: true, mensaje: `Zona "${valores.nombre}" creada.`, n: (prev.n ?? 0) + 1 };
}

export async function actualizarZona(
  zonaId: string,
  eventoId: string,
  _prev: Estado,
  formData: FormData,
): Promise<Estado> {
  const valores = { nombre: texto(formData, "nombre"), lider_id: texto(formData, "lider_id") };
  if ((await rol()) !== "administrador") return { error: "Solo el administrador edita zonas.", valores };
  if (!valores.nombre) return { error: "Escribe el nombre de la zona.", valores };

  const supabase = await createClient();
  const { error } = await supabase
    .from("zonas")
    .update({ nombre: valores.nombre, lider_id: valores.lider_id || null })
    .eq("id", zonaId);
  if (error) return { error: mensajeError(error), valores };

  revalidatePath(`/eventos/${eventoId}`);
  return { ok: true, mensaje: "Guardado.", valores };
}

export async function borrarZona(zonaId: string, eventoId: string): Promise<void> {
  if ((await rol()) !== "administrador") return;
  const supabase = await createClient();
  await supabase.from("zonas").delete().eq("id", zonaId);
  revalidatePath(`/eventos/${eventoId}`);
}

// ---------------------------------------------------------------------------
// Staff de una zona (administrador o el líder de esa zona; la base lo revisa)
// ---------------------------------------------------------------------------
export async function asignarStaff(
  zonaId: string,
  eventoId: string,
  _prev: Estado,
  formData: FormData,
): Promise<Estado> {
  const usuarioId = texto(formData, "usuario_id");
  if (!usuarioId) return { error: "Elige a la persona." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zona_staff")
    .insert({ zona_id: zonaId, usuario_id: usuarioId })
    .select("usuario_id");
  if (error) return { error: mensajeError(error) };
  if (!data || data.length === 0) return { error: "No tienes permiso para asignar en esta zona." };

  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/");
  return { ok: true, n: Date.now() };
}

export async function quitarStaff(zonaId: string, usuarioId: string, eventoId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("zona_staff").delete().eq("zona_id", zonaId).eq("usuario_id", usuarioId);
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/");
}
