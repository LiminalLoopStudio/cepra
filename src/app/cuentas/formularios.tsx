"use client";

import { useActionState } from "react";
import {
  actualizarCuenta,
  actualizarPlataforma,
  crearCuenta,
  crearPlataforma,
  type Estado,
} from "./actions";

export type Opcion = { id: string; texto: string };

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const campoChico =
  "h-10 w-full rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function Aviso({ estado, className = "" }: { estado: Estado; className?: string }) {
  if (estado.error) {
    return (
      <p role="alert" className={`rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500 ${className}`}>
        {estado.error}
      </p>
    );
  }
  if (estado.ok && estado.mensaje) {
    return (
      <p role="status" className={`rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-500 ${className}`}>
        {estado.mensaje}
      </p>
    );
  }
  return null;
}

type DatosCuenta = { plataforma_id: string; correo: string; usuario: string; equipo_id: string; notas: string };

export function CuentaForm(
  props: { plataformas: Opcion[]; equipos: Opcion[] } & (
    | { modo: "crear"; plataformaInicial?: string }
    | { modo: "editar"; id: string; inicial: DatosCuenta }
  ),
) {
  const accionServidor = props.modo === "crear" ? crearCuenta : actualizarCuenta.bind(null, props.id);
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(accionServidor, {});
  const v: Partial<DatosCuenta> | undefined =
    estado.valores ??
    (props.modo === "editar" ? props.inicial : { plataforma_id: props.plataformaInicial ?? "" });

  return (
    <form
      key={estado.n ?? 0}
      action={accion}
      onReset={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Plataforma</span>
        <select name="plataforma_id" required defaultValue={v?.plataforma_id ?? ""} className={campo}>
          <option value="" disabled>
            Elige…
          </option>
          {props.plataformas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.texto}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Correo de la cuenta</span>
        <input
          name="correo"
          type="email"
          required
          autoComplete="off"
          placeholder="consolas01@gamingpartners.mx"
          defaultValue={v?.correo}
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Usuario / gamertag (opcional)</span>
        <input name="usuario" autoComplete="off" placeholder="GP_Xbox01" defaultValue={v?.usuario} className={campo} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Equipo donde está (opcional)</span>
        <select name="equipo_id" defaultValue={v?.equipo_id ?? ""} className={campo}>
          <option value="">Ninguno</option>
          {props.equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.texto}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Notas (opcional)</span>
        <textarea
          name="notas"
          rows={2}
          placeholder="Región, suscripción, quién la creó, dónde está la contraseña…"
          defaultValue={v?.notas}
          className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        <span className="text-xs text-muted">No escribas contraseñas aquí: se guardan en el gestor de contraseñas.</span>
      </label>

      <Aviso estado={estado} className="sm:col-span-2" />

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 rounded-lg bg-brand px-6 font-semibold text-white disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : props.modo === "crear" ? "Registrar cuenta" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

export function NuevaPlataformaForm() {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(crearPlataforma, {});
  const v = estado.ok ? undefined : estado.valores;
  return (
    <form key={estado.n ?? 0} action={accion} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-48 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium">Nombre</span>
        <input name="nombre" required placeholder="Battle.net" defaultValue={v?.nombre} className={campoChico} />
      </label>
      <button
        type="submit"
        disabled={pendiente}
        className="h-10 rounded-lg bg-brand px-5 font-semibold text-white disabled:opacity-60"
      >
        {pendiente ? "…" : "Agregar"}
      </button>
      <Aviso estado={estado} className="w-full" />
    </form>
  );
}

export function EditarPlataformaForm({ id, nombre, orden }: { id: string; nombre: string; orden: number }) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(actualizarPlataforma.bind(null, id), {});
  const v = estado.valores ?? { nombre, orden: String(orden) };
  return (
    <form action={accion} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-center gap-2">
      <input name="nombre" required defaultValue={v.nombre} aria-label="Nombre" className={`${campoChico} min-w-40 flex-1`} />
      <input
        name="orden"
        type="number"
        min={0}
        defaultValue={v.orden}
        aria-label="Orden"
        title="Orden en la lista (menor = más arriba)"
        className={`${campoChico} w-20`}
      />
      <button
        type="submit"
        disabled={pendiente}
        className="h-10 rounded-lg border border-foreground/15 px-4 text-sm font-medium hover:border-brand disabled:opacity-60"
      >
        {pendiente ? "…" : "Guardar"}
      </button>
      <Aviso estado={estado} className="w-full" />
    </form>
  );
}
