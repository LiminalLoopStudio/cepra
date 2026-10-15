import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white">
          C
        </div>
        <h1 className="text-2xl font-bold">CEPRA</h1>
        <p className="mt-1 mb-8 text-sm text-muted">Control de equipos · Gaming Partners</p>

        <div className="rounded-2xl border border-foreground/10 p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
