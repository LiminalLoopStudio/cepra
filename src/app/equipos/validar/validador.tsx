"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScanInput } from "@/components/scan-input";
import { createClient } from "@/lib/supabase/client";
import { sonar, type Nivel } from "@/lib/feedback";

type Resultado = { nivel: Nivel; mensaje: string; hora: string };

const ESTILO: Record<Nivel, string> = {
  ok: "border-green-500 bg-green-500/15 text-green-500",
  advertencia: "border-yellow-500 bg-yellow-500/15 text-yellow-500",
  error: "border-red-500 bg-red-500/15 text-red-500",
};

const PUNTO: Record<Nivel, string> = {
  ok: "bg-green-500",
  advertencia: "bg-yellow-500",
  error: "bg-red-500",
};

export function Validador() {
  const router = useRouter();
  const [primero, setPrimero] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [historial, setHistorial] = useState<Resultado[]>([]);

  const ultimo = historial[0];

  async function onScan(codigo: string) {
    // Primer código: se guarda y se espera el segundo.
    if (!primero) {
      setPrimero(codigo);
      return;
    }
    // Lectura doble del mismo código (pasa con algunos escáneres): se ignora.
    if (codigo === primero) return;

    setProcesando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("validar_etiquetas", {
      p_codigo_a: primero,
      p_codigo_b: codigo,
    });
    setPrimero(null);
    setProcesando(false);

    const r: { nivel: Nivel; mensaje: string } = error
      ? { nivel: "error", mensaje: error.message }
      : (data as { nivel: Nivel; mensaje: string });

    sonar(r.nivel);
    setHistorial((h) =>
      [{ ...r, hora: new Date().toLocaleTimeString("es-MX") }, ...h].slice(0, 30),
    );
    // Actualiza la lista de "por validar" de la página.
    if (r.nivel === "ok") router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <ScanInput
        onScan={onScan}
        disabled={procesando}
        placeholder={primero ? "Ahora escanea la otra etiqueta…" : "Escanea equipo o caja…"}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`rounded-full px-3 py-1 font-mono ${
            primero ? "bg-brand/15 text-brand" : "bg-foreground/5 text-muted"
          }`}
        >
          1 · {primero ?? "—"}
        </span>
        <span className="rounded-full bg-foreground/5 px-3 py-1 font-mono text-muted">2 · —</span>
        {primero ? (
          <button
            type="button"
            onClick={() => setPrimero(null)}
            className="ml-auto text-sm text-muted underline"
          >
            Empezar de nuevo
          </button>
        ) : null}
      </div>

      {/* Mientras se espera la segunda etiqueta no se muestra el resultado
          anterior: así no parece que la nueva lectura falló. */}
      {primero ? (
        <div className="rounded-2xl border-2 border-brand bg-brand/10 p-6 text-center text-brand">
          <p className="text-xl font-bold">{primero} leído · ahora escanea la otra etiqueta</p>
        </div>
      ) : ultimo ? (
        <div
          role="status"
          aria-live="assertive"
          className={`rounded-2xl border-2 p-6 text-center ${ESTILO[ultimo.nivel]}`}
        >
          <p className="text-xl font-bold">{ultimo.mensaje}</p>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-foreground/15 p-6 text-center text-muted">
          Escanea la etiqueta del equipo y la de su caja, en cualquier orden.
        </div>
      )}

      {historial.length > (primero ? 0 : 1) ? (
        <ul className="flex flex-col gap-1 text-sm">
          {historial.slice(primero ? 0 : 1).map((r, i) => (
            <li key={i} className="flex gap-3 rounded-lg bg-foreground/5 px-3 py-2">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${PUNTO[r.nivel]}`} />
              <span className="flex-1">{r.mensaje}</span>
              <span className="text-muted tabular-nums">{r.hora}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
