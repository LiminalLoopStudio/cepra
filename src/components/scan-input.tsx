"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/icono";

// La cámara se carga solo cuando se abre (la librería no se descarga antes).
const CamaraQR = dynamic(() => import("./camara-qr").then((m) => m.CamaraQR), { ssr: false });

type Props = {
  onScan: (codigo: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Entrada de códigos con tres formas de uso:
 *  - Escáner Bluetooth en modo teclado (HID): "escribe" el código y manda Enter.
 *    En computadora el campo recupera el foco solo, para escanear pieza tras pieza.
 *  - Cámara del teléfono: botón de cámara.
 *  - A mano: escribir el código + Enter.
 * En teléfonos el campo no se enfoca solo (si no, el teclado se abriría a cada rato).
 */
export function ScanInput({ onScan, placeholder = "Escanea un código…", disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [camara, setCamara] = useState(false);

  useEffect(() => {
    if (disabled || camara) return;
    // Pantalla táctil sin mouse = teléfono o tablet: no forzar el foco.
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const input = ref.current;
    input?.focus();

    // Recupera el foco si se pierde (por ejemplo, al hacer clic en otra parte),
    // salvo que el usuario esté escribiendo en otro campo.
    const reenfocar = () => {
      const activo = document.activeElement;
      const otroCampo =
        activo instanceof HTMLInputElement ||
        activo instanceof HTMLTextAreaElement ||
        activo instanceof HTMLSelectElement;
      if (!otroCampo || activo === input) input?.focus();
    };
    const intervalo = window.setInterval(reenfocar, 800);
    document.addEventListener("click", reenfocar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("click", reenfocar);
    };
  }, [disabled, camara]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          ref={ref}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Código escaneado"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const codigo = e.currentTarget.value.trim().toUpperCase();
            e.currentTarget.value = "";
            if (codigo) onScan(codigo);
            if (!window.matchMedia("(pointer: coarse)").matches) e.currentTarget.focus();
          }}
          className="h-14 min-w-0 flex-1 rounded-xl border-2 border-foreground/15 bg-background px-4 font-mono text-lg tracking-wider outline-none placeholder:font-sans placeholder:text-base placeholder:tracking-normal focus:border-brand disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setCamara((c) => !c)}
          aria-pressed={camara}
          aria-label={camara ? "Cerrar cámara" : "Escanear con la cámara"}
          title={camara ? "Cerrar cámara" : "Escanear con la cámara"}
          className={`flex h-14 shrink-0 items-center gap-2 rounded-xl border-2 px-4 font-medium ${
            camara ? "border-brand bg-brand text-white" : "border-foreground/15 hover:border-brand"
          }`}
        >
          <Icono nombre={camara ? "cerrar" : "camara"} className="size-6" />
          <span className="hidden sm:inline">{camara ? "Cerrar" : "Cámara"}</span>
        </button>
      </div>
      {camara ? <CamaraQR onCodigo={onScan} pausada={disabled} /> : null}
    </div>
  );
}
