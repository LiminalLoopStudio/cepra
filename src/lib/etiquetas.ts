// Textos para mostrar los valores de la base de datos en pantalla.

export const ESTADO_OPERATIVO: Record<string, string> = {
  por_validar: "Por validar",
  disponible: "Disponible",
  reservado: "Reservado",
  prestado: "Prestado",
  con_falla: "Con falla",
  en_reparacion: "En reparación",
  devuelto_propietario: "Devuelto al propietario",
  baja: "Baja",
};

export const ESTADO_FISICO: Record<string, string> = {
  nuevo: "Nuevo",
  bueno: "Bueno",
  regular: "Regular",
  con_falla: "Con falla",
  en_reparacion: "En reparación",
  baja: "Baja",
};

export const PROPIEDAD: Record<string, string> = {
  propio: "Propio",
  patrocinado: "Patrocinado",
  prestamo: "Préstamo",
};

// Color de la etiqueta de estado (Tailwind).
export const COLOR_ESTADO: Record<string, string> = {
  por_validar: "bg-yellow-500/15 text-yellow-500",
  disponible: "bg-green-500/15 text-green-500",
  reservado: "bg-blue-500/15 text-blue-400",
  prestado: "bg-brand/15 text-brand",
  con_falla: "bg-red-500/15 text-red-500",
  en_reparacion: "bg-orange-500/15 text-orange-400",
  devuelto_propietario: "bg-foreground/10 text-muted",
  baja: "bg-foreground/10 text-muted",
};
