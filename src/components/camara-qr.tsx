"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onCodigo: (codigo: string) => void;
  pausada?: boolean; // mientras se procesa un código, no se leen otros
};

/**
 * Lee códigos QR con la cámara del teléfono (o de la laptop).
 * Usa la cámara trasera cuando existe. Funciona solo en https (o localhost).
 * Un mismo código no se repite antes de 2.5 s: así no se registra dos veces
 * mientras sigue frente a la cámara.
 */
export function CamaraQR({ onCodigo, pausada }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const ultimo = useRef<{ codigo: string; at: number }>({ codigo: "", at: 0 });
  const callback = useRef(onCodigo);
  const pausa = useRef(pausada);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState(false);

  callback.current = onCodigo;
  pausa.current = pausada;

  useEffect(() => {
    let detener: (() => void) | null = null;
    let cancelado = false;

    (async () => {
      if (!window.isSecureContext) {
        setError("La cámara solo funciona con https. Abre CEPRA desde su dirección segura.");
        return;
      }
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelado || !video.current) return;
      if (!(await QrScanner.hasCamera())) {
        setError("No se encontró una cámara en este dispositivo.");
        return;
      }
      const scanner = new QrScanner(
        video.current,
        (resultado) => {
          const codigo = resultado.data.trim().toUpperCase();
          const ahora = Date.now();
          if (!codigo || pausa.current) return;
          if (codigo === ultimo.current.codigo && ahora - ultimo.current.at < 2500) return;
          ultimo.current = { codigo, at: ahora };
          navigator.vibrate?.(40);
          callback.current(codigo);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8 },
      );
      try {
        await scanner.start();
        if (cancelado) {
          scanner.destroy();
          return;
        }
        setLista(true);
        detener = () => scanner.destroy();
      } catch {
        scanner.destroy();
        setError("No se pudo abrir la cámara. Revisa que el navegador tenga permiso de usarla.");
      }
    })();

    return () => {
      cancelado = true;
      detener?.();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video ref={video} muted playsInline className="aspect-square w-full object-cover" />
        {!lista && !error ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Abriendo cámara…</p>
        ) : null}
        {pausada ? (
          <p className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs text-white">Procesando…</p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted">Apunta al código QR; se lee solo.</p>
      )}
    </div>
  );
}
