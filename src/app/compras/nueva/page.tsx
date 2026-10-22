import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CompraForm } from "../formularios";
import { opcionesCompra } from "../opciones";

export const metadata: Metadata = { title: "Nueva compra" };

export default async function NuevaCompraPage() {
  await requireUsuario(["administrador", "lider"]);
  const { cuentas, eventos } = await opcionesCompra();

  // Por omisión: hoy y el evento activo.
  const supabase = await createClient();
  const { data: activo } = await supabase.from("eventos").select("id").eq("estado", "activo").maybeSingle();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/compras" className="text-sm text-muted hover:text-foreground">
          ← Compras
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Nueva compra</h1>
      </div>
      <section className="rounded-2xl border border-foreground/10 p-5">
        <CompraForm
          modo="crear"
          cuentas={cuentas}
          eventos={eventos}
          inicial={{
            fecha: hoy,
            concepto: "",
            categoria: "Suscripción",
            proveedor: "",
            cuenta_id: "",
            evento_id: activo?.id ?? "",
            monto: "",
            moneda: "MXN",
            metodo_pago: "",
            tarjeta_ultimos4: "",
            folio_pedido: "",
            vigencia_hasta: "",
            estado_factura: "pendiente",
            folio_factura: "",
            notas: "",
          }}
        />
      </section>
    </main>
  );
}
