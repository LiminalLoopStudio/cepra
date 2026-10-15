"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CamposTipo = {
  codigo_tipo: string;
  nombre: string;
  categoria: string;
  serializado: string; // "si" | "no"
  stock_minimo: string;
  puertos: string;
};

export type EstadoTipo = {
  ok?: boolean;
  error?: string;
  creado?: string; // código creado (sirve para limpiar el formulario)
  valores?: CamposTipo;
};

type FilaTipo = {
  codigo_tipo: string;
  nombre: string;
  categoria: string;
  serializado: boolean;
  stock_minimo: number;
  puertos_default: string[];
};

// Lee y valida el formulario. Devuelve la fila lista para guardar o un error.
function leerFormulario(
  formData: FormData,
): { valores: CamposTipo; fila?: FilaTipo; error?: string } {
  const valores: CamposTipo = {
    codigo_tipo: String(formData.get("codigo_tipo") ?? "").trim().toUpperCase(),
    nombre: String(formData.get("nombre") ?? "").trim(),
    categoria: String(formData.get("categoria") ?? "").trim(),
    serializado: String(formData.get("serializado") ?? ""),
    stock_minimo: String(formData.get("stock_minimo") ?? "0").trim(),
    puertos: String(formData.get("puertos") ?? "").trim(),
  };

  if (!/^[A-Z0-9]{2,4}$/.test(valores.codigo_tipo)) {
    return { valores, error: "El código debe tener de 2 a 4 letras o números (ej. XBX, MON, H21)." };
  }
  if (!valores.nombre) return { valores, error: "Escribe el nombre." };
  if (!valores.categoria) return { valores, error: "Escribe la categoría." };
  if (valores.serializado !== "si" && valores.serializado !== "no") {
    return { valores, error: "Elige cómo se controla: por pieza o por cantidad." };
  }
  const stockMinimo = Number(valores.stock_minimo || "0");
  if (!Number.isInteger(stockMinimo) || stockMinimo < 0) {
    return { valores, error: "El stock mínimo debe ser un número entero, 0 o mayor." };
  }

  return {
    valores,
    fila: {
      codigo_tipo: valores.codigo_tipo,
      nombre: valores.nombre,
      categoria: valores.categoria,
      serializado: valores.serializado === "si",
      stock_minimo: stockMinimo,
      puertos_default: valores.puertos
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    },
  };
}

function mensajeError(error: { code?: string; message: string }, codigo: string) {
  if (error.code === "23505") return `Ya existe un tipo con el código ${codigo}.`;
  if (error.code === "42501") return "La base de datos rechazó el cambio: no tienes permiso.";
  return `No se pudo guardar: ${error.message}`;
}

async function esAdmin() {
  const usuario = await getUsuarioActual();
  return usuario?.rol === "administrador";
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------
export async function crearTipo(_prev: EstadoTipo, formData: FormData): Promise<EstadoTipo> {
  const { valores, fila, error } = leerFormulario(formData);
  // Permiso: se revisa aquí y además lo vuelve a revisar la base (RLS).
  if (!(await esAdmin())) {
    return { error: "Solo el administrador puede dar de alta tipos.", valores };
  }
  if (error || !fila) return { error, valores };

  const supabase = await createClient();
  const { error: errorBd } = await supabase.from("catalogo_articulos").insert(fila);
  if (errorBd) return { error: mensajeError(errorBd, fila.codigo_tipo), valores };

  revalidatePath("/catalogo");
  return { ok: true, creado: fila.codigo_tipo };
}

// ---------------------------------------------------------------------------
// Edición (el id viene "amarrado" con .bind desde la página)
// ---------------------------------------------------------------------------
export async function actualizarTipo(
  id: string,
  _prev: EstadoTipo,
  formData: FormData,
): Promise<EstadoTipo> {
  const { valores, fila, error } = leerFormulario(formData);
  if (!(await esAdmin())) {
    return { error: "Solo el administrador puede editar tipos.", valores };
  }
  if (error || !fila) return { error, valores };

  const supabase = await createClient();
  const { data, error: errorBd } = await supabase
    .from("catalogo_articulos")
    .update(fila)
    .eq("id", id)
    .select("id");

  if (errorBd) return { error: mensajeError(errorBd, fila.codigo_tipo), valores };
  // Si RLS bloquea un UPDATE no da error: simplemente no actualiza filas.
  if (!data || data.length === 0) {
    return { error: "No se actualizó: el tipo no existe o no tienes permiso.", valores };
  }

  revalidatePath("/catalogo");
  redirect("/catalogo");
}

// ---------------------------------------------------------------------------
// Activar / desactivar (no se borra: se conserva para el historial)
// ---------------------------------------------------------------------------
export async function cambiarActivo(id: string, activo: boolean): Promise<void> {
  if (!(await esAdmin())) return;

  const supabase = await createClient();
  await supabase.from("catalogo_articulos").update({ activo }).eq("id", id);

  revalidatePath("/catalogo");
  revalidatePath(`/catalogo/${id}`);
}
