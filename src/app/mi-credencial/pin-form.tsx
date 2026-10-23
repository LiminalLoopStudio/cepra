"use client";

import { useActionState } from "react";
import { guardarMiPin, type EstadoPin } from "./actions";

const campo =
  "h-12 w-full rounded-lg border border-foreground/15 bg-background px-3 text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function Pin({ nombre, etiqueta }: { nombre: string; etiqueta: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{etiqueta}</span>
      <input
        name={nombre}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]{4,6}"
        minLength={4}
        maxLength={6}
        required
        className={campo}
      />
    </label>
  );
}

export function PinForm({ tienePin }: { tienePin: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoPin, FormData>(guardarMiPin, {});

  return (
    <form key={estado.n ?? 0} action={accion} className="grid gap-4 sm:grid-cols-3">
      {tienePin ? <Pin nombre="actual" etiqueta="PIN actual" /> : null}
      <Pin nombre="nuevo" etiqueta={tienePin ? "PIN nuevo" : "PIN (4 a 6 números)"} />
      <Pin nombre="confirmar" etiqueta="Repítelo" />

      {estado.error ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500 sm:col-span-3">
          {estado.error}
        </p>
      ) : null}
      {estado.ok ? (
        <p role="status" className="rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-500 sm:col-span-3">
          {estado.mensaje}
        </p>
      ) : null}

      <div className="sm:col-span-3">
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 rounded-lg bg-brand px-6 font-semibold text-white disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : tienePin ? "Cambiar PIN" : "Guardar PIN"}
        </button>
      </div>
    </form>
  );
}
