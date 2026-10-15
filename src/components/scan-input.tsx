"use client";

import { useEffect, useRef } from "react";

type Props = {
  onScan: (codigo: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Campo para escáner Bluetooth en modo teclado (HID): el escáner "escribe"
 * el código y manda Enter. Al recibir Enter procesa, se limpia y vuelve a
 * enfocarse solo, para escanear pieza tras pieza sin tocar la pantalla.
 * También sirve escribiendo el código a mano + Enter.
 */
export function ScanInput({ onScan, placeholder = "Escanea un código…", disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (disabled) return;
    const input = ref.current;
    input?.focus();

    // Recupera el foco si se pierde (por ejemplo, al tocar otra parte de la pantalla),
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
  }, [disabled]);

  return (
    <input
      ref={ref}
      type="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="characters"
      spellCheck={false}
      disabled={disabled}
      placeholder={placeholder}
      aria-label="Código escaneado"
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const codigo = e.currentTarget.value.trim().toUpperCase();
        e.currentTarget.value = "";
        if (codigo) onScan(codigo);
        e.currentTarget.focus();
      }}
      className="h-14 w-full rounded-xl border-2 border-foreground/15 bg-background px-4 font-mono text-lg tracking-wider outline-none focus:border-brand disabled:opacity-60"
    />
  );
}
