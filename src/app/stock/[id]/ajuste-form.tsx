"use client";

import { useActionState, useState } from "react";
import { ajustarStock, type EstadoAjuste } from "../actions";

const MOTIVOS = {
  entrada: [
    ["compra", "Compra"],
    ["prestamo_recibido", "Préstamo recibido de otra empresa"],
    ["correccion", "Corrección de conteo"],
  ],
  salida: [
    ["perdida", "Pérdida"],
    ["baja", "Baja (dañado sin reparación)"],
    ["devolucion_propietario", "Devolución a la empresa dueña"],
    ["correccion", "Corrección de conteo"],
  ],
} as const;

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function AjusteForm({ articuloId }: { articuloId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoAjuste, FormData>(
    ajustarStock.bind(null, articuloId),
    {},
  );
  const [direccion, setDireccion] = useState<"entrada" | "salida">("entrada");

  return (
    <form key={estado.n ?? 0} action={accion}
      // React limpia el formulario después de cada envío. Si hubo error eso
      // desmarcaba las opciones (radio) aunque la pantalla las mostrara elegidas.
      // Se evita: lo escrito se conserva; tras un alta exitosa la "key" lo limpia.
      onReset={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2"
    >
      <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Movimiento</legend>
        {(
          [
            ["entrada", "Agregar (+)"],
            ["salida", "Quitar (−)"],
          ] as const
        ).map(([valor, texto]) => (
          <label
            key={valor}
            className={`flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 ${
              direccion === valor ? "border-brand bg-brand/10" : "border-foreground/15"
            }`}
          >
            <input
              type="radio"
              name="direccion"
              value={valor}
              checked={direccion === valor}
              onChange={() => setDireccion(valor)}
            />
            {texto}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Cantidad</span>
        <input name="cantidad" type="number" min={1} step={1} required className={campo} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Motivo</span>
        <select key={direccion} name="motivo" required defaultValue="" className={campo}>
          <option value="" disabled>
            Elige…
          </option>
          {MOTIVOS[direccion].map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Nota (opcional)</span>
        <input
          name="nota"
          placeholder="Factura 1234, se perdieron en el montaje de GamingFest…"
          className={campo}
        />
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
          {pendiente ? "Guardando…" : "Registrar ajuste"}
        </button>
      </div>
    </form>
  );
}
