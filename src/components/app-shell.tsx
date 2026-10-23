"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { Icono } from "@/components/icono";
import { ROL_ETIQUETA, type Rol } from "@/lib/auth-etiquetas";
import { accesosRapidos, gruposPara } from "@/lib/navegacion";

type Props = { usuario: { nombre: string; rol: Rol; rolReal?: Rol } | null; children: React.ReactNode };

// Pantallas sin menú (entrar, contraseña obligatoria).
const SIN_MENU = ["/login", "/cambiar-contrasena", "/salir"];

function activo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // /equipos no se marca cuando estás en /equipos/validar (tiene su propia entrada).
  if (href === "/equipos" && pathname.startsWith("/equipos/validar")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">C</span>
      <span className="leading-tight">
        <span className="block font-bold">CEPRA</span>
        <span className="block text-xs text-muted">Gaming Partners</span>
      </span>
    </Link>
  );
}

function Menu({ usuario, pathname, alNavegar }: { usuario: { nombre: string; rol: Rol; rolReal?: Rol }; pathname: string; alNavegar?: () => void }) {
  const enlace = (href: string, activoAhora: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors ${
      activoAhora ? "bg-brand/15 font-semibold text-brand" : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
    }`;

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <Link href="/" onClick={alNavegar} className={enlace("/", activo(pathname, "/"))}>
        <Icono nombre="inicio" />
        Inicio
      </Link>
      {gruposPara(usuario.rol).map((g) => (
        <div key={g.titulo} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.titulo}</p>
          {g.modulos.map((m) => (
            <Link key={m.href} href={m.href} onClick={alNavegar} className={enlace(m.href, activo(pathname, m.href))}>
              <Icono nombre={m.icono} />
              {m.href === "/prestamos" && usuario.rol === "staff" ? "Mis préstamos" : m.texto}
            </Link>
          ))}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-foreground/10 pt-4">
        <p className="px-3 pb-1 text-sm font-semibold">{usuario.nombre}</p>
        <p className="px-3 pb-2 text-xs text-muted">{ROL_ETIQUETA[usuario.rolReal ?? usuario.rol]}</p>
        <Link href="/mi-credencial" onClick={alNavegar} className={enlace("/mi-credencial", activo(pathname, "/mi-credencial"))}>
          <Icono nombre="credencial" />
          Mi credencial y PIN
        </Link>
        <Link href="/cambiar-contrasena" onClick={alNavegar} className={enlace("/cambiar-contrasena", false)}>
          <Icono nombre="llave" />
          Cambiar contraseña
        </Link>
        <form action={cerrarSesion}>
          <button type="submit" className={`${enlace("", false)} w-full`}>
            <Icono nombre="salir" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </nav>
  );
}

export function AppShell({ usuario, children }: Props) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Cierra el menú del celular al cambiar de pantalla.
  useEffect(() => setAbierto(false), [pathname]);

  if (!usuario || SIN_MENU.some((r) => pathname.startsWith(r))) {
    return <>{children}</>;
  }

  const rapidos = accesosRapidos(usuario.rol);

  return (
    <div className="flex min-h-full flex-1">
      {/* Computadora: barra lateral fija */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-foreground/10 px-3 py-5 lg:flex print:hidden">
        <div className="px-2">
          <Marca />
        </div>
        <Menu usuario={usuario} pathname={pathname} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Celular: barra superior */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-foreground/10 bg-background/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
          <Marca />
          <button
            type="button"
            onClick={() => setAbierto(true)}
            aria-label="Abrir menú"
            className="rounded-lg p-2 hover:bg-foreground/5"
          >
            <Icono nombre="menu" className="size-6" />
          </button>
        </header>

        <div className="flex flex-1 flex-col pb-20 lg:pb-0 print:pb-0">{children}</div>

        {/* Celular: barra inferior */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-foreground/10 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
          {rapidos.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                activo(pathname, r.href) ? "font-semibold text-brand" : "text-muted"
              }`}
            >
              <Icono nombre={r.icono} className="size-6" />
              {r.texto}
            </Link>
          ))}
          <button type="button" onClick={() => setAbierto(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted">
            <Icono nombre="menu" className="size-6" />
            Menú
          </button>
        </nav>
      </div>

      {/* Celular: menú completo */}
      {abierto ? (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button type="button" aria-label="Cerrar menú" onClick={() => setAbierto(false)} className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85%] flex-col gap-5 bg-background px-3 py-5 shadow-xl">
            <div className="flex items-center justify-between px-2">
              <Marca />
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="rounded-lg p-2 hover:bg-foreground/5">
                <Icono nombre="cerrar" className="size-6" />
              </button>
            </div>
            <Menu usuario={usuario} pathname={pathname} alNavegar={() => setAbierto(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
