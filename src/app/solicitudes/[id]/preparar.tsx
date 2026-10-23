"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScanInput } from "@/components/scan-input";
import { sonar } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/client";

export type RenglonPreparar = {
  item_id: string;
  articulo_id: string;
  nombre: string;
  serializado: boolean;
  cantidad: number;
  disponibles: number; // solo artículos por cantidad
};

type Aviso = { nivel: "ok" | "advertencia" | "error"; texto: string };

const ESTILO = {
  ok: "border-green-500 bg-green-500/15 text-green-500",
  advertencia: "border-yellow-500 bg-yellow-500/15 text-yellow-500",
  error: "border-red-500 bg-red-500/15 text-red-500",
};

// Almacén aparta lo pedido: escanea las piezas y confirma las cantidades.
export function Preparar({ solicitudId, renglones }: { solicitudId: string; renglones: RenglonPreparar[] }) {
  const router = useRouter();
  const piezasPedidas = renglones.filter((r) => r.serializado);
  const porCantidad = renglones.filter((r) => !r.serializado);

  const [piezas, setPiezas] = useState<{ etiqueta: string; articulo_id: string }[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, string>>(
    Object.fromEntries(porCantidad.map((r) => [r.item_id, String(Math.min(r.cantidad, Math.max(r.disponibles, 0)))])),
  );
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function avisar(a: Aviso) {
    sonar(a.nivel);
    setAviso(a);
  }

  async function onScan(codigo: string) {
    const base = codigo.replace(/-(CTRL|CBL|C)$/, "");
    if (piezas.some((p) => p.etiqueta === base)) return avisar({ nivel: "advertencia", texto: `${base} ya está apartado aquí.` });

    setOcupado(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("equipos")
      .select("etiqueta, articulo_id, estado_operativo")
      .eq("etiqueta", base)
      .maybeSingle();
    setOcupado(false);
    if (error) return avisar({ nivel: "error", texto: error.message });
    if (!data) return avisar({ nivel: "error", texto: `Etiqueta no reconocida: ${codigo}` });

    const renglon = piezasPedidas.find((r) => r.articulo_id === data.articulo_id);
    if (!renglon) return avisar({ nivel: "error", texto: `${base} no es de un tipo que se pidió.` });
    if (data.estado_operativo !== "disponible") {
      return avisar({ nivel: "error", texto: `${base} no está disponible (${String(data.estado_operativo).replace("_", " ")}).` });
    }
    const llevadas = piezas.filter((p) => p.articulo_id === data.articulo_id).length;
    if (llevadas >= renglon.cantidad) {
      return avisar({ nivel: "advertencia", texto: `Ya tienes las ${renglon.cantidad} de ${renglon.nombre} que se pidieron.` });
    }
    setPiezas((ps) => [...ps, { etiqueta: base, articulo_id: data.articulo_id }]);
    avisar({ nivel: "ok", texto: `${base} apartado (${llevadas + 1} de ${renglon.cantidad}).` });
  }

  async function confirmar() {
    setOcupado(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("preparar_solicitud", {
      p_solicitud: solicitudId,
      p_piezas: piezas.map((p) => p.etiqueta),
      p_cantidades: porCantidad.map((r) => ({ item_id: r.item_id, cantidad: Number(cantidades[r.item_id] || 0) })),
    });
    setOcupado(false);
    const r = data as { ok: boolean; mensaje: string } | null;
    if (error || !r) return avisar({ nivel: "error", texto: error?.message ?? "No se pudo preparar." });
    avisar({ nivel: r.ok ? "ok" : "error", texto: r.mensaje });
    if (r.ok) router.refresh();
  }

  const faltan = piezasPedidas.reduce(
    (s, r) => s + r.cantidad - piezas.filter((p) => p.articulo_id === r.articulo_id).length,
    0,
  );

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-brand/40 p-5">
      <div>
        <h2 className="font-semibold">Preparar (almacén)</h2>
        <p className="text-sm text-muted">
          Escanea las piezas que vas a apartar y confirma las cantidades. Lo apartado ya no se puede prestar a nadie más.
        </p>
      </div>

      {piezasPedidas.length > 0 ? (
        <>
          <ScanInput onScan={onScan} disabled={ocupado} placeholder="Escanea las piezas…" />
          <ul className="flex flex-col divide-y divide-foreground/10 text-sm">
            {piezasPedidas.map((r) => {
              const mias = piezas.filter((p) => p.articulo_id === r.articulo_id);
              return (
                <li key={r.item_id} className="flex flex-col gap-1 py-2">
                  <span className="flex justify-between gap-3">
                    <span className="font-medium">{r.nombre}</span>
                    <span className={mias.length === r.cantidad ? "text-green-500" : "text-muted"}>
                      {mias.length} de {r.cantidad}
                    </span>
                  </span>
                  {mias.length > 0 ? (
                    <span className="flex flex-wrap gap-2">
                      {mias.map((p) => (
                        <button
                          key={p.etiqueta}
                          type="button"
                          onClick={() => setPiezas((ps) => ps.filter((x) => x.etiqueta !== p.etiqueta))}
                          title="Quitar"
                          className="rounded-full bg-foreground/5 px-2.5 py-0.5 font-mono text-xs hover:bg-red-500/15 hover:text-red-500"
                        >
                          {p.etiqueta} ×
                        </button>
                      ))}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {porCantidad.length > 0 ? (
        <ul className="flex flex-col divide-y divide-foreground/10 text-sm">
          {porCantidad.map((r) => (
            <li key={r.item_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                <span className="font-medium">{r.nombre}</span>
                <span className="block text-xs text-muted">
                  Pidieron {r.cantidad} · hay {r.disponibles} disponibles
                </span>
              </span>
              <input
                type="number"
                min={0}
                max={r.cantidad}
                inputMode="numeric"
                value={cantidades[r.item_id] ?? "0"}
                onChange={(e) => setCantidades((c) => ({ ...c, [r.item_id]: e.target.value }))}
                className="h-10 w-20 rounded-lg border border-foreground/15 bg-background px-2 text-center"
                aria-label={`Cantidad a apartar de ${r.nombre}`}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {aviso ? (
        <div role="status" aria-live="assertive" className={`rounded-xl border-2 p-3 text-center text-sm font-semibold ${ESTILO[aviso.nivel]}`}>
          {aviso.texto}
        </div>
      ) : null}

      <button
        type="button"
        onClick={confirmar}
        disabled={ocupado}
        className="h-12 rounded-lg bg-brand font-semibold text-white disabled:opacity-60 sm:self-start sm:px-8"
      >
        {ocupado ? "Guardando…" : faltan > 0 ? `Marcar lista (faltan ${faltan} piezas)` : "Marcar lista para recoger"}
      </button>
    </section>
  );
}
