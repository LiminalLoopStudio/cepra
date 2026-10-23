"use client";

import { useState } from "react";
import { ScanInput } from "@/components/scan-input";
import { sonar } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/client";

// Un renglón por recibir.
type Linea = {
  itemId: string;
  etiqueta: string | null; // null = artículo por cantidad
  articulo: string;
  receptor: string;
  folio: number;
  modo: "pieza" | "accesorios" | "cantidad";
  conControl: boolean; // la pieza salió con control (o: falta el control, en modo accesorios)
  conCables: boolean;
  control: boolean; // ¿regresó?
  cables: boolean;
  falla: boolean;
  pendiente: number; // por cantidad: cuántos faltan por regresar
  cantidad: number; // por cantidad: cuántos regresan ahora
};

type Aviso = { nivel: "ok" | "advertencia" | "error"; texto: string };

const ESTILO = {
  ok: "border-green-500 bg-green-500/15 text-green-500",
  advertencia: "border-yellow-500 bg-yellow-500/15 text-yellow-500",
  error: "border-red-500 bg-red-500/15 text-red-500",
};

type Encontrado = {
  encontrado: boolean;
  mensaje?: string;
  item_id: string;
  estado: "prestado" | "faltante";
  etiqueta: string;
  articulo: string;
  receptor: string;
  folio: number;
  con_control: boolean;
  con_cables: boolean;
  falta_control: boolean;
  falta_cables: boolean;
  accesorio: "control" | "cables" | null;
};

