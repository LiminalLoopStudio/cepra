"use client";

import { useActionState } from "react";
import { actualizarUsuario, cambiarContrasena, type EstadoUsuario } from "../actions";
import { OPCIONES_ROL } from "../nuevo-usuario-form";

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function Aviso({ estado }: { estado: EstadoUsuario }) {
  if (estado.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500 sm:col-span-2">
        {estado.error}
      </p>
    );
  }
  if (estado.ok) {
    return (
      <p role="status" className="rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-500 sm:col-span-2">
        {estado.mensaje}
      </p>
    );
  }
  return null;
}

export function DatosUsuarioForm({
  id,
  nombre,
  rol,
  esYo,
}: {
  id: string;
  nombre: string;
  rol: string;
  esYo: boolean;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoUsuario, FormData>(
    actualizarUsuario.bind(null, id),
    {},
  );

  return (
    <form
      action={accion}
      // Evita que React vacíe el formulario tras un error (el rol/tipo volvía al valor inicial).
      onReset={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Nombre</span>
        <input name="nombre" required defaultValue={nombre} className={campo} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Rol</span>
        <select name="rol" required defaultValue={rol} disabled={esYo} className={campo}>
          {OPCIONES_ROL.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
        {/* Un select deshabilitado no se envía: se manda el rol actual oculto. */}
        {esYo ? (
          <>
            <input type="hidden" name="rol" value={rol} />
            <span className="text-xs text-muted">No puedes cambiar tu propio rol.</span>
          </>
        ) : null}
      </label>

      <Aviso estado={estado} />

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 rounded-lg bg-brand px-6 font-semibold text-white disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

export function ContrasenaForm({ id }: { id: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoUsuario, FormData>(
    cambiarContrasena.bind(null, id),
    {},
  );

  return (
    <form
      key={estado.n ?? 0}
      action={accion}
      // Evita que React vacíe el formulario tras un error (el rol/tipo volvía al valor inicial).
      onReset={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2"
    >
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
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 rounded-lg border border-foreground/15 px-5 font-medium hover:border-brand disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : "Poner contraseña temporal"}
        </button>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}
