"use client";

import { useActionState, useState } from "react";
import { actualizarEquipo, type CamposEdicionEquipo, type EstadoEdicion } from "../../actions";

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

type Props = {
  id: string;
  empresas: { id: string; nombre: string }[];
  inicial: CamposEdicionEquipo;
};

export function EditarEquipoForm({ id, empresas, inicial }: Props) {
  const [estado, accion, pendiente] = useActionState<EstadoEdicion, FormData>(
    actualizarEquipo.bind(null, id),
    {},
  );
  const v = estado.valores ?? inicial;
  const [propiedad, setPropiedad] = useState(v.propiedad);

  return (
    <form action={accion}
      // React limpia el formulario después de cada envío. Si hubo error eso
      // desmarcaba las opciones (radio) aunque la pantalla las mostrara elegidas.
      // Se evita: lo escrito se conserva; tras un alta exitosa la "key" lo limpia.
      onReset={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Marca</span>
        <input name="marca" defaultValue={v.marca} className={campo} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Modelo</span>
        <input name="modelo" defaultValue={v.modelo} className={campo} />
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Número de serie</span>
        <input name="serie" defaultValue={v.serie} className={`${campo} font-mono`} />
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Puertos</span>
        <input name="puertos" defaultValue={v.puertos} className={campo} />
        <span className="text-xs text-muted">Separados por coma.</span>
      </label>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">¿De quién es?</legend>
        <div className="flex flex-wrap gap-4">
          {[
            ["propio", "Propio (Gaming Partners)"],
            ["patrocinado", "Patrocinado"],
            ["prestamo", "Préstamo"],
          ].map(([valor, texto]) => (
            <label key={valor} className="flex items-center gap-2">
              <input
                type="radio"
                name="propiedad"
                value={valor}
                checked={propiedad === valor}
                onChange={() => setPropiedad(valor)}
              />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>

      {propiedad !== "propio" ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Empresa dueña</span>
            <select
              name="propietario_id"
              required
              defaultValue={v.propietario_id}
              className={campo}
            >
              <option value="" disabled>
                Elige la empresa…
              </option>
              {empresas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Fecha de devolución</span>
            <input
              name="fecha_devolucion"
              type="date"
              required
              defaultValue={v.fecha_devolucion}
              className={campo}
            />
          </label>
        </>
      ) : null}

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Notas</span>
        <textarea
          name="notas"
          rows={3}
          defaultValue={v.notas}
          className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </label>

      {estado.error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500 sm:col-span-2"
        >
          {estado.error}
        </p>
      ) : null}

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
