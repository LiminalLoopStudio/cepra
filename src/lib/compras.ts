// Textos compartidos del módulo de compras.

export const CATEGORIAS_COMPRA = ["Suscripción", "Juego / contenido", "Hardware", "Servicio", "Otro"];

export const PROVEEDORES = [
  "Microsoft Store",
  "PlayStation Store",
  "Nintendo eShop",
  "Steam",
  "Epic Games Store",
  "Meta Store",
  "Riot Games",
  "Amazon",
  "Mercado Libre",
];

export const ESTADO_FACTURA: Record<string, string> = {
  pendiente: "Pendiente de facturar",
  solicitada: "Factura solicitada",
  facturada: "Facturada",
  no_facturable: "No facturable",
};

export const COLOR_FACTURA: Record<string, string> = {
  pendiente: "bg-yellow-500/15 text-yellow-500",
  solicitada: "bg-blue-500/15 text-blue-500",
  facturada: "bg-green-500/15 text-green-500",
  no_facturable: "bg-foreground/10 text-muted",
};

export const TIPO_ARCHIVO: Record<string, string> = {
  comprobante: "Comprobante de pago",
  factura_pdf: "Factura (PDF)",
  factura_xml: "Factura (XML)",
  otro: "Otro",
};

export function dinero(monto: number, moneda: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(monto);
}

export function fechaCorta(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}
