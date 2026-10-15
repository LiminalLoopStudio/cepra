import Link from "next/link";
import { requireUsuario, ROL_ETIQUETA } from "@/lib/auth";
import { cerrarSesion } from "./login/actions";

import type { Rol } from "@/lib/auth";

const TODOS: Rol[] = ["administrador", "almacenista", "lider", "staff"];

const ACCESOS: { href: string; texto: string; roles: Rol[] }[] = [
  { href: "/equipos/validar", texto: "Validar etiquetas", roles: ["administrador", "almacenista"] },
  { href: "/equipos", texto: "Equipos", roles: TODOS },
  { href: "/catalogo", texto: "Catálogo", roles: TODOS },
  { href: "/propietarios", texto: "Propietarios", roles: TODOS },
];

export default async function Home() {
  const usuario = await requireUsuario();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
        C
      </div>
      <h1 className="text-3xl font-bold">CEPRA</h1>

      <p className="text-lg">Hola, {usuario.nombre}</p>
      <p className="rounded-full bg-brand/15 px-4 py-1.5 text-sm font-medium text-brand">
        {ROL_ETIQUETA[usuario.rol]}
      </p>

      <nav className="mt-6 flex flex-wrap justify-center gap-3">
        {ACCESOS.filter((a) => a.roles.includes(usuario.rol)).map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="min-w-36 rounded-xl border border-foreground/15 px-6 py-4 font-medium hover:border-brand"
          >
            {a.texto}
          </Link>
        ))}
      </nav>

      <form action={cerrarSesion} className="mt-6">
        <button
          type="submit"
          className="rounded-lg border border-foreground/15 px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
