"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CamposTipo = {
  nombre: string;
  categoria_id: string;
  serializado: string; // "si" | "no"
  stock_minimo: string;
  puertos: string;
  existencia_inicial?: string; // solo al crear un tipo "por cantidad"
  lleva_control?: string; // "si" si cada pieza trae control con etiqueta propia
  lleva_cables?: string; // "si" si cada pieza trae cables originales con etiqueta propia
};

export type EstadoTipo = {
  ok?: boolean;
  error?: string;
  mensaje?: string;
  creado?: string; // código generado (sirve para limpiar el formulario)
  valores?: CamposTipo;
};

type FilaTipo = {
  nombre: string;
  categoria_id: string;
  serializado: boolean;
  stock_minimo: number;
  puertos_default: string[];
  lleva_control: boolean;
  lleva_cables: boolean;
};

// Lee y valida el formulario. El CÓDIGO no viene aquí: lo genera la base
// según la categoría (CN01, CN02…).
function leerFormulario(
  formData: FormData,
): { valores: CamposTipo; fila?: FilaTipo; error?: string } {
  const valores: CamposTipo = {
    nombre: String(formData.get("nombre") ?? "").trim(),
    categoria_id: String(formData.get("categoria_id") ?? ""),
    serializado: String(formData.get("serializado") ?? ""),
    stock_minimo: String(formData.get("stock_minimo") ?? "0").trim(),
    puertos: String(formData.get("puertos") ?? "").trim(),
    existencia_inicial: String(formData.get("existencia_inicial") ?? "0").trim(),
    lleva_control: formData.get("lleva_control") === "si" ? "si" : "",
    lleva_cables: formData.get("lleva_cables") === "si" ? "si" : "",
  };

  if (!valores.nombre) return { valores, error: "Escribe el nombre." };
  if (!valores.categoria_id) return { valores, error: "Elige la categoría." };
  if (valores.serializado !== "si" && valores.serializado !== "no") {
    return { valores, error: "Elige cómo se controla: por pieza o por cantidad." };
  }
  const stockMinimo = Number(valores.stock_minimo || "0");
  if (!Number.isInteger(stockMinimo) || stockMinimo < 0) {
    return { valores, error: "El stock mínimo debe ser un número entero, 0 o mayor." };
  }

  const porPieza = valores.serializado === "si";
  return {
    valores,
    fila: {
      nombre: valores.nombre,
      categoria_id: valores.categoria_id,
      serializado: porPieza,
      stock_minimo: stockMinimo,
      // Los artículos por cantidad no tienen puertos ni accesorios con etiqueta.
      puertos_default: porPieza
        ? valores.puertos
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
        : [],
      lleva_control: porPieza && valores.lleva_control === "si",
      lleva_cables: porPieza && valores.lleva_cables === "si",
    },
  };
}

function mensajeError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "La base de datos rechazó el cambio: no tienes permiso.";
  if (error.code === "23505") return "Ya existe un tipo con ese código. Intenta de nuevo.";
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

  const existencia = Number(valores.existencia_inicial || "0");
  if (!fila.serializado && (!Number.isInteger(existencia) || existencia < 0)) {
    return { error: "La existencia inicial debe ser un número entero, 0 o mayor.", valores };
  }

  const supabase = await createClient();
  const { data: creado, error: errorBd } = await supabase
    .from("catalogo_articulos")
    .insert(fila)
    .select("id, codigo_tipo")
    .single();
  if (errorBd) return { error: mensajeError(errorBd), valores };

  revalidatePath("/catalogo");
  revalidatePath("/stock");

  // Se conservan categoría, forma de control y accesorios para dar de alta
  // varios tipos parecidos seguidos; el nombre y la existencia se limpian.
  const siguientes: CamposTipo = { ...valores, nombre: "", existencia_inicial: "0" };

  // Por cantidad con existencia inicial: se registra como ajuste (queda en la bitácora).
  if (!fila.serializado && existencia > 0) {
    const { error: errorStock } = await supabase.rpc("ajustar_stock", {
      p_articulo: creado.id,
      p_delta: existencia,
      p_motivo: "correccion",
      p_nota: "Existencia inicial al crear el tipo",
    });
    if (errorStock) {
      return {
        ok: true,
        creado: creado.codigo_tipo,
        valores: siguientes,
        mensaje: `Tipo ${creado.codigo_tipo} agregado, pero no se pudo cargar la existencia (${errorStock.message}). Ajústala en Stock.`,
      };
    }
    return {
      ok: true,
      creado: creado.codigo_tipo,
      valores: siguientes,
      mensaje: `Tipo ${creado.codigo_tipo} agregado con ${existencia} en existencia.`,
    };
  }

  return {
    ok: true,
    creado: creado.codigo_tipo,
    valores: siguientes,
    mensaje: fila.serializado
      ? `Tipo ${creado.codigo_tipo} agregado. Sus piezas tendrán etiquetas GP-${creado.codigo_tipo}-0001, -0002…`
      : `Tipo ${creado.codigo_tipo} agregado.`,
  };
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

  if (errorBd) return { error: mensajeError(errorBd), valores };
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
