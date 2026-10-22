import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { motivo } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white">
          C
        </div>
        <h1 className="text-2xl font-bold">CEPRA</h1>
        <p className="mt-1 mb-8 text-sm text-muted">Control de equipos · Gaming Partners</p>

        {motivo === "inactivo" ? (
          <p className="mb-4 rounded-lg bg-yellow-500/15 px-3 py-2 text-sm text-yellow-500">
            Tu usuario está desactivado. Pide al administrador que lo revise.
          </p>
        ) : null}

        <div className="rounded-2xl border border-foreground/10 p-6">
          <LoginForm />
        </div>

        <details className="mt-6 text-sm text-muted">
          <summary className="cursor-pointer hover:text-foreground">¿Olvidaste tu contraseña?</summary>
          <p className="mt-2">
            Pídele al administrador de CEPRA una contraseña temporal. Al entrar con ella, el
            sistema te pedirá crear una nueva.
          </p>
        </details>
      </div>
    </main>
  );
}
