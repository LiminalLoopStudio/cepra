"use client";

import { useActionState, useRef, useState } from "react";
import { crearEquipo, type EstadoEquipo } from "../actions";

type Tipo = { id: string; codigo_tipo: string; nombre: string; puertos_default: string[] };
type Propietario = { id: string; nombre: string; tipo: string };

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function EquipoForm({ tipos, propietarios }: { tipos: Tipo[]; propietarios: Propietario[] }) {
  const [estado, accion, pendiente] = useActionState<EstadoEquipo, FormData>(crearEquipo, {});
  const v = estado.valores;

  const [propiedad, setPropiedad] = useState(v?.propiedad ?? "propio");
  const puertosRef = useRef<HTMLInputElement>(null);

  // Al elegir el tipo se sugieren sus puertos (se pueden editar).
  function alCambiarTipo(id: string) {
    const tipo = tipos.find((t) => t.id === id);
    if (tipo && puertosRef.current) {
      puertosRef.current.value = tipo.puertos_default.join(", ");
    }
  }

  const empresasExternas = propietarios.filter((p) => p.tipo !== "propio");

  return (
    <form
      // Tras cada alta cambia la key: se limpia serie y notas, el resto se conserva.
      key={estado.etiqueta ?? "form"}
      action={accion}
      className="grid gap-4 sm:grid-cols-2"
    >
      {estado.ok && estado.etiqueta ? (
        <div
          role="status"
          className="rounded-xl border-2 border-green-500/40 bg-green-500/10 p-4 text-center sm:col-span-2"
        >
          <p className="text-sm text-green-500">Equipo registrado. Su etiqueta es:</p>
          <p className="mt-1 font-mono text-2xl font-bold">{estado.etiqueta}</p>
          <p className="mt-1 text-xs text-muted">
            Caja: {estado.etiqueta}-C · Queda &quot;Por validar&quot; hasta escanear equipo y caja.
          </p>
        </div>
      ) : null}

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Tipo de equipo</span>
        <select
          name="articulo_id"
          required
          defaultValue={v?.articulo_id ?? ""}
          onChange={(e) => alCambiarTipo(e.target.value)}
          className={campo}
        >
          <option value="" disabled>
            Elige un tipo…
          </option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.codigo_tipo} — {t.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Marca</span>
        <input name="marca" defaultValue={v?.marca} placeholder="Microsoft" className={campo} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Modelo</span>
        <input name="modelo" defaultValue={v?.modelo} placeholder="Series S 512GB" className={campo} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Número de serie</span>
        <input
          name="serie"
          defaultValue={v?.serie}
          placeholder="Opcional pero recomendado"
          className={`${campo} font-mono`}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Estado físico</span>
        <select name="estado_fisico" defaultValue={v?.estado_fisico ?? "bueno"} className={campo}>
          <option value="nuevo">Nuevo</option>
          <option value="bueno">Bueno</option>
          <option value="regular">Regular</option>
          <option value="con_falla">Con falla</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Puertos</span>
        <input
          ref={puertosRef}
          name="puertos"
          defaultValue={v?.puertos}
          placeholder="Se llenan al elegir el tipo"
          className={campo}
        />
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
              defaultValue={v?.propietario_id ?? ""}
              className={campo}
            >
              <option value="" disabled>
                Elige la empresa…
              </option>
              {empresasExternas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {empresasExternas.length === 0 ? (
              <span className="text-xs text-yellow-500">
                Aún no hay empresas patrocinadoras o prestamistas registradas.
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Fecha de devolución</span>
            <input
              name="fecha_devolucion"
              type="date"
              required
              defaultValue={v?.fecha_devolucion}
              className={campo}
            />
          </label>
        </>
      ) : null}

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Notas</span>
        <textarea
          name="notas"
          rows={2}
          defaultValue={v?.notas}
          placeholder="Rayón en la tapa, incluye base vertical…"
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
          {pendiente ? "Guardando…" : "Registrar equipo"}
        </button>
      </div>
    </form>
  );
}
