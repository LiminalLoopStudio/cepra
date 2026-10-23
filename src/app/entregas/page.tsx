import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Entrega, type ArticuloCantidad } from "./entrega";

export const metadata: Metadata = { title: "Entregar equipo" };

export default async function EntregasPage() {
  await requireUsuario(["administrador", "almacenista"]);

  const supabase = await createClient();
  const [{ data: evento }, { data: stock }] = await Promise.all([
    supabase.from("eventos").select("id, nombre").eq("estado", "activo").maybeSingle(),
    supabase
      .from("v_stock_cantidad")
      .select("articulo_id, codigo_tipo, nombre, disponible")
      .eq("activo", true)
      .order("nombre"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Entregar equipo</h1>
          <p className="text-sm text-muted">
            1. Escanea la credencial de quien recibe · 2. Escanea las piezas · 3. La persona firma con su PIN.
          </p>
        </div>
        <Link href="/prestamos" className="text-sm text-brand hover:underline">
          Ver préstamos
        </Link>
      </div>

      {evento ? (
        <Entrega evento={evento.nombre} stock={(stock ?? []) as ArticuloCantidad[]} />
      ) : (
        <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center text-sm text-yellow-500">
          No hay un evento activo. Activa el evento en{" "}
          <Link href="/eventos" className="underline">
            Eventos
          </Link>{" "}
          para poder entregar equipo.
        </p>
      )}
    </main>
  );
}
