import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Opcion } from "./formularios";

// Opciones para los selects de cuenta y evento del formulario de compra.
export async function opcionesCompra(): Promise<{ cuentas: Opcion[]; eventos: Opcion[] }> {
  const supabase = await createClient();
  const [{ data: cuentas }, { data: eventos }] = await Promise.all([
    supabase
      .from("cuentas")
      .select("id, correo, usuario, activo, plataforma:plataformas(nombre, orden)")
      .order("correo"),
    supabase.from("eventos").select("id, nombre, estado, fecha_inicio").order("fecha_inicio", { ascending: false }),
  ]);
  const listaCuentas = ((cuentas ?? []) as unknown as {
    id: string;
    correo: string;
    usuario: string | null;
    activo: boolean;
    plataforma: { nombre: string; orden: number } | null;
  }[])
    .sort((a, b) => (a.plataforma?.orden ?? 0) - (b.plataforma?.orden ?? 0))
    .map((c) => ({
      id: c.id,
      texto: `${c.plataforma?.nombre ?? ""} · ${c.correo}${c.usuario ? ` (${c.usuario})` : ""}${c.activo ? "" : " — desactivada"}`,
    }));
  const listaEventos = (eventos ?? []).map((e) => ({
    id: e.id as string,
    texto: `${e.nombre}${e.estado === "activo" ? " (activo)" : ""}`,
  }));
  return { cuentas: listaCuentas, eventos: listaEventos };
}
