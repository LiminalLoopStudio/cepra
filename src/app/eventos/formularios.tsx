"use client";

import { useActionState } from "react";
import {
  actualizarEvento,
  actualizarZona,
  actualizarSeccion,
  asignarStaff,
  cambiarEstadoEvento,
  crearSeccion,
  crearEvento,
  crearZona,
  type Estado,
} from "./actions";

export type Persona = { id: string; nombre: string; rol: string };

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const campoChico =
  "h-10 w-full rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const botonPrincipal =
  "h-11 rounded-lg bg-brand px-6 font-semibold text-white disabled:opacity-60";
const botonSecundario =
  "h-10 rounded-lg border border-foreground/15 px-4 text-sm font-medium hover:border-brand disabled:opacity-60";

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

// ---------------------------------------------------------------------------
// Evento: alta y edición
// ---------------------------------------------------------------------------
type DatosEvento = { nombre: string; lugar: string; fecha_inicio: string; fecha_fin: string; notas: string };

export function EventoForm(props: { modo: "crear" } | { modo: "editar"; id: string; inicial: DatosEvento }) {
  const accionServidor = props.modo === "crear" ? crearEvento : actualizarEvento.bind(null, props.id);
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(accionServidor, {});
  const v =
    (estado.ok && props.modo === "crear" ? undefined : estado.valores) ??
    (props.modo === "editar" ? props.inicial : undefined);

  return (
    <form
      key={estado.n ?? 0}
      action={accion}
      onReset={(e) => e.preventDefault()}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Nombre</span>
        <input name="nombre" required placeholder="GamingFest Liverpool 2026" defaultValue={v?.nombre} className={campo} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Lugar (opcional)</span>
        <input name="lugar" placeholder="Centro Banamex, CDMX" defaultValue={v?.lugar} className={campo} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Inicio</span>
        <input name="fecha_inicio" type="date" required defaultValue={v?.fecha_inicio} className={campo} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Fin</span>
        <input name="fecha_fin" type="date" required defaultValue={v?.fecha_fin} className={campo} />
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Notas (opcional)</span>
        <textarea
          name="notas"
          rows={2}
          defaultValue={v?.notas}
          className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
      </label>
      <Aviso estado={estado} className="sm:col-span-2" />
      <div className="sm:col-span-2">
        <button type="submit" disabled={pendiente} className={botonPrincipal}>
          {pendiente ? "Guardando…" : props.modo === "crear" ? "Crear evento" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Evento: activar / cerrar / regresar a planeado
// ---------------------------------------------------------------------------
export function EstadoEventoBotones({ id, estado: actual }: { id: string; estado: string }) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(
    cambiarEstadoEvento.bind(null, id),
    {},
  );
  const opciones: [string, string][] =
    actual === "planeado"
      ? [["activo", "Activar evento"]]
      : actual === "activo"
        ? [["cerrado", "Cerrar evento"], ["planeado", "Regresar a planeado"]]
        : [["activo", "Reabrir como activo"]];

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {opciones.map(([valor, textoBoton]) => (
          <form key={valor} action={accion}>
            <input type="hidden" name="estado" value={valor} />
            <button
              type="submit"
              disabled={pendiente}
              className={valor === "activo" ? botonPrincipal : botonSecundario}
            >
              {textoBoton}
            </button>
          </form>
        ))}
      </div>
      <Aviso estado={estado} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zonas
// ---------------------------------------------------------------------------
function SelectLider({ lideres, valor }: { lideres: Persona[]; valor?: string }) {
  return (
    <select name="lider_id" defaultValue={valor ?? ""} className={campoChico} aria-label="Líder">
      <option value="">Sin líder</option>
      {lideres.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
  );
}

export function NuevaZonaForm({ eventoId, lideres }: { eventoId: string; lideres: Persona[] }) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(crearZona.bind(null, eventoId), {});
  const v = estado.ok ? undefined : estado.valores;

  return (
    <form
      key={estado.n ?? 0}
      action={accion}
      onReset={(e) => e.preventDefault()}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium">Nombre de la zona</span>
        <input name="nombre" required placeholder="Zona Xbox" defaultValue={v?.nombre} className={campoChico} />
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium">Líder</span>
        <SelectLider lideres={lideres} valor={v?.lider_id} />
      </label>
      <button type="submit" disabled={pendiente} className={botonSecundario}>
        {pendiente ? "Creando…" : "Crear zona"}
      </button>
      <Aviso estado={estado} className="w-full" />
    </form>
  );
}

export function EditarZonaForm({
  zonaId,
  eventoId,
  nombre,
  liderId,
  lideres,
}: {
  zonaId: string;
  eventoId: string;
  nombre: string;
  liderId: string | null;
  lideres: Persona[];
}) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(
    actualizarZona.bind(null, zonaId, eventoId),
    {},
  );
  const v = estado.valores ?? { nombre, lider_id: liderId ?? "" };

  return (
    <form action={accion} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-center gap-2">
      <input name="nombre" required defaultValue={v.nombre} aria-label="Nombre de la zona" className={`${campoChico} min-w-40 flex-1 font-semibold`} />
      <div className="min-w-40 flex-1">
        <SelectLider lideres={lideres} valor={v.lider_id} />
      </div>
      <button type="submit" disabled={pendiente} className={botonSecundario}>
        {pendiente ? "…" : "Guardar"}
      </button>
      <Aviso estado={estado} className="w-full" />
    </form>
  );
}

export function AsignarStaffForm({
  zonaId,
  eventoId,
  disponibles,
  secciones = [],
}: {
  zonaId: string;
  eventoId: string;
  disponibles: Persona[];
  secciones?: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(
    asignarStaff.bind(null, zonaId, eventoId),
    {},
  );

  if (disponibles.length === 0) {
    return <p className="text-xs text-muted">Todas las personas activas ya tienen zona en este evento.</p>;
  }

  return (
    <form key={estado.n ?? 0} action={accion} className="flex flex-wrap items-center gap-2">
      <select name="usuario_id" required defaultValue="" className={`${campoChico} min-w-48 flex-1`} aria-label="Persona">
        <option value="" disabled>
          Agregar persona…
        </option>
        {disponibles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      {secciones.length > 0 ? (
        <select name="seccion_id" defaultValue="" className={`${campoChico} min-w-40 flex-1`} aria-label="Sección">
          <option value="">Zona general</option>
          {secciones.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.nombre}
            </option>
          ))}
        </select>
      ) : null}
      <button type="submit" disabled={pendiente} className={botonSecundario}>
        {pendiente ? "…" : "Asignar"}
      </button>
      <Aviso estado={estado} className="w-full" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------
export function NuevaSeccionForm({ zonaId, eventoId, lideres }: { zonaId: string; eventoId: string; lideres: Persona[] }) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(crearSeccion.bind(null, zonaId, eventoId), {});
  const v = estado.ok ? undefined : estado.valores;
  return (
    <form key={estado.n ?? 0} action={accion} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-center gap-2">
      <input
        name="nombre"
        required
        placeholder="Nueva sección: VR, Xbox, PlayStation…"
        defaultValue={v?.nombre}
        aria-label="Nombre de la sección"
        className={`${campoChico} min-w-44 flex-1`}
      />
      <div className="min-w-40 flex-1">
        <SelectLider lideres={lideres} valor={v?.lider_id} />
      </div>
      <button type="submit" disabled={pendiente} className={botonSecundario}>
        {pendiente ? "…" : "Agregar sección"}
      </button>
      <Aviso estado={estado} className="w-full" />
    </form>
  );
}

export function EditarSeccionForm({
  seccionId,
  eventoId,
  nombre,
  liderId,
  lideres,
}: {
  seccionId: string;
  eventoId: string;
  nombre: string;
  liderId: string | null;
  lideres: Persona[];
}) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(
    actualizarSeccion.bind(null, seccionId, eventoId),
    {},
  );
  const v = estado.valores ?? { nombre, lider_id: liderId ?? "" };
  return (
    <form action={accion} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-center gap-2">
      <input name="nombre" required defaultValue={v.nombre} aria-label="Nombre de la sección" className={`${campoChico} min-w-36 flex-1 font-medium`} />
      <div className="min-w-36 flex-1">
        <SelectLider lideres={lideres} valor={v.lider_id} />
      </div>
      <button type="submit" disabled={pendiente} className={botonSecundario}>
        {pendiente ? "…" : "Guardar"}
      </button>
      <Aviso estado={estado} className="w-full" />
    </form>
  );
}
