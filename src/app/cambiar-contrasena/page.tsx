import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/actions";
import { CambiarContrasenaForm } from "./formulario";

export const metadata: Metadata = { title: "Cambiar contraseña" };

// No usa requireUsuario: esa función manda AQUÍ a quien tiene contraseña temporal.
export default async function CambiarContrasenaPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");

  const temporal = usuario.debeCambiarContrasena;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white">
          C
        </div>
        <h1 className="text-2xl font-bold">{temporal ? "Crea tu contraseña" : "Cambiar contraseña"}</h1>
        <p className="mt-1 mb-8 text-sm text-muted">
          {temporal
            ? `Hola, ${usuario.nombre}. Entraste con una contraseña temporal: elige la tuya para continuar.`
            : `${usuario.nombre}, escribe tu nueva contraseña.`}
        </p>

        <div className="rounded-2xl border border-foreground/10 p-6">
          <CambiarContrasenaForm />
        </div>

        <div className="mt-6 text-sm">
          {temporal ? (
            // Formulario (POST), no <Link>: Next precarga los enlaces y eso
            // cerraba la sesión sola en cuanto se mostraba esta pantalla.
            <form action={cerrarSesion}>
              <button type="submit" className="text-muted hover:text-foreground">
                Salir sin cambiarla
              </button>
            </form>
          ) : (
            <Link href="/" className="text-muted hover:text-foreground">
              ← Volver
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
