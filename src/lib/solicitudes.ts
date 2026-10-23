// Textos y colores compartidos de solicitudes de equipo.

export const ESTADO_SOLICITUD: Record<string, string> = {
  pendiente: "Por aprobar",
  aprobada: "Aprobada",
  lista: "Lista para recoger",
  entregada: "Entregada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

export const COLOR_SOLICITUD: Record<string, string> = {
  pendiente: "bg-yellow-500/15 text-yellow-500",
  aprobada: "bg-blue-500/15 text-blue-500",
  lista: "bg-green-500/15 text-green-500",
  entregada: "bg-foreground/10 text-muted",
  rechazada: "bg-red-500/15 text-red-500",
  cancelada: "bg-foreground/5 text-muted",
};

export const ABIERTAS = ["pendiente", "aprobada", "lista"];

export function fechaHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// "2 × PlayStation 5, 3 × Cable HDMI…"
export function resumenItems(items: { cantidad: number; articulo: { nombre: string } | null }[], max = 3) {
  const partes = items.map((i) => `${i.cantidad} × ${i.articulo?.nombre ?? "?"}`);
  return partes.length > max ? `${partes.slice(0, max).join(", ")} y ${partes.length - max} más` : partes.join(", ");
}
