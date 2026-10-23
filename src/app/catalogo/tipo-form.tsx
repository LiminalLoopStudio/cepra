"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { actualizarTipo, crearTipo, type CamposTipo, type EstadoTipo } from "./actions";

export type CategoriaOpcion = { id: string; nombre: string; prefijo: string };

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

type Props =
  | { modo: "crear"; categorias: CategoriaOpcion[] }
  | {
      modo: "editar";
      id: string;
      codigo: string;
      categorias: CategoriaOpcion[];
      inicial: CamposTipo;
    };

// Formulario de tipo de artículo: sirve para dar de alta y para editar.
// El código NO se escribe: lo genera la base con las letras de la categoría.
export function TipoForm(props: Props) {
  const accionServidor = props.modo === "crear" ? crearTipo : actualizarTipo.bind(null, props.id);

  const [estado, accion, pendiente] = useActionState<EstadoTipo, FormData>(accionServidor, {});

  // Si hubo error se muestran los valores que escribió el usuario;
  // si no, los iniciales (al editar) o vacío (al crear).
  const v = estado.valores ?? (props.modo === "editar" ? props.inicial : undefined);

  // Cambia qué campos se ven: por pieza → puertos y accesorios; por cantidad → existencia.
  const [control, setControl] = useState<string>(v?.serializado ?? "");
  const [categoriaId, setCategoriaId] = useState<string>(v?.categoria_id ?? "");

  const prefijo = props.categorias.find((c) => c.id === categoriaId)?.prefijo;
  const ejemplo = prefijo ? `${prefijo}01` : "CN01";

  return (
    <form
      // Al crear uno, cambia la key y React limpia el formulario.
      key={estado.creado ?? "form"}
      action={accion}
      // React limpia el formulario después de cada envío. Si hubo error eso
      // desmarcaba las opciones (radio) aunque la pantalla las mostrara elegidas.
      // Se evita: lo escrito se conserva; tras un alta exitosa la "key" lo limpia.
      onReset={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Categoría</span>
        <select
          name="categoria_id"
          required
          defaultValue={v?.categoria_id ?? ""}
          onChange={(e) => setCategoriaId(e.target.value)}
          className={campo}
        >
          <option value="" disabled>
            Elige…
          </option>
          {props.categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.prefijo})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {props.modo === "crear"
            ? `El código se genera solo: ${ejemplo}, ${prefijo ?? "CN"}02…`
            : `Código actual: ${props.codigo}. Cambiar la categoría le da un código nuevo, solo si aún no tiene piezas ni movimientos.`}
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

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Consumo eléctrico (W por unidad)</span>
        <input
          name="consumo_w"
          type="number"
          min={0}
          step={1}
          placeholder="Ej. 200"
          defaultValue={v?.consumo_w ?? ""}
          className={campo}
        />
        <span className="text-xs text-muted">Opcional. El documento maestro suma el consumo por zona.</span>
      </label>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">¿Cómo se controla?</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="serializado"
            value="si"
            required
            checked={control === "si"}
            onChange={() => setControl("si")}
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
            checked={control === "no"}
            onChange={() => setControl("no")}
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

      {/* Por pieza: puertos. */}
      {control === "si" ? (
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Puertos (opcional)</span>
          <input
            name="puertos"
            placeholder="HDMI 2.1, USB-A x3, Ethernet"
            defaultValue={v?.puertos}
            className={campo}
          />
          <span className="text-xs text-muted">
            Conexiones que trae el equipo, separadas por coma.
          </span>
        </label>
      ) : null}

      {/* Por pieza: accesorios que viajan con el equipo y llevan su propia etiqueta. */}
      {control === "si" ? (
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Accesorios con etiqueta propia</legend>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="lleva_control"
              value="si"
              defaultChecked={v?.lleva_control === "si"}
              className="mt-1 size-4"
            />
            <span>
              <strong>Trae control</strong>
              <span className="block text-sm text-muted">
                Se imprime una etiqueta para el control: GP-{ejemplo}-0001-CTRL
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="lleva_cables"
              value="si"
              defaultChecked={v?.lleva_cables === "si"}
              className="mt-1 size-4"
            />
            <span>
              <strong>Trae cables originales</strong>
              <span className="block text-sm text-muted">
                Una etiqueta para el juego de cables (HDMI + corriente): GP-{ejemplo}-0001-CBL
              </span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {/* Por cantidad: al crear, cuántos hay hoy; al editar, enlace a Stock. */}
      {control === "no" && props.modo === "crear" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Existencia inicial</span>
          <input
            name="existencia_inicial"
            type="number"
            min={0}
            step={1}
            defaultValue={v?.existencia_inicial ?? "0"}
            className={campo}
          />
          <span className="text-xs text-muted">
            Cuántos hay hoy en almacén. Después se ajusta desde Stock.
          </span>
        </label>
      ) : null}

      {control === "no" && props.modo === "editar" ? (
        <p className="text-sm sm:col-span-2">
          Las existencias se cambian en{" "}
          <Link href={`/stock/${props.id}`} className="text-brand hover:underline">
            Stock → Ajustar existencias
          </Link>
          , para que cada cambio quede registrado con su motivo.
        </p>
      ) : null}

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
          {estado.mensaje ?? `Tipo ${estado.creado} agregado.`}
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
