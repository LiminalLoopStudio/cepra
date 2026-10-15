import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BotonImprimir } from "./boton-imprimir";

export const metadata: Metadata = { title: "Imprimir etiquetas" };

type Pieza = {
  id: string;
  etiqueta: string;
  etiqueta_caja: string;
  articulo: { nombre: string } | null;
};

type Etiqueta = {
  codigo: string;
  nombre: string;
  esCaja: boolean;
  svg: string;
};

// Hoja carta tipo Avery 5160: 3 columnas × 10 filas = 30 etiquetas de 2.625" × 1".
// Por cada pieza se imprimen 2 etiquetas seguidas: equipo y caja.
export default async function EtiquetasPage({
  searchParams,
}: PageProps<"/equipos/etiquetas">) {
  await requireUsuario(["administrador", "almacenista"]);
  const params = await searchParams;

  const ids = ([] as string[]).concat(params.id ?? []).filter(Boolean);
  const estado = typeof params.estado === "string" ? params.estado : undefined;

  const supabase = await createClient();
  let consulta = supabase
    .from("equipos")
    .select("id, etiqueta, etiqueta_caja, articulo:catalogo_articulos(nombre)")
    .order("etiqueta");

  if (ids.length > 0) consulta = consulta.in("id", ids);
  else if (estado) consulta = consulta.eq("estado_operativo", estado);
  else consulta = consulta.eq("estado_operativo", "por_validar");

  const { data } = await consulta;
  const piezas = (data ?? []) as unknown as Pieza[];

  // El QR contiene solo el código (lo que "escribe" el escáner al leerlo).
  const etiquetas: Etiqueta[] = [];
  for (const p of piezas) {
    const nombre = p.articulo?.nombre ?? "";
    for (const [codigo, esCaja] of [
      [p.etiqueta, false],
      [p.etiqueta_caja, true],
    ] as const) {
      const svg = await QRCode.toString(codigo, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
      });
      etiquetas.push({ codigo, nombre, esCaja, svg });
    }
  }

  const hojas = Math.ceil(etiquetas.length / 30);

  return (
    <main className="etiquetas-impresion">
      {/* Barra de controles: no se imprime */}
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-6 print:hidden">
        <div>
          <Link
            href="/equipos"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Equipos
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Imprimir etiquetas</h1>
          <p className="text-sm text-muted">
            {piezas.length} piezas · {etiquetas.length} etiquetas (equipo +
            caja) · {hojas} {hojas === 1 ? "hoja" : "hojas"} carta tipo Avery
            5160
          </p>
          <p className="mt-1 text-xs text-muted">
            Al imprimir: tamaño Carta, márgenes &quot;Ninguno&quot;, escala
            100%.
          </p>
        </div>
        {etiquetas.length > 0 ? <BotonImprimir /> : null}
      </div>

      {etiquetas.length === 0 ? (
        <p className="mx-auto max-w-4xl px-4 text-sm text-muted print:hidden">
          No hay piezas para imprimir con ese filtro.
        </p>
      ) : (
        <div className="hoja-etiquetas">
          {etiquetas.map((e) => (
            <div key={e.codigo} className="etiqueta">
              <div
                className="etiqueta-qr"
                dangerouslySetInnerHTML={{ __html: e.svg }}
              />
              <div className="etiqueta-texto">
                <span className="etiqueta-codigo">{e.codigo}</span>
                <span className="etiqueta-nombre">{e.nombre}</span>
                {e.esCaja ? <span className="etiqueta-caja">CAJA</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
