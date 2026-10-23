import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { Devolucion } from "./devolucion";

export const metadata: Metadata = { title: "Recibir equipo" };

export default async function DevolucionesPage() {
  await requireUsuario(["administrador", "almacenista"]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Recibir equipo</h1>
          <p className="text-sm text-muted">
            Escanea las piezas que regresan (una tras otra), o la credencial de una persona para ver todo lo que
            tiene. Marca si regresaron control y cables; lo que no, queda como faltante.
          </p>
        </div>
        <Link href="/prestamos" className="text-sm text-brand hover:underline">
          Ver préstamos
        </Link>
      </div>
      <Devolucion />
    </main>
  );
}
