"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ORIGEN, ORIGENES, watts, type Origen } from "@/lib/maestro-textos";
import { createClient } from "@/lib/supabase/client";

type Persona = { id: string; nombre: string; rol: string };
type Seccion = { id: string; nombre: string; lider: Persona | null; staff: Persona[] };
type Zona = { id: string; nombre: string; lider: Persona | null; staff: Persona[]; secciones: Seccion[] };
type Renglon = {
  id: string;
  zona_id: string;
  seccion_id: string | null;
  articulo_id: string | null;
  descripcion: string | null;
  cantidad: number;
  origen: Origen;
  consumo_w: number | null;
  notas: string | null;
};
type Articulo = {
  articulo_id: string;
  codigo_tipo: string;
  nombre: string;
  categoria: string;
  consumo_w: number | null;
  activo: boolean;
  total_almacen: number;
  disponible: number;
};

const OTRO = "__otro";
const celda = "h-9 rounded-md border border-foreground/15 bg-background px-2 text-sm";

function useGuardar() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function correr(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setOcupado(true);
    setError(null);
    const { error: e } = await fn();
    setOcupado(false);
    if (e) {
      setError(e.message);
      return false;
    }
    router.refresh();
    return true;
  }
  return { error, ocupado, correr };
}

// ---------------------------------------------------------------------------
// Renglón existente (cantidad y origen editables en el lugar)
// ---------------------------------------------------------------------------
function FilaRenglon({ r, art, editable }: { r: Renglon; art: Articulo | undefined; editable: boolean }) {
  const { error, ocupado, correr } = useGuardar();
  const supabase = createClient();
  const [cantidad, setCantidad] = useState(String(r.cantidad));
  const w = (art ? art.consumo_w : r.consumo_w) ?? 0;

  const guardar = (cambios: Partial<Renglon>) => correr(() => supabase.from("maestro_items").update(cambios).eq("id", r.id));

  return (
    <tr className="align-middle">
      <td className="py-1.5 pr-2">
        {art ? (
          <>
            <span className="font-mono text-xs text-muted">{art.codigo_tipo}</span> <span>{art.nombre}</span>
          </>
        ) : (
          <span className="italic">{r.descripcion}</span>
        )}
        {error ? <span className="block text-xs text-red-500">{error}</span> : null}
      </td>
      <td className="py-1.5 pr-2">
        {editable ? (
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={cantidad}
            disabled={ocupado}
            onChange={(e) => setCantidad(e.target.value)}
            onBlur={() => {
              const n = Math.floor(Number(cantidad));
              if (n > 0 && n !== r.cantidad) void guardar({ cantidad: n });
              else setCantidad(String(r.cantidad));
            }}
            aria-label="Cantidad"
            className={`${celda} w-20 text-right tabular-nums`}
          />
        ) : (
          <span className="tabular-nums">{r.cantidad}</span>
        )}
      </td>
      <td className="py-1.5 pr-2">
        {editable ? (
          <select
            value={r.origen}
            disabled={ocupado}
            onChange={(e) => void guardar({ origen: e.target.value as Origen })}
            aria-label="De dónde sale"
            className={celda}
          >
            {ORIGENES.filter((o) => art || o !== "almacen").map((o) => (
              <option key={o} value={o}>
                {ORIGEN[o]}
              </option>
            ))}
          </select>
        ) : (
          ORIGEN[r.origen]
        )}
      </td>
      <td className="py-1.5 pr-2 text-right text-xs text-muted tabular-nums">{w ? watts(w * r.cantidad) : "—"}</td>
      <td className="py-1.5 text-right">
        {editable ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void correr(() => supabase.from("maestro_items").delete().eq("id", r.id))}
            className="text-xs text-muted underline hover:text-red-500"
          >
            Quitar
          </button>
        ) : null}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Agregar renglón a una zona o sección
