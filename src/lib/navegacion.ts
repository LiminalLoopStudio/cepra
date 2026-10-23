// Menú de la app: qué módulos hay, en qué grupo van y qué roles los ven.
// Lo usan la barra lateral, el menú del celular y el inicio.
import type { Rol } from "./auth-etiquetas";

export type NombreIcono =
  | "inicio"
  | "solicitudes"
  | "maestro"
  | "entregar"
  | "recibir"
  | "prestamos"
  | "validar"
  | "equipos"
  | "stock"
  | "catalogo"
  | "propietarios"
  | "eventos"
  | "cuentas"
  | "compras"
  | "usuarios"
  | "credencial"
  | "llave"
  | "salir"
  | "menu"
  | "cerrar"
  | "camara";

export type Modulo = {
  href: string;
  texto: string;
  descripcion: string;
  icono: NombreIcono;
  roles: Rol[];
};

export type Grupo = { titulo: string; modulos: Modulo[] };

const TODOS: Rol[] = ["administrador", "almacenista", "lider", "staff"];
const ALMACEN: Rol[] = ["administrador", "almacenista"];
const LIDERES: Rol[] = ["administrador", "lider"];

export const GRUPOS: Grupo[] = [
  {
    titulo: "Operación",
    modulos: [
      { href: "/solicitudes", texto: "Solicitudes", descripcion: "Pedir equipo para tu zona", icono: "solicitudes", roles: TODOS },
      { href: "/entregas", texto: "Entregar", descripcion: "Prestar equipo con firma", icono: "entregar", roles: ALMACEN },
      { href: "/devoluciones", texto: "Recibir", descripcion: "Registrar lo que regresa", icono: "recibir", roles: ALMACEN },
      { href: "/prestamos", texto: "Préstamos", descripcion: "Quién tiene qué", icono: "prestamos", roles: TODOS },
      { href: "/equipos/validar", texto: "Validar etiquetas", descripcion: "Equipo nuevo ↔ su caja", icono: "validar", roles: ALMACEN },
    ],
  },
  {
    titulo: "Inventario",
    modulos: [
      { href: "/equipos", texto: "Equipos", descripcion: "Piezas con QR", icono: "equipos", roles: TODOS },
      { href: "/stock", texto: "Stock", descripcion: "Artículos por cantidad", icono: "stock", roles: TODOS },
      { href: "/catalogo", texto: "Catálogo", descripcion: "Tipos de artículo", icono: "catalogo", roles: TODOS },
      { href: "/propietarios", texto: "Propietarios", descripcion: "Empresas dueñas", icono: "propietarios", roles: TODOS },
    ],
  },
  {
    titulo: "Eventos",
    modulos: [
      { href: "/eventos", texto: "Eventos y zonas", descripcion: "Zonas, secciones y staff", icono: "eventos", roles: TODOS },
      // "administrador" incluye Coordinación, Project Manager y Stage Manager.
      { href: "/maestro", texto: "Documento maestro", descripcion: "Equipo por zona y Excel", icono: "maestro", roles: ["administrador", "almacenista", "lider"] },
    ],
  },
  {
    titulo: "Administración",
    modulos: [
      { href: "/cuentas", texto: "Cuentas", descripcion: "Cuentas de plataformas", icono: "cuentas", roles: LIDERES },
      { href: "/compras", texto: "Compras", descripcion: "Suscripciones y facturas", icono: "compras", roles: LIDERES },
      { href: "/usuarios", texto: "Usuarios", descripcion: "Personas, roles y PIN", icono: "usuarios", roles: ["administrador"] },
    ],
  },
];

// Grupos con solo los módulos que ve ese rol (y sin grupos vacíos).
export function gruposPara(rol: Rol): Grupo[] {
  return GRUPOS.map((g) => ({ ...g, modulos: g.modulos.filter((m) => m.roles.includes(rol)) })).filter(
    (g) => g.modulos.length > 0,
  );
}

// Los 3 accesos de la barra inferior del celular (más "Menú").
export function accesosRapidos(rol: Rol): { href: string; texto: string; icono: NombreIcono }[] {
  const inicio = { href: "/", texto: "Inicio", icono: "inicio" as const };
  if (rol === "administrador" || rol === "almacenista") {
    return [inicio, { href: "/entregas", texto: "Entregar", icono: "entregar" }, { href: "/devoluciones", texto: "Recibir", icono: "recibir" }];
  }
  if (rol === "lider") {
    return [inicio, { href: "/solicitudes", texto: "Solicitudes", icono: "solicitudes" }, { href: "/prestamos", texto: "Préstamos", icono: "prestamos" }];
  }
  return [inicio, { href: "/solicitudes", texto: "Pedir", icono: "solicitudes" }, { href: "/prestamos", texto: "Préstamos", icono: "prestamos" }];
}
