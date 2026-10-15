import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "./login/actions";

const ROL_ETIQUETA = {
  administrador: "Administrador",
  almacenista: "Almacenista",
  lider: "Líder de zona",
  staff: "Staff",
} as const;

export default async function Home() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  // El perfil se lee con la sesión del usuario: aplica la regla RLS de "usuarios".
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("nombre, rol, activo")
    .eq("id", userId)
    .maybeSingle();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
        C
      </div>
      <h1 className="text-3xl font-bold">CEPRA</h1>

      {perfil ? (
        <>
          <p className="text-lg">Hola, {perfil.nombre}</p>
          <p className="rounded-full bg-brand/15 px-4 py-1.5 text-sm font-medium text-brand">
            {ROL_ETIQUETA[perfil.rol as keyof typeof ROL_ETIQUETA] ?? perfil.rol}
          </p>
          {!perfil.activo ? (
            <p className="text-sm text-red-500">Tu usuario está desactivado.</p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-red-500">
          Tu usuario no tiene perfil en CEPRA. Pide al administrador que lo revise.
        </p>
      )}

      <form action={cerrarSesion} className="mt-6">
        <button
          type="submit"
          className="rounded-lg border border-foreground/15 px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Cerrar sesión
        </button>
      </form>

      <p className="text-sm text-muted">En construcción</p>
    </main>
  );
}
