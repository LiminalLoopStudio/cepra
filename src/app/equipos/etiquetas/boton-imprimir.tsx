"use client";

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-11 rounded-lg bg-brand px-6 font-semibold text-white"
    >
      Imprimir
    </button>
  );
}
