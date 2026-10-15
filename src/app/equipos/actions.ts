"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CamposEquipo = {
  articulo_id: string;
  marca: string;
  modelo: string;
  serie: string;
  puertos: string;
  estado_fisico: string;
  propiedad: string;
  propietario_id: string;
  fecha_devolucion: string;
  notas: string;
};

export type EstadoEquipo = {
  ok?: boolean;
  error?: string;
  etiqueta?: string; // etiqueta asignada por la base de datos
  valores?: CamposEquipo;
};

const ESTADOS_FISICOS = ["nuevo", "bueno", "regular", "con_falla"];
const PROPIEDADES = ["propio", "patrocinado", "prestamo"];

export async function crearEquipo(_prev: EstadoEquipo, formData: FormData): Promise<EstadoEquipo> {
  const valores: CamposEquipo = {
    articulo_id: String(formData.get("articulo_id") ?? ""),
    marca: String(formData.get("marca") ?? "").trim(),
    modelo: String(formData.get("modelo") ?? "").trim(),
    serie: String(formData.get("serie") ?? "").trim(),
    puertos: String(formData.get("puertos") ?? "").trim(),
    estado_fisico: String(formData.get("estado_fisico") ?? "bueno"),
    propiedad: String(formData.get("propiedad") ?? "propio"),
    propietario_id: String(formData.get("propietario_id") ?? ""),
    fecha_devolucion: String(formData.get("fecha_devolucion") ?? ""),
    notas: String(formData.get("notas") ?? "").trim(),
  };

  const usuario = await getUsuarioActual();
  if (!usuario || usuario.rol !== "administrador") {
    return { error: "Solo el administrador puede dar de alta equipos.", valores };
  }

  if (!valores.articulo_id) return { error: "Elige el tipo de equipo.", valores };
  if (!ESTADOS_FISICOS.includes(valores.estado_fisico)) {
    return { error: "Estado físico no válido.", valores };
  }
  if (!PROPIEDADES.includes(valores.propiedad)) {
    return { error: "Propiedad no válida.", valores };
  }
  if (valores.propiedad !== "propio" && !valores.propietario_id) {
    return { error: "Si es patrocinado o préstamo, indica la empresa dueña.", valores };
  }
  if (valores.propiedad !== "propio" && !valores.fecha_devolucion) {
    return { error: "Si es patrocinado o préstamo, indica cuándo hay que devolverlo.", valores };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipos")
    .insert({
      articulo_id: valores.articulo_id,
      marca: valores.marca || null,
      modelo: valores.modelo || null,
      serie: valores.serie || null,
      puertos: valores.puertos
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
      estado_fisico: valores.estado_fisico,
      propiedad: valores.propiedad,
      propietario_id: valores.propietario_id || null,
      fecha_devolucion: valores.propiedad === "propio" ? null : valores.fecha_devolucion,
      notas: valores.notas || null,
    })
    .select("etiqueta")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe una pieza de ese tipo con el mismo número de serie.", valores };
    }
    if (error.code === "42501") {
      return { error: "La base de datos rechazó el alta: no tienes permiso.", valores };
    }
    // Mensajes de los candados de la base (tipo inactivo, por cantidad, etc.)
    return { error: error.message, valores };
  }

  revalidatePath("/equipos");
  // Se conservan tipo, marca, modelo y propiedad para dar de alta varias
  // piezas iguales seguidas; serie y notas se limpian.
  return {
    ok: true,
    etiqueta: data.etiqueta,
    valores: { ...valores, serie: "", notas: "" },
  };
}

// ---------------------------------------------------------------------------
// Edición de datos descriptivos (la etiqueta, el tipo y los estados no se tocan)
// ---------------------------------------------------------------------------
export type CamposEdicionEquipo = {
  marca: string;
  modelo: string;
  serie: string;
  puertos: string;
  propiedad: string;
  propietario_id: string;
  fecha_devolucion: string;
  notas: string;
};

export type EstadoEdicion = { error?: string; valores?: CamposEdicionEquipo };

export async function actualizarEquipo(
  id: string,
  _prev: EstadoEdicion,
  formData: FormData,
): Promise<EstadoEdicion> {
  const valores: CamposEdicionEquipo = {
    marca: String(formData.get("marca") ?? "").trim(),
    modelo: String(formData.get("modelo") ?? "").trim(),
    serie: String(formData.get("serie") ?? "").trim(),
    puertos: String(formData.get("puertos") ?? "").trim(),
    propiedad: String(formData.get("propiedad") ?? "propio"),
    propietario_id: String(formData.get("propietario_id") ?? ""),
    fecha_devolucion: String(formData.get("fecha_devolucion") ?? ""),
    notas: String(formData.get("notas") ?? "").trim(),
  };

  const usuario = await getUsuarioActual();
  if (!usuario || usuario.rol !== "administrador") {
    return { error: "Solo el administrador puede editar equipos.", valores };
  }
  if (!PROPIEDADES.includes(valores.propiedad)) {
    return { error: "Propiedad no válida.", valores };
  }
  const esExterno = valores.propiedad !== "propio";
  if (esExterno && !valores.propietario_id) {
    return { error: "Si es patrocinado o préstamo, indica la empresa dueña.", valores };
  }
  if (esExterno && !valores.fecha_devolucion) {
    return { error: "Si es patrocinado o préstamo, indica cuándo hay que devolverlo.", valores };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipos")
    .update({
      marca: valores.marca || null,
      modelo: valores.modelo || null,
      serie: valores.serie || null,
      puertos: valores.puertos
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
      propiedad: valores.propiedad,
      propietario_id: esExterno ? valores.propietario_id : null,
      fecha_devolucion: esExterno ? valores.fecha_devolucion : null,
      notas: valores.notas || null,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe otra pieza de ese tipo con el mismo número de serie.", valores };
    }
    return { error: `No se pudo guardar: ${error.message}`, valores };
  }
  if (!data || data.length === 0) {
    return { error: "No se actualizó: el equipo no existe o no tienes permiso.", valores };
  }

  revalidatePath("/equipos");
  revalidatePath(`/equipos/${id}`);
  redirect(`/equipos/${id}`);
}
