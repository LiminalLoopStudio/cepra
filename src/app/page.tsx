import Link from "next/link";
import { requireUsuario, ROL_ETIQUETA } from "@/lib/auth";
import { cerrarSesion } from "./login/actions";

import type { Rol } from "@/lib/auth";

const TODOS: Rol[] = ["administrador", "almacenista", "lider", "staff"];

const ACCESOS: { href: string; texto: string; roles: Rol[] }[] = [
  { href: "/equipos/validar", texto: "Validar etiquetas", roles: ["administrador", "almacenista"] },
  { href: "/equipos", texto: "Equipos", roles: TODOS },
  { href: "/stock", texto: "Stock", roles: TODOS },
  { href: "/catalogo", texto: "Catálogo", roles: TODOS },
  { href: "/propietarios", texto: "Propietarios", roles: TODOS },
  { href: "/usuarios", texto: "Usuarios", roles: ["administrador"] },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const usuario = await requireUsuario();
  const { contrasena } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
        C
      </div>
      <h1 className="text-3xl font-bold">CEPRA</h1>

      {contrasena === "ok" ? (
        <p role="status" className="rounded-lg bg-green-500/15 px-4 py-2 text-sm text-green-500">
          Contraseña guardada. Usa la nueva la próxima vez que entres.
        </p>
      ) : null}

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

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/cambiar-contrasena"
          className="rounded-lg border border-foreground/15 px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Cambiar mi contraseña
        </Link>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="rounded-lg border border-foreground/15 px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
