"use client";

import { useActionState } from "react";
import {
  actualizarPropietario,
  crearPropietario,
  type CamposPropietario,
  type EstadoPropietario,
} from "./actions";

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

type Props =
  | { modo: "crear" }
  | { modo: "editar"; id: string; inicial: CamposPropietario };

export function PropietarioForm(props: Props) {
  const accionServidor =
    props.modo === "crear"
      ? crearPropietario
      : actualizarPropietario.bind(null, props.id, props.inicial.tipo);

  const [estado, accion, pendiente] = useActionState<EstadoPropietario, FormData>(
    accionServidor,
    {},
  );
  const v = estado.valores ?? (props.modo === "editar" ? props.inicial : undefined);
  const esPropio = props.modo === "editar" && props.inicial.tipo === "propio";

  return (
    <form key={estado.creado ?? "form"} action={accion} className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Nombre de la empresa</span>
        <input
          name="nombre"
          required
          placeholder="Marca Patrocinadora SA de CV"
          defaultValue={v?.nombre}
          className={campo}
        />
      </label>

      {esPropio ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tipo</span>
          <p className="flex h-11 items-center text-muted">Propio (no se puede cambiar)</p>
          <input type="hidden" name="tipo" value="propio" />
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tipo</span>
          <select name="tipo" required defaultValue={v?.tipo ?? ""} className={campo}>
            <option value="" disabled>
              Elige…
            </option>
            <option value="patrocinador">Patrocinador (presta equipo por patrocinio)</option>
            <option value="prestamista">Prestamista (renta o préstamo de equipo)</option>
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Contacto (opcional)</span>
        <input
          name="contacto"
          placeholder="Nombre, teléfono o correo de quien entrega y recibe el equipo"
          defaultValue={v?.contacto}
          className={campo}
        />
      </label>

      {estado.error ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500 sm:col-span-2">
          {estado.error}
        </p>
      ) : null}
      {estado.ok && estado.creado ? (
        <p role="status" className="rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-500 sm:col-span-2">
          {estado.creado} registrada.
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 rounded-lg bg-brand px-6 font-semibold text-white disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : props.modo === "crear" ? "Registrar empresa" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
