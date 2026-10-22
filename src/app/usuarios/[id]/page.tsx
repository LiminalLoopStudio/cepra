import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarActivoUsuario } from "../actions";
import { ContrasenaForm, DatosUsuarioForm } from "./formularios";

export const metadata: Metadata = { title: "Editar usuario" };

export default async function EditarUsuarioPage({ params }: PageProps<"/usuarios/[id]">) {
  const yo = await requireUsuario(["administrador"]);
  const { id } = await params;

  const admin = createAdminClient();
  const [{ data: u }, { data: auth }] = await Promise.all([
    admin
      .from("usuarios")
      .select("id, nombre, rol, activo, debe_cambiar_contrasena")
      .eq("id", id)
      .maybeSingle(),
    admin.auth.admin.getUserById(id),
  ]);
  if (!u) notFound();

  const esYo = u.id === yo.id;
  const alternarActivo = cambiarActivoUsuario.bind(null, u.id, !u.activo);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/usuarios" className="text-sm text-muted hover:text-foreground">
          ← Usuarios
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{u.nombre}</h1>
        <p className="text-sm text-muted">{auth?.user?.email}</p>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-4 font-semibold">Datos</h2>
        <DatosUsuarioForm id={u.id} nombre={u.nombre} rol={u.rol} esYo={esYo} />
      </section>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-1 font-semibold">Contraseña</h2>
        <p className="mb-4 text-sm text-muted">
          Si olvidó la suya, ponle una temporal y dísela. Al entrar, el sistema le pedirá crear una
          nueva.
          {u.debe_cambiar_contrasena ? (
            <span className="mt-1 block text-yellow-500">
              Ahora tiene una contraseña temporal: aún no ha creado la suya.
            </span>
          ) : null}
        </p>
        <ContrasenaForm id={u.id} />
      </section>

      {!esYo ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-foreground/10 p-5">
          <div>
            <h2 className="font-semibold">{u.activo ? "Usuario activo" : "Usuario desactivado"}</h2>
            <p className="text-sm text-muted">
              {u.activo
                ? "Al desactivarlo ya no puede entrar. No se borra: su historial se conserva."
                : "No puede iniciar sesión. Puedes reactivarlo cuando vuelva a trabajar."}
            </p>
          </div>
          <form action={alternarActivo}>
            <button
              type="submit"
              className={`h-11 rounded-lg px-5 font-medium ${
                u.activo
                  ? "border border-red-500/40 text-red-500 hover:bg-red-500/10"
                  : "bg-brand text-white"
              }`}
            >
              {u.activo ? "Desactivar" : "Reactivar"}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
