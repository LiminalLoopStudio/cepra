import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { BotonImprimir } from "@/app/equipos/etiquetas/boton-imprimir";
import { requireUsuario, ROL_ETIQUETA, type Rol } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Imprimir credenciales" };

type Tarjeta = { id: string; nombre: string; rol: string; credencial: string; svg: string };

// Hoja carta tipo Avery 5371: 10 credenciales de 3.5" × 2" (2 × 5).
// ?id=… (una o varias) imprime esas; sin id, todas las personas activas.
export default async function CredencialesPage({ searchParams }: PageProps<"/usuarios/credenciales">) {
  await requireUsuario(["administrador"]);
  const params = await searchParams;
  const ids = ([] as string[]).concat(params.id ?? []).filter(Boolean);

  // Las credenciales no se leen desde la app normal: cliente admin (ya se
  // verificó arriba que quien pide es administrador).
  const admin = createAdminClient();
  let consulta = admin
    .from("usuarios")
    .select("id, nombre, rol, activo, firma:usuario_firma(credencial)")
    .eq("activo", true)
    .order("nombre");
  if (ids.length > 0) consulta = consulta.in("id", ids);
  const { data, error } = await consulta;

  const filas = (data ?? []) as unknown as {
    id: string;
    nombre: string;
    rol: string;
    firma: { credencial: string } | { credencial: string }[] | null;
  }[];

  const tarjetas: Tarjeta[] = [];
  for (const u of filas) {
    const firma = Array.isArray(u.firma) ? u.firma[0] : u.firma;
    if (!firma?.credencial) continue;
    const svg = await QRCode.toString(firma.credencial, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    tarjetas.push({ id: u.id, nombre: u.nombre, rol: u.rol, credencial: firma.credencial, svg });
  }
  const hojas = Math.ceil(tarjetas.length / 10);

  return (
    <main>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-6 print:hidden">
        <div>
          <Link href="/usuarios" className="text-sm text-muted hover:text-foreground">
            ← Usuarios
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Imprimir credenciales</h1>
          <p className="text-sm text-muted">
            {tarjetas.length} {tarjetas.length === 1 ? "credencial" : "credenciales"} · {hojas}{" "}
            {hojas === 1 ? "hoja" : "hojas"} carta tipo Avery 5371 (tarjeta de presentación 3.5&quot; × 2&quot;)
          </p>
          <p className="mt-1 text-xs text-muted">
            Al imprimir: tamaño Carta, márgenes predeterminados, escala 100 %. También sirven en hoja normal
            para recortar y enmicar.
          </p>
          {error ? <p className="mt-2 text-sm text-red-500">No se pudieron cargar: {error.message}</p> : null}
        </div>
        {tarjetas.length > 0 ? <BotonImprimir /> : null}
      </div>

      <div className="hoja-credenciales">
        {tarjetas.map((t) => (
          <div key={t.id} className="credencial">
            <div className="credencial-qr" dangerouslySetInnerHTML={{ __html: t.svg }} />
            <div className="credencial-texto">
              <span className="credencial-marca">GAMING PARTNERS · CEPRA</span>
              <span className="credencial-nombre">{t.nombre}</span>
              <span className="credencial-rol">{ROL_ETIQUETA[t.rol as Rol] ?? t.rol}</span>
              <span className="credencial-codigo">{t.credencial}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
