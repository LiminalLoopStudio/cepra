"use client";

import { useActionState } from "react";
import { actualizarCategoria, crearCategoria, type EstadoCategoria } from "./actions";

const campo =
  "h-10 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function Aviso({ estado }: { estado: EstadoCategoria }) {
  if (estado.error) {
    return (
      <p role="alert" className="w-full rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">
        {estado.error}
      </p>
    );
  }
  if (estado.ok && estado.mensaje) {
    return (
      <p role="status" className="w-full rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-500">
        {estado.mensaje}
      </p>
    );
  }
  return null;
}

export function NuevaCategoriaForm() {
  const [estado, accion, pendiente] = useActionState<EstadoCategoria, FormData>(crearCategoria, {});
  const v = estado.ok ? undefined : estado.valores;

  return (
    <form
      key={estado.n ?? 0}
      action={accion}
      onReset={(e) => e.preventDefault()}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium">Nombre</span>
        <input name="nombre" required placeholder="Audio" defaultValue={v?.nombre} className={campo} />
      </label>
      <label className="flex w-28 flex-col gap-1.5">
        <span className="text-sm font-medium">Letras</span>
        <input
          name="prefijo"
          required
          minLength={2}
          maxLength={2}
          placeholder="AU"
          defaultValue={v?.prefijo}
          className={`${campo} font-mono uppercase`}
        />
      </label>
      <button
        type="submit"
        disabled={pendiente}
        className="h-10 rounded-lg bg-brand px-5 font-semibold text-white disabled:opacity-60"
      >
        {pendiente ? "Creando…" : "Crear"}
      </button>
      <Aviso estado={estado} />
    </form>
  );
}

export function EditarCategoriaForm({
  id,
  nombre,
  prefijo,
  bloqueada,
}: {
  id: string;
  nombre: string;
  prefijo: string;
  bloqueada: boolean; // ya tiene tipos: las letras no se pueden cambiar
}) {
  const [estado, accion, pendiente] = useActionState<EstadoCategoria, FormData>(
    actualizarCategoria.bind(null, id),
    {},
  );
  const v = estado.valores ?? { nombre, prefijo };

  return (
    <form action={accion} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-center gap-2">
      <input name="nombre" required defaultValue={v.nombre} aria-label="Nombre" className={`${campo} min-w-40 flex-1`} />
      <input
        name="prefijo"
        required
        minLength={2}
        maxLength={2}
        defaultValue={v.prefijo}
        readOnly={bloqueada}
        aria-label="Letras"
        title={bloqueada ? "Ya tiene tipos: sus letras están en etiquetas" : undefined}
        className={`${campo} w-16 font-mono uppercase ${bloqueada ? "opacity-60" : ""}`}
      />
      <button
        type="submit"
        disabled={pendiente}
        className="h-10 rounded-lg border border-foreground/15 px-4 text-sm font-medium hover:border-brand disabled:opacity-60"
      >
        {pendiente ? "…" : "Guardar"}
      </button>
      <Aviso estado={estado} />
    </form>
  );
}
