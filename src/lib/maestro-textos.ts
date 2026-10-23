// Textos del documento maestro (también se usan en el navegador).

export type Origen = "almacen" | "compra" | "renta" | "patrocinio";

export const ORIGEN: Record<Origen, string> = {
  almacen: "Almacén",
  compra: "Compra",
  renta: "Renta",
  patrocinio: "Patrocinio",
};

export const ORIGENES = Object.keys(ORIGEN) as Origen[];

export function watts(n: number) {
  return n >= 1000 ? `${(n / 1000).toLocaleString("es-MX", { maximumFractionDigits: 2 })} kW` : `${n} W`;
}