// ---------------------------------------------------------------------------
function NuevoRenglon({ zonaId, seccionId, articulos }: { zonaId: string; seccionId: string | null; articulos: Articulo[] }) {
  const { error, ocupado, correr } = useGuardar();
  const [articulo, setArticulo] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [origen, setOrigen] = useState<Origen>("almacen");
  const [descripcion, setDescripcion] = useState("");
  const [consumo, setConsumo] = useState("");
  const categorias = useMemo(() => [...new Set(articulos.map((a) => a.categoria))].sort(), [articulos]);
  const otro = articulo === OTRO;

  async function agregar() {
    const n = Math.floor(Number(cantidad));
    if (!articulo || !(n > 0)) return;
    if (otro && !descripcion.trim()) return;
    const supabase = createClient();
    const ok = await correr(() =>
      supabase.from("maestro_items").insert({
        zona_id: zonaId,
        seccion_id: seccionId,
        articulo_id: otro ? null : articulo,
        descripcion: otro ? descripcion.trim() : null,
        consumo_w: otro && consumo ? Math.max(0, Math.floor(Number(consumo))) : null,
        cantidad: n,
        origen: otro && origen === "almacen" ? "renta" : origen,
      }),
    );
    if (ok) {
      setArticulo("");
      setCantidad("1");
      setDescripcion("");
      setConsumo("");
      setOrigen("almacen");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={articulo}
          onChange={(e) => {
            setArticulo(e.target.value);
            if (e.target.value === OTRO && origen === "almacen") setOrigen("renta");
          }}
          aria-label="Artículo a agregar"
          className={`${celda} min-w-56 flex-1`}
        >
          <option value="">Agregar equipo…</option>
          {categorias.map((c) => (
            <optgroup key={c} label={c}>
              {articulos
                .filter((a) => a.categoria === c)
                .map((a) => (
                  <option key={a.articulo_id} value={a.articulo_id}>
                    {a.codigo_tipo} · {a.nombre} (hay {a.total_almacen})
                  </option>
                ))}
            </optgroup>
          ))}
          <option value={OTRO}>Otro (no está en el catálogo)…</option>
        </select>
        {otro ? (
          <>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Qué es: Base pantalla referencial 45°"
              aria-label="Descripción"
              className={`${celda} min-w-48 flex-1`}
            />
            <input
              type="number"
              min={0}
              value={consumo}
              onChange={(e) => setConsumo(e.target.value)}
              placeholder="W c/u"
              aria-label="Consumo en watts por unidad"
              className={`${celda} w-24`}
            />
          </>
        ) : null}
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          aria-label="Cantidad"
          className={`${celda} w-20 text-right`}
        />
        <select value={origen} onChange={(e) => setOrigen(e.target.value as Origen)} aria-label="De dónde sale" className={celda}>
          {ORIGENES.filter((o) => !otro || o !== "almacen").map((o) => (
            <option key={o} value={o}>
              {ORIGEN[o]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={agregar}
          disabled={ocupado || !articulo || (otro && !descripcion.trim())}
          className="h-9 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Un lugar: la zona general o una de sus secciones
// ---------------------------------------------------------------------------
function Lugar(props: {
  titulo: string;
  lider: Persona | null;
  liderTexto: string;
  staff: Persona[];
  zonaId: string;
  seccionId: string | null;
  renglones: Renglon[];
  inv: Map<string, Articulo>;
  articulos: Articulo[];
  editable: boolean;
}) {
  const w = props.renglones.reduce(
    (s, r) => s + ((r.articulo_id ? props.inv.get(r.articulo_id)?.consumo_w : r.consumo_w) ?? 0) * r.cantidad,
    0,
  );
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-foreground/[0.03] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{props.titulo}</p>
        <p className="text-xs text-muted">
          {props.liderTexto}: <span className={props.lider ? "text-foreground" : "text-yellow-500"}>{props.lider?.nombre ?? "sin asignar"}</span>
          {" · "}
          {props.staff.length} staff{w ? ` · ${watts(w)}` : ""}
        </p>
      </div>
      {props.staff.length > 0 ? (
        <p className="text-xs text-muted">{props.staff.map((p) => p.nombre).join(", ")}</p>
      ) : null}
      {props.renglones.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-1 font-medium">Equipo</th>
                <th className="pb-1 font-medium">Cantidad</th>
                <th className="pb-1 font-medium">De dónde sale</th>
                <th className="pb-1 text-right font-medium">Consumo</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {props.renglones.map((r) => (
                <FilaRenglon key={r.id} r={r} art={r.articulo_id ? props.inv.get(r.articulo_id) : undefined} editable={props.editable} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted">Sin equipo asignado.</p>
      )}
      {props.editable ? <NuevoRenglon zonaId={props.zonaId} seccionId={props.seccionId} articulos={props.articulos} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor completo
// ---------------------------------------------------------------------------
export function EditorMaestro(props: {
  eventoId: string;
  editable: boolean;
  puedeCerrar: boolean;
  estado: "borrador" | "cerrado";
  zonas: Zona[];
  renglones: Renglon[];
  inventario: Articulo[];
}) {
  const router = useRouter();
  const inv = useMemo(() => new Map(props.inventario.map((a) => [a.articulo_id, a])), [props.inventario]);
  const articulos = useMemo(() => props.inventario.filter((a) => a.activo), [props.inventario]);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Balance por artículo (de almacén vs. lo que hay)
  const balance = useMemo(() => {
    const m = new Map<string, { codigo: string; nombre: string; total: number | null; asignado: number; fuera: number }>();
    for (const r of props.renglones) {
      const a = r.articulo_id ? inv.get(r.articulo_id) : undefined;
      const clave = r.articulo_id ?? `libre:${r.descripcion}`;
      const b = m.get(clave) ?? {
        codigo: a?.codigo_tipo ?? "—",
        nombre: a?.nombre ?? r.descripcion ?? "",
        total: a ? a.total_almacen : null,
        asignado: 0,
        fuera: 0,
      };
      if (r.origen === "almacen") b.asignado += r.cantidad;
      else b.fuera += r.cantidad;
      m.set(clave, b);
    }
    return [...m.values()].sort((x, y) => x.nombre.localeCompare(y.nombre));
  }, [props.renglones, inv]);

  const faltantes = balance.filter((b) => b.total !== null && b.asignado > b.total);
  const totalW = props.renglones.reduce(
    (s, r) => s + ((r.articulo_id ? inv.get(r.articulo_id)?.consumo_w : r.consumo_w) ?? 0) * r.cantidad,
    0,
  );
  const deAlmacen = props.renglones.filter((r) => r.origen === "almacen").reduce((s, r) => s + r.cantidad, 0);
  const deFuera = props.renglones.filter((r) => r.origen !== "almacen").reduce((s, r) => s + r.cantidad, 0);

  async function cambiarEstado(fn: "cerrar_maestro" | "reabrir_maestro") {
    setOcupado(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc(fn, { p_evento: props.eventoId });
    setOcupado(false);
    setConfirmar(false);
    const r = data as { ok: boolean; mensaje: string } | null;
    if (error || !r) return setAviso({ ok: false, texto: error?.message ?? "No se pudo completar." });
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Resumen */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Piezas de almacén", String(deAlmacen), ""],
          ["Faltan en almacén", String(faltantes.length), faltantes.length ? "text-red-500" : ""],
          ["Compra / renta / patrocinio", String(deFuera), ""],
          ["Consumo total", watts(totalW), ""],
        ].map(([t, v, c]) => (
          <div key={t} className="rounded-2xl border border-foreground/10 px-4 py-3">
            <p className={`text-2xl font-bold tabular-nums ${c}`}>{v}</p>
            <p className="text-sm text-muted">{t}</p>
          </div>
        ))}
      </section>

      {/* Acciones */}
      <section className="flex flex-wrap items-center gap-3">
        <a
          href={`/eventos/${props.eventoId}/maestro/excel`}
          className="flex h-11 items-center rounded-lg border border-foreground/15 px-5 font-medium hover:border-brand"
        >
          Exportar a Excel
        </a>
        {props.puedeCerrar && props.estado === "borrador" ? (
          confirmar ? (
            <span className="flex flex-wrap items-center gap-2 rounded-lg bg-foreground/5 px-3 py-2 text-sm">
              Se enviará a almacén una solicitud aprobada por cada zona/sección con equipo de almacén.
              <button
                type="button"
                disabled={ocupado}
                onClick={() => cambiarEstado("cerrar_maestro")}
                className="h-9 rounded-md bg-brand px-4 font-semibold text-white disabled:opacity-60"
              >
                Sí, cerrar
              </button>
              <button type="button" onClick={() => setConfirmar(false)} className="text-muted underline">
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmar(true)}
              className="h-11 rounded-lg bg-brand px-5 font-semibold text-white"
            >
              Cerrar y enviar a almacén
            </button>
          )
        ) : null}
        {props.puedeCerrar && props.estado === "cerrado" ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => cambiarEstado("reabrir_maestro")}
            className="h-11 rounded-lg border border-foreground/15 px-5 font-medium hover:border-brand disabled:opacity-60"
          >
            Reabrir para cambios
          </button>
        ) : null}
      </section>
      {aviso ? (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}>
          {aviso.texto}
        </p>
      ) : null}

      {/* Zonas */}
      {props.zonas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
          Primero crea las zonas en la pestaña &quot;Zonas y personal&quot;.
        </p>
      ) : null}
      {props.zonas.map((z) => {
        const deZona = props.renglones.filter((r) => r.zona_id === z.id);
        const piezas = deZona.reduce((s, r) => s + r.cantidad, 0);
        return (
          <section key={z.id} className="flex flex-col gap-3 rounded-2xl border border-foreground/10 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{z.nombre}</h2>
              <p className="text-sm text-muted">
                Líder de zona: <span className={z.lider ? "text-foreground" : "text-yellow-500"}>{z.lider?.nombre ?? "sin asignar"}</span>
                {" · "}
                {piezas} piezas
              </p>
            </div>
            <Lugar
              titulo={z.secciones.length > 0 ? "Zona general" : "Equipo de la zona"}
              lider={z.lider}
              liderTexto="Líder"
              staff={z.staff}
              zonaId={z.id}
              seccionId={null}
              renglones={deZona.filter((r) => !r.seccion_id)}
              inv={inv}
              articulos={articulos}
              editable={props.editable}
            />
            {z.secciones.map((s) => (
              <Lugar
                key={s.id}
                titulo={s.nombre}
                lider={s.lider ?? z.lider}
                liderTexto={s.lider ? "Líder de sección" : "Recibe (líder de zona)"}
                staff={s.staff}
                zonaId={z.id}
                seccionId={s.id}
                renglones={deZona.filter((r) => r.seccion_id === s.id)}
                inv={inv}
                articulos={articulos}
                editable={props.editable}
              />
            ))}
          </section>
        );
      })}

      {/* Balance de almacén */}
      {balance.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Balance de almacén</h2>
          <div className="overflow-x-auto rounded-xl border border-foreground/10">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-foreground/5 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Equipo</th>
                  <th className="px-3 py-2 text-right font-medium">En almacén</th>
                  <th className="px-3 py-2 text-right font-medium">Se asigna</th>
                  <th className="px-3 py-2 text-right font-medium">Queda</th>
                  <th className="px-3 py-2 text-right font-medium">De fuera</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {balance.map((b) => {
                  const queda = b.total === null ? null : b.total - b.asignado;
                  return (
                    <tr key={b.codigo + b.nombre}>
                      <td className="px-3 py-1.5 font-mono text-xs">{b.codigo}</td>
                      <td className="px-3 py-1.5">{b.nombre}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{b.total ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{b.asignado}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${queda !== null && queda < 0 ? "text-red-500" : ""}`}>
                        {queda === null ? "—" : queda < 0 ? `Faltan ${-queda}` : queda}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{b.fuera || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
