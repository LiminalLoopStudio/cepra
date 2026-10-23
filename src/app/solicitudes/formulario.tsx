"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ArticuloOpcion = {
  id: string;
  nombre: string;
  categoria: string;
  serializado: boolean;
  disponibles: number;
};

export type ZonaOpcion = { id: string; texto: string };

type Linea = { articulo_id: string; cantidad: number };

type Props =
  | { modo: "crear"; articulos: ArticuloOpcion[]; zonas: ZonaOpcion[] }
  | {
      modo: "ajustar";
      articulos: ArticuloOpcion[];
      solicitudId: string;
      inicial: { lineas: Linea[]; necesita_para: string | null; notas: string | null };
      alGuardar?: () => void;
    };

const campo =
  "h-11 w-full rounded-lg border border-foreground/15 bg-background px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

// ISO → valor de <input type="datetime-local"> en la hora del navegador.
function aLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function SolicitudForm(props: Props) {
  const router = useRouter();
  const { articulos } = props;
  const porId = useMemo(() => new Map(articulos.map((a) => [a.id, a])), [articulos]);
  const categorias = useMemo(() => [...new Set(articulos.map((a) => a.categoria))].sort(), [articulos]);

  const [zona, setZona] = useState(props.modo === "crear" ? (props.zonas[0]?.id ?? "") : "");
  const [lineas, setLineas] = useState<Linea[]>(props.modo === "ajustar" ? props.inicial.lineas : []);
  const [articulo, setArticulo] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [necesita, setNecesita] = useState(props.modo === "ajustar" ? aLocal(props.inicial.necesita_para) : "");
  const [notas, setNotas] = useState(props.modo === "ajustar" ? (props.inicial.notas ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function agregar() {
    const n = Number(cantidad);
    if (!articulo || !Number.isInteger(n) || n <= 0) return;
    setLineas((ls) =>
      ls.some((l) => l.articulo_id === articulo)
        ? ls.map((l) => (l.articulo_id === articulo ? { ...l, cantidad: l.cantidad + n } : l))
        : [...ls, { articulo_id: articulo, cantidad: n }],
    );
    setArticulo("");
    setCantidad("1");
    setError(null);
  }

  function cambiarCantidad(id: string, valor: string) {
    const n = Math.max(1, Math.floor(Number(valor) || 1));
    setLineas((ls) => ls.map((l) => (l.articulo_id === id ? { ...l, cantidad: n } : l)));
  }

  async function enviar() {
    setError(null);
    if (props.modo === "crear" && !zona) return setError("Elige la zona.");
    if (lineas.length === 0) return setError("Agrega al menos un artículo.");

    setOcupado(true);
    const supabase = createClient();
    const comunes = {
      p_items: lineas,
      p_necesita_para: necesita ? new Date(necesita).toISOString() : null,
      p_notas: notas.trim() || null,
    };
    const { data, error: err } =
      props.modo === "crear"
        ? await supabase.rpc("crear_solicitud", { p_zona: zona, ...comunes })
        : await supabase.rpc("ajustar_solicitud", { p_solicitud: props.solicitudId, ...comunes });
    setOcupado(false);

    const r = data as { ok: boolean; mensaje: string; id?: string } | null;
    if (err || !r) return setError(err?.message ?? "No se pudo guardar.");
    if (!r.ok) return setError(r.mensaje);

    if (props.modo === "crear" && r.id) {
      router.push(`/solicitudes/${r.id}?nueva=1`);
    } else {
      if (props.modo === "ajustar") props.alGuardar?.();
      router.refresh();
    }
  }

  const sinZona = props.modo === "crear" && props.zonas.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {props.modo === "crear" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Zona</span>
          {sinZona ? (
            <p className="rounded-lg bg-yellow-500/15 px-3 py-2 text-sm text-yellow-500">
              No estás asignado a ninguna zona de un evento abierto. Pide a tu líder o al administrador que te asigne.
            </p>
          ) : (
            <select value={zona} onChange={(e) => setZona(e.target.value)} className={campo}>
              {props.zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.texto}
                </option>
              ))}
            </select>
          )}
        </label>
      ) : null}

      {/* Agregar artículo */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">¿Qué necesitas?</span>
        <div className="flex flex-wrap gap-2">
          <select
            value={articulo}
            onChange={(e) => setArticulo(e.target.value)}
            className={`${campo} min-w-56 flex-1`}
            aria-label="Artículo"
          >
            <option value="">Elige un artículo…</option>
            {categorias.map((c) => (
              <optgroup key={c} label={c}>
                {articulos
                  .filter((a) => a.categoria === c)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} ({a.disponibles} disponibles)
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className={`${campo} w-24`}
            aria-label="Cantidad"
          />
          <button
            type="button"
            onClick={agregar}
            disabled={!articulo}
            className="h-11 rounded-lg border border-foreground/15 px-5 font-medium hover:border-brand disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-foreground/10">
        {lineas.length === 0 ? (
          <p className="p-4 text-sm text-muted">Todavía no agregas nada.</p>
        ) : (
          <ul className="divide-y divide-foreground/10">
            {lineas.map((l) => {
              const a = porId.get(l.articulo_id);
              const poco = a && l.cantidad > a.disponibles;
              return (
                <li key={l.articulo_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="font-medium">{a?.nombre ?? "Artículo"}</span>
                    <span className={`block text-xs ${poco ? "text-yellow-500" : "text-muted"}`}>
                      {a ? `${a.disponibles} disponibles ahora` : ""}
                      {poco ? " · almacén podría no tener todos" : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={l.cantidad}
                      onChange={(e) => cambiarCantidad(l.articulo_id, e.target.value)}
                      className="h-10 w-20 rounded-lg border border-foreground/15 bg-background px-2 text-center"
                      aria-label={`Cantidad de ${a?.nombre ?? "artículo"}`}
                    />
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.articulo_id !== l.articulo_id))}
                      className="text-sm text-muted underline hover:text-red-500"
                    >
                      Quitar
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">¿Para cuándo? (opcional)</span>
          <input type="datetime-local" value={necesita} onChange={(e) => setNecesita(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Notas (opcional)</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Para la estación 3, torneo de las 5 pm…"
            className={campo}
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={enviar}
        disabled={ocupado || sinZona}
        className="h-12 rounded-lg bg-brand font-semibold text-white disabled:opacity-60 sm:self-start sm:px-8"
      >
        {ocupado ? "Guardando…" : props.modo === "crear" ? "Enviar solicitud" : "Guardar cambios"}
      </button>
    </div>
  );
}
