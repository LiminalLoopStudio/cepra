"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SolicitudForm, type ArticuloOpcion } from "../formulario";

type Respuesta = { ok: boolean; mensaje: string } | null;

const botonPrincipal = "h-11 rounded-lg bg-brand px-5 font-semibold text-white disabled:opacity-60";
const botonSecundario =
  "h-11 rounded-lg border border-foreground/15 px-5 font-medium hover:border-brand disabled:opacity-60";
const botonPeligro =
  "h-11 rounded-lg border border-red-500/40 px-5 font-medium text-red-500 hover:border-red-500 disabled:opacity-60";

export function Acciones(props: {
  solicitudId: string;
  puedeAprobar: boolean;
  puedeAjustar: boolean;
  puedeCancelar: boolean;
  puedeDeshacer: boolean;
  articulos: ArticuloOpcion[];
  inicial: { lineas: { articulo_id: string; cantidad: number }[]; necesita_para: string | null; notas: string | null };
}) {
  const router = useRouter();
  const [ajustando, setAjustando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function llamar(fn: string, args: Record<string, unknown>) {
    setOcupado(true);
    setAviso(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc(fn, args);
    setOcupado(false);
    const r = data as Respuesta;
    if (error || !r) return setAviso({ ok: false, texto: error?.message ?? "No se pudo completar." });
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) {
      setRechazando(false);
      setCancelando(false);
      setMotivo("");
      router.refresh();
    }
  }

  const nada = !props.puedeAprobar && !props.puedeAjustar && !props.puedeCancelar && !props.puedeDeshacer;
  if (nada && !aviso) return null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-foreground/10 p-5">
      {aviso ? (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}
        >
          {aviso.texto}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {props.puedeAprobar ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => llamar("aprobar_solicitud", { p_solicitud: props.solicitudId })}
            className={botonPrincipal}
          >
            Aprobar
          </button>
        ) : null}
        {props.puedeAjustar ? (
          <button type="button" onClick={() => setAjustando((v) => !v)} className={botonSecundario}>
            {ajustando ? "Cerrar ajuste" : "Ajustar"}
          </button>
        ) : null}
        {props.puedeAprobar ? (
          <button type="button" onClick={() => setRechazando((v) => !v)} className={botonPeligro}>
            Rechazar
          </button>
        ) : null}
        {props.puedeDeshacer ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => llamar("deshacer_preparacion", { p_solicitud: props.solicitudId })}
            className={botonSecundario}
          >
            Deshacer preparación
          </button>
        ) : null}
        {props.puedeCancelar ? (
          <button type="button" onClick={() => setCancelando((v) => !v)} className={botonPeligro}>
            Cancelar solicitud
          </button>
        ) : null}
      </div>

      {rechazando || cancelando ? (
        <div className="flex flex-col gap-2 rounded-xl bg-foreground/5 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              {rechazando ? "¿Por qué se rechaza?" : "Motivo de la cancelación (opcional)"}
            </span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={rechazando ? "Ya tienes suficientes pantallas en la zona…" : ""}
              className="h-11 rounded-lg border border-foreground/15 bg-background px-3"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ocupado || (rechazando && !motivo.trim())}
              onClick={() =>
                rechazando
                  ? llamar("rechazar_solicitud", { p_solicitud: props.solicitudId, p_motivo: motivo })
                  : llamar("cancelar_solicitud", { p_solicitud: props.solicitudId, p_motivo: motivo || null })
              }
              className={botonPeligro}
            >
              {rechazando ? "Confirmar rechazo" : "Confirmar cancelación"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRechazando(false);
                setCancelando(false);
              }}
              className="text-sm text-muted underline"
            >
              No
            </button>
          </div>
        </div>
      ) : null}

      {ajustando ? (
        <div className="border-t border-foreground/10 pt-4">
          <SolicitudForm
            modo="ajustar"
            solicitudId={props.solicitudId}
            articulos={props.articulos}
            inicial={props.inicial}
            alGuardar={() => {
              setAjustando(false);
              setAviso({ ok: true, texto: "Cambios guardados." });
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
