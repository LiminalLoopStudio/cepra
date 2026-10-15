"use server";

import { revalidatePath } from "next/cache";
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

export async function crearTipo(_prev: EstadoTipo, formData: FormData): Promise<EstadoTipo> {
  const valores: CamposTipo = {
    codigo_tipo: String(formData.get("codigo_tipo") ?? "").trim().toUpperCase(),
    nombre: String(formData.get("nombre") ?? "").trim(),
    categoria: String(formData.get("categoria") ?? "").trim(),
    serializado: String(formData.get("serializado") ?? ""),
    stock_minimo: String(formData.get("stock_minimo") ?? "0").trim(),
    puertos: String(formData.get("puertos") ?? "").trim(),
  };

  // 1. Permiso: se revisa aquí y además lo vuelve a revisar la base (RLS).
  const usuario = await getUsuarioActual();
  if (!usuario || usuario.rol !== "administrador") {
    return { error: "Solo el administrador puede dar de alta tipos.", valores };
  }

  // 2. Validaciones (las mismas reglas que tiene la tabla, con mensajes claros).
  if (!/^[A-Z0-9]{2,4}$/.test(valores.codigo_tipo)) {
    return { error: "El código debe tener de 2 a 4 letras o números (ej. XBX, MON, H21).", valores };
  }
  if (!valores.nombre) return { error: "Escribe el nombre.", valores };
  if (!valores.categoria) return { error: "Escribe la categoría.", valores };
  if (valores.serializado !== "si" && valores.serializado !== "no") {
    return { error: "Elige cómo se controla: por pieza o por cantidad.", valores };
  }
  const stockMinimo = Number(valores.stock_minimo || "0");
  if (!Number.isInteger(stockMinimo) || stockMinimo < 0) {
    return { error: "El stock mínimo debe ser un número entero, 0 o mayor.", valores };
  }
  const puertos = valores.puertos
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // 3. Guardar.
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_articulos").insert({
    codigo_tipo: valores.codigo_tipo,
    nombre: valores.nombre,
    categoria: valores.categoria,
    serializado: valores.serializado === "si",
    stock_minimo: stockMinimo,
    puertos_default: puertos,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `Ya existe un tipo con el código ${valores.codigo_tipo}.`, valores };
    }
    if (error.code === "42501") {
      return { error: "La base de datos rechazó el alta: no tienes permiso.", valores };
    }
    return { error: `No se pudo guardar: ${error.message}`, valores };
  }

  revalidatePath("/catalogo");
  return { ok: true, creado: valores.codigo_tipo };
}
