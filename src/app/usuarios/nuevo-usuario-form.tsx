"use client";

import { useActionState } from "react";
import { crearUsuario, type EstadoUsuario } from "./actions";

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export const OPCIONES_ROL = [
  ["staff", "Staff — pide equipo y ve lo que tiene a su nombre"],
  ["lider", "Líder de zona — aprueba solicitudes de su zona"],
  ["almacenista", "Almacenista — entrega, recibe y valida etiquetas"],
  ["administrador", "Administrador — todo, incluido inventario y usuarios"],
] as const;

export function NuevoUsuarioForm() {
  const [estado, accion, pendiente] = useActionState<EstadoUsuario, FormData>(crearUsuario, {});
  // Tras un alta exitosa se limpia (cambia la key); con error se conservan los datos.
  const v = estado.ok ? undefined : estado.valores;

  return (
    <form
      key={estado.n ?? 0}
      action={accion}
      // Evita que React vacíe el formulario tras un error (el rol/tipo volvía al valor inicial).
      onReset={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Nombre</span>
        <input name="nombre" required defaultValue={v?.nombre} placeholder="Ana López" className={campo} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Correo</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          defaultValue={v?.email}
          placeholder="ana@ejemplo.com"
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Contraseña temporal</span>
        <input
          name="password"
          type="text"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          className={`${campo} font-mono`}
        />
        <span className="text-xs text-muted">
          Se la das a la persona. La primera vez que entre, el sistema le pedirá crear la suya.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Rol</span>
        <select name="rol" required defaultValue={v?.rol ?? "staff"} className={campo}>
          {OPCIONES_ROL.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </label>

      {estado.error ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500 sm:col-span-2">
          {estado.error}
        </p>
      ) : null}
      {estado.ok ? (
        <p role="status" className="rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-500 sm:col-span-2">
          {estado.mensaje}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 rounded-lg bg-brand px-6 font-semibold text-white disabled:opacity-60"
        >
          {pendiente ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}
