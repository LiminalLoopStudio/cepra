import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { requireUsuario, ROL_ETIQUETA } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PinForm } from "./pin-form";

export const metadata: Metadata = { title: "Mi credencial" };

export default async function MiCredencialPage() {
  const usuario = await requireUsuario();

  const supabase = await createClient();
  const { data } = await supabase.rpc("mi_firma");
  const firma = data as { credencial: string; tiene_pin: boolean; bloqueado_hasta: string | null } | null;

  const qr = firma
    ? await QRCode.toString(firma.credencial, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Inicio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Mi credencial y PIN</h1>
        <p className="text-sm text-muted">
          En el almacén escanean tu credencial para saber quién recibe el equipo, y tú firmas con tu PIN.
        </p>
      </div>

      <section className="flex flex-col items-center gap-3 rounded-2xl border border-foreground/10 p-6 text-center">
        {qr ? (
          <div
            className="size-56 rounded-xl bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        ) : (
          <p className="text-sm text-red-500">No se encontró tu credencial. Avisa al administrador.</p>
        )}
        <p className="text-lg font-semibold">{usuario.nombre}</p>
        <p className="text-sm text-muted">{ROL_ETIQUETA[usuario.rolReal]}</p>
        {firma ? <p className="font-mono text-sm">{firma.credencial}</p> : null}
        <p className="max-w-sm text-xs text-muted">
          Puedes mostrar esta pantalla en el almacén o pedir tu credencial impresa. Si la pierdes, el
          administrador te genera una nueva y la anterior deja de servir.
        </p>
      </section>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-1 font-semibold">{firma?.tiene_pin ? "Cambiar mi PIN" : "Crea tu PIN"}</h2>
        <p className="mb-4 text-sm text-muted">
          {firma?.tiene_pin
            ? "Tu PIN está configurado. Para cambiarlo escribe el actual."
            : "Sin PIN no puedes recibir equipo. Usa de 4 a 6 números que no sean fáciles (nada de 1111 o 1234)."}
        </p>
        {firma?.bloqueado_hasta ? (
          <p role="alert" className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">
            Tu PIN está bloqueado por intentos fallidos hasta las{" "}
            {new Date(firma.bloqueado_hasta).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", timeStyle: "short" })}.
            Si lo olvidaste, pide al administrador que lo restablezca.
          </p>
        ) : null}
        <PinForm tienePin={Boolean(firma?.tiene_pin)} />
      </section>
    </main>
  );
}