export function Devolucion() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [notas, setNotas] = useState("");
  const [confirmarFaltantes, setConfirmarFaltantes] = useState(false);

  function avisar(a: Aviso) {
    sonar(a.nivel);
    setAviso(a);
  }

  function cambiar(itemId: string, cambios: Partial<Linea>) {
    setConfirmarFaltantes(false);
    setLineas((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, ...cambios } : l)));
  }

  function lineaDe(r: Encontrado): Linea {
    const accesorios = r.estado === "faltante";
    return {
      itemId: r.item_id,
      etiqueta: r.etiqueta,
      articulo: r.articulo,
      receptor: r.receptor,
      folio: r.folio,
      modo: accesorios ? "accesorios" : "pieza",
      conControl: accesorios ? r.falta_control : r.con_control,
      conCables: accesorios ? r.falta_cables : r.con_cables,
      control: r.accesorio === "control",
      cables: r.accesorio === "cables",
      falla: false,
      pendiente: 1,
      cantidad: 1,
    };
  }

  async function onScan(codigo: string) {
    const supabase = createClient();
    setConfirmarFaltantes(false);

    // Credencial: carga todo lo que la persona tiene pendiente.
    if (codigo.startsWith("GPU-")) {
      setOcupado(true);
      const { data: p, error } = await supabase.rpc("buscar_por_credencial", { p_codigo: codigo });
      const persona = p as { encontrado: boolean; id: string; nombre: string; mensaje?: string } | null;
      if (error || !persona?.encontrado) {
        setOcupado(false);
        return avisar({ nivel: "error", texto: persona?.mensaje ?? error?.message ?? "Credencial no reconocida." });
      }
      const { data: items } = await supabase
        .from("v_prestamo_items")
        .select("id, folio, estado, cantidad, pendiente, con_control, con_cables, falta_control, falta_cables, equipo:equipos(etiqueta), articulo:catalogo_articulos(nombre)")
        .eq("receptor_id", persona.id)
        .neq("estado", "devuelto")
        .order("entregado_at");
      setOcupado(false);
      const filas = (items ?? []) as unknown as {
        id: string;
        folio: number;
        estado: "prestado" | "faltante";
        cantidad: number;
        pendiente: number;
        con_control: boolean;
        con_cables: boolean;
        falta_control: boolean;
        falta_cables: boolean;
        equipo: { etiqueta: string } | null;
        articulo: { nombre: string } | null;
      }[];
      if (filas.length === 0) return avisar({ nivel: "advertencia", texto: `${persona.nombre} no tiene nada pendiente.` });
      setLineas((ls) => {
        const nuevas = filas
          .filter((f) => !ls.some((l) => l.itemId === f.id))
          .map((f): Linea =>
            f.equipo
              ? lineaDe({
                  encontrado: true,
                  item_id: f.id,
                  estado: f.estado,
                  etiqueta: f.equipo.etiqueta,
                  articulo: f.articulo?.nombre ?? "",
                  receptor: persona.nombre,
                  folio: f.folio,
                  con_control: f.con_control,
                  con_cables: f.con_cables,
                  falta_control: f.falta_control,
                  falta_cables: f.falta_cables,
                  accesorio: null,
                })
              : {
                  itemId: f.id,
                  etiqueta: null,
                  articulo: f.articulo?.nombre ?? "",
                  receptor: persona.nombre,
                  folio: f.folio,
                  modo: "cantidad",
                  conControl: false,
                  conCables: false,
                  control: false,
                  cables: false,
                  falla: false,
                  pendiente: f.pendiente,
                  cantidad: f.pendiente,
                },
          );
        return [...ls, ...nuevas];
      });
      return avisar({ nivel: "ok", texto: `${filas.length} pendientes de ${persona.nombre} cargados. Revisa cada uno.` });
    }

    // Etiqueta de pieza, caja, control o cables
    setOcupado(true);
    const { data, error } = await supabase.rpc("buscar_para_devolucion", { p_codigo: codigo });
    setOcupado(false);
    const r = data as Encontrado | null;
    if (error || !r) return avisar({ nivel: "error", texto: error?.message ?? "No se pudo buscar." });
    if (!r.encontrado) return avisar({ nivel: "error", texto: r.mensaje ?? "No encontrado." });

    const ya = lineas.find((l) => l.itemId === r.item_id);
    if (ya) {
      if (r.accesorio && (r.accesorio === "control" ? ya.conControl : ya.conCables)) {
        cambiar(r.item_id, { [r.accesorio]: true });
        return avisar({ nivel: "ok", texto: `${r.accesorio === "control" ? "Control" : "Cables"} de ${r.etiqueta} recibidos.` });
      }
      return avisar({ nivel: "advertencia", texto: `${r.etiqueta} ya está en la lista.` });
    }
    setLineas((ls) => [...ls, lineaDe(r)]);
    avisar({
      nivel: "ok",
      texto:
        r.estado === "faltante"
          ? `${r.etiqueta}: llegan accesorios que faltaban (préstamo ${r.folio}).`
          : `${r.etiqueta} de ${r.receptor} (préstamo ${r.folio}).${r.con_control || r.con_cables ? " Revisa control y cables." : ""}`,
    });
  }

  const faltantes = lineas.filter(
    (l) => l.modo === "pieza" && ((l.conControl && !l.control) || (l.conCables && !l.cables)),
  );

  async function recibir() {
    if (faltantes.length > 0 && !confirmarFaltantes) {
      setConfirmarFaltantes(true);
      sonar("advertencia");
      return;
    }
    setOcupado(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("registrar_devolucion", {
      p_items: lineas
        .filter((l) =>
          l.modo === "cantidad" ? l.cantidad > 0 : l.modo === "accesorios" ? l.control || l.cables : true,
        )
        .map((l) => ({ item_id: l.itemId, control: l.control, cables: l.cables, falla: l.falla, cantidad: l.cantidad })),
      p_notas: notas || null,
    });
    setOcupado(false);
    setConfirmarFaltantes(false);
    const r = data as { ok: boolean; mensaje: string; faltantes: number } | null;
    if (error || !r) return avisar({ nivel: "error", texto: error?.message ?? "No se pudo registrar." });
    if (!r.ok) return avisar({ nivel: "error", texto: r.mensaje });
    avisar({ nivel: r.faltantes > 0 ? "advertencia" : "ok", texto: r.mensaje });
    setLineas([]);
    setNotas("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <ScanInput onScan={onScan} disabled={ocupado} placeholder="Escanea pieza, control, cables o credencial…" />

        {aviso ? (
          <div role="status" aria-live="assertive" className={`rounded-2xl border-2 p-4 text-center font-semibold ${ESTILO[aviso.nivel]}`}>
            {aviso.texto}
          </div>
        ) : null}

        <section className="rounded-2xl border border-foreground/10 p-4">
          <h2 className="mb-2 font-semibold">Por recibir ({lineas.length})</h2>
          {lineas.length === 0 ? (
            <p className="text-sm text-muted">Nada todavía.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-foreground/10 text-sm">
              {lineas.map((l) => {
                const falta = l.modo === "pieza" && ((l.conControl && !l.control) || (l.conCables && !l.cables));
                return (
                  <li key={l.itemId} className={`flex flex-col gap-2 py-3 ${falta ? "bg-yellow-500/5" : ""}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>
                        {l.etiqueta ? <span className="font-mono font-semibold">{l.etiqueta}</span> : null}
                        <span className="ml-2">{l.articulo}</span>
                        <span className="ml-2 text-xs text-muted">
                          {l.receptor} · préstamo {l.folio}
                          {l.modo === "accesorios" ? " · solo accesorios faltantes" : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setLineas((ls) => ls.filter((x) => x.itemId !== l.itemId))}
                        className="text-xs text-muted underline hover:text-red-500"
                      >
                        Quitar
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      {l.modo === "cantidad" ? (
                        <label className="flex items-center gap-2">
                          Regresan
                          <input
                            type="number"
                            min={0}
                            max={l.pendiente}
                            value={l.cantidad}
                            onChange={(e) =>
                              cambiar(l.itemId, { cantidad: Math.max(0, Math.min(l.pendiente, Number(e.target.value) || 0)) })
                            }
                            className="h-9 w-20 rounded-lg border border-foreground/15 bg-background px-2"
                          />
                          de {l.pendiente}
                        </label>
                      ) : (
                        <>
                          {l.conControl ? (
                            <label className="flex items-center gap-1.5">
                              <input type="checkbox" checked={l.control} onChange={(e) => cambiar(l.itemId, { control: e.target.checked })} />
                              regresó el control
                            </label>
                          ) : null}
                          {l.conCables ? (
                            <label className="flex items-center gap-1.5">
                              <input type="checkbox" checked={l.cables} onChange={(e) => cambiar(l.itemId, { cables: e.target.checked })} />
                              regresaron los cables
                            </label>
                          ) : null}
                          {l.modo === "pieza" ? (
                            <label className="flex items-center gap-1.5 text-red-500">
                              <input type="checkbox" checked={l.falla} onChange={(e) => cambiar(l.itemId, { falla: e.target.checked })} />
                              viene con falla
                            </label>
                          ) : null}
                          {l.modo === "pieza" && (l.conControl || l.conCables) ? (
                            <button
                              type="button"
                              onClick={() => cambiar(l.itemId, { control: l.conControl, cables: l.conCables })}
                              className="text-xs text-brand underline"
                            >
                              todo completo
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-3 self-start rounded-2xl border border-foreground/10 p-4 lg:sticky lg:top-4">
        <h2 className="font-semibold">Recibir</h2>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Notas (opcional): qué falla tiene, quién lo trajo…"
          rows={3}
          className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
        />
        {confirmarFaltantes ? (
          <p role="alert" className="rounded-lg bg-yellow-500/15 px-3 py-2 text-sm text-yellow-500">
            {faltantes.length} {faltantes.length === 1 ? "pieza llega" : "piezas llegan"} sin control o cables:{" "}
            {faltantes.map((f) => f.etiqueta).join(", ")}. Quedarán como faltantes. Presiona otra vez para confirmar.
          </p>
        ) : null}
        <button
          type="button"
          onClick={recibir}
          disabled={lineas.length === 0 || ocupado}
          className="h-12 rounded-lg bg-brand font-semibold text-white disabled:opacity-50"
        >
          {ocupado ? "Registrando…" : confirmarFaltantes ? "Confirmar con faltantes" : `Recibir ${lineas.length || ""}`}
        </button>
      </aside>
    </div>
  );
}
