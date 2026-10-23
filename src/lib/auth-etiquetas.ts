// Roles y sus nombres. Archivo aparte (sin código de servidor) para poder
// usarlo también en componentes del navegador.

export type Rol = "administrador" | "almacenista" | "lider" | "staff";

export const ROL_ETIQUETA: Record<Rol, string> = {
  administrador: "Administrador",
  almacenista: "Almacenista",
  lider: "Líder de zona",
  staff: "Staff",
};
