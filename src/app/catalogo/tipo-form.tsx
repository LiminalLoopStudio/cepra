"use client";

import { useActionState } from "react";
import { actualizarTipo, crearTipo, type CamposTipo, type EstadoTipo } from "./actions";

const CATEGORIAS = [
  "Consola",
  "Pantalla",
  "PC",
  "Laptop",
  "Control",
  "Periférico",
  "Cable",
  "Adaptador",
  "Extensión",
  "Corriente",
  "Consumible",
];

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

type Props =
  | { modo: "crear" }
  | { modo: "editar"; id: string; inicial: CamposTipo };

// Formulario de tipo de artículo: sirve para dar de alta y para editar.
export function TipoForm(props: Props) {
  const accionServidor =
    props.modo === "crear" ? crearTipo : actualizarTipo.bind(null, props.id);

  const [estado, accion, pendiente] = useActionState<EstadoTipo, FormData>(accionServidor, {});

  // Si hubo error se muestran los valores que escribió el usuario;
  // si no, los iniciales (al editar) o vacío (al crear).
  const v = estado.valores ?? (props.modo === "editar" ? props.inicial : undefined);

  return (
    <form
      // Al crear uno, cambia la key y React limpia el formulario.
      key={estado.creado ?? "form"}
      action={accion}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Código</span>
        <input
          name="codigo_tipo"
          required
          maxLength={4}
          placeholder="XBX"
          defaultValue={v?.codigo_tipo}
          className={`${campo} font-mono uppercase`}
        />
        <span className="text-xs text-muted">
          2 a 4 letras o números. Va en la etiqueta: GP-XBX-0001
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Nombre</span>
        <input
          name="nombre"
          required
          placeholder="Xbox Series X"
          defaultValue={v?.nombre}
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Categoría</span>
        <input
          name="categoria"
          required
          list="categorias"
          placeholder="Consola"
          defaultValue={v?.categoria}
          className={campo}
        />
        <datalist id="categorias">
          {CATEGORIAS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Stock mínimo</span>
        <input
          name="stock_minimo"
          type="number"
          min={0}
          step={1}
          defaultValue={v?.stock_minimo ?? "0"}
          className={campo}
        />
        <span className="text-xs text-muted">Avisa cuando haya menos disponibles que esto.</span>
      </label>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">¿Cómo se controla?</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="serializado"
            value="si"
            required
            defaultChecked={v?.serializado === "si"}
            className="mt-1"
          />
          <span>
            <strong>Por pieza</strong>
            <span className="block text-sm text-muted">
              Cada una lleva su QR. Consolas, pantallas, controles, cables caros.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="serializado"
            value="no"
            defaultChecked={v?.serializado === "no"}
            className="mt-1"
          />
          <span>
            <strong>Por cantidad</strong>
            <span className="block text-sm text-muted">
              Solo se cuenta cuántos hay. Cables baratos, consumibles.
            </span>
          </span>
        </label>
      </fieldset>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Puertos (opcional)</span>
        <input
          name="puertos"
          placeholder="HDMI 2.1, USB-A x3, Ethernet"
          defaultValue={v?.puertos}
          className={campo}
        />
        <span className="text-xs text-muted">Separados por coma.</span>
      </label>

      {estado.error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500 sm:col-span-2"
        >
          {estado.error}
        </p>
      ) : null}
      {estado.ok && estado.creado ? (
        <p
          role="status"
          className="rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-500 sm:col-span-2"
        >
          Tipo {estado.creado} agregado.
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pendiente}
          className="h-11 rounded-lg bg-brand px-6 font-semibold text-white disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : props.modo === "crear" ? "Agregar tipo" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
