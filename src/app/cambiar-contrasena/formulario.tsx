"use client";

import { useActionState } from "react";
import { cambiarMiContrasena, type EstadoCambio } from "./actions";

const campo =
  "h-12 rounded-lg border border-foreground/15 bg-background px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function CambiarContrasenaForm() {
  const [estado, accion, pendiente] = useActionState<EstadoCambio, FormData>(cambiarMiContrasena, {});

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-sm font-medium">Nueva contraseña</span>
        <input
          name="nueva"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={campo}
        />
        <span className="text-xs text-muted">Mínimo 8 caracteres.</span>
      </label>

      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-sm font-medium">Repítela</span>
        <input
          name="confirmar"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
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
        {pendiente ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
