// Roles y sus nombres. Archivo aparte (sin código de servidor) para poder
// usarlo también en componentes del navegador.

export type Rol =
  | "administrador"
  | "coordinacion"
  | "project_manager"
  | "stage_manager"
  | "almacenista"
  | "lider"
  | "staff";

export const ROL_ETIQUETA: Record<Rol, string> = {
  administrador: "Administrador",
  coordinacion: "Coordinación",
  project_manager: "Project Manager",
  stage_manager: "Stage Manager",
  almacenista: "Almacenista",
  lider: "Líder de zona",
  staff: "Staff",
};

// Equipo de organización: mismos permisos que el administrador y son quienes
// arman el documento maestro de cada evento.
export const ROLES_ORGANIZACION: Rol[] = ["coordinacion", "project_manager", "stage_manager"];

export function esRolAdmin(rol: string | null | undefined) {
  return rol === "administrador" || ROLES_ORGANIZACION.includes(rol as Rol);
}

// Quién puede ser líder de una zona o sección.
export function puedeLiderar(rol: string | null | undefined) {
  return rol === "lider" || esRolAdmin(rol);
}
