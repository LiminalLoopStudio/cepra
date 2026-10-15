"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./actions";

const campo =
  "h-12 rounded-lg border border-foreground/15 bg-background px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function LoginForm() {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-sm font-medium">Correo</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={estado.email}
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-sm font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={campo}
        />
      </label>

      {estado.error ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">
          {estado.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendiente}
        className="h-12 rounded-lg bg-brand font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
