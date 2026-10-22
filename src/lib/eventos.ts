// Textos y colores compartidos de eventos.

export const ESTADO_EVENTO: Record<string, string> = {
  planeado: "Planeado",
  activo: "Activo",
  cerrado: "Cerrado",
};

export const COLOR_EVENTO: Record<string, string> = {
  planeado: "bg-foreground/10 text-muted",
  activo: "bg-green-500/15 text-green-500",
  cerrado: "bg-foreground/5 text-muted",
};

// "12 nov 2026 – 15 nov 2026" (o una sola fecha si empieza y acaba el mismo día).
export function rangoFechas(inicio: string, fin: string) {
  const f = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  return inicio === fin ? f(inicio) : `${f(inicio)} – ${f(fin)}`;
}
