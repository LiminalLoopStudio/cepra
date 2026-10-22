import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COLOR_ESTADO, ESTADO_FISICO, ESTADO_OPERATIVO, PROPIEDAD } from "@/lib/etiquetas";

export const metadata: Metadata = { title: "Equipo" };

type Equipo = {
  id: string;
  etiqueta: string;
  etiqueta_caja: string;
  etiqueta_control: string | null;
  etiqueta_cables: string | null;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  puertos: string[];
  estado_fisico: string;
  estado_operativo: string;
  propiedad: string;
  fecha_devolucion: string | null;
  notas: string | null;
  etiquetas_validadas_at: string | null;
  created_at: string;
  articulo: { codigo_tipo: string; nombre: string; categoria: string } | null;
  propietario: { nombre: string } | null;
  responsable: { nombre: string } | null;
};

type Movimiento = {
  id: number;
  tipo: string;
  nota: string | null;
  datos: Record<string, unknown>;
  created_at: string;
  realizado: { nombre: string } | null;
};

const TIPO_MOVIMIENTO: Record<string, string> = {
  alta: "Alta",
  edicion: "Edición",
  validacion: "Validación de etiquetas",
  entrega: "Entrega",
  devolucion: "Devolución",
  transferencia: "Transferencia",
  reporte_falla: "Reporte de falla",
  reparacion: "Reparación",
  baja: "Baja",
  devolucion_propietario: "Devuelto al propietario",
};

const NOMBRE_CAMPO: Record<string, string> = {
  marca: "Marca",
  modelo: "Modelo",
  serie: "Serie",
  puertos: "Puertos",
  propiedad: "Propiedad",
  propietario_id: "Propietario",
  fecha_devolucion: "Fecha de devolución",
  notas: "Notas",
  estado_fisico: "Estado físico",
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function valorTexto(v: unknown, nombres?: Map<string, string>): string {
  if (v === null || v === undefined || v === "") return "vacío";
  if (nombres && typeof v === "string" && nombres.has(v)) return nombres.get(v)!;
  if (Array.isArray(v)) return v.length ? v.join(", ") : "vacío";
  return String(v);
}

// Traduce valores guardados (ids, claves) al texto que entiende la gente.
function nombresCampo(campo: string, propietarios: Map<string, string>) {
  if (campo === "propietario_id") return propietarios;
  if (campo === "propiedad") return new Map(Object.entries(PROPIEDAD));
  if (campo === "estado_fisico") return new Map(Object.entries(ESTADO_FISICO));
  return undefined;
}

export default async function EquipoPage({ params }: PageProps<"/equipos/[id]">) {
  const usuario = await requireUsuario();
  const esAdmin = usuario.rol === "administrador";
  const puedeImprimir = esAdmin || usuario.rol === "almacenista";
  const veCuentas = esAdmin || usuario.rol === "lider";
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: eq }, { data: movs }, { data: props }, { data: cuentasData }] = await Promise.all([
    supabase
      .from("equipos")
      .select(
        "id, etiqueta, etiqueta_caja, etiqueta_control, etiqueta_cables, marca, modelo, serie, puertos, estado_fisico, estado_operativo, propiedad, fecha_devolucion, notas, etiquetas_validadas_at, created_at, articulo:catalogo_articulos(codigo_tipo, nombre, categoria), propietario:propietarios(nombre), responsable:usuarios(nombre)",
      )
      .eq("id", id)
      .maybeSingle(),
    // RLS: administrador/almacenista ven todo; otros roles solo lo que los involucra.
    supabase
      .from("movimientos")
      .select("id, tipo, nota, datos, created_at, realizado:usuarios!movimientos_realizado_por_fkey(nombre)")
      .eq("equipo_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("propietarios").select("id, nombre"),
    // Cuentas iniciadas en este equipo (RLS: solo líder y administrador las ven).
    veCuentas
      ? supabase
          .from("cuentas")
          .select("id, correo, usuario, plataforma:plataformas(nombre)")
          .eq("equipo_id", id)
          .eq("activo", true)
      : Promise.resolve({ data: [] }),
  ]);
  const cuentas = (cuentasData ?? []) as unknown as {
    id: string;
    correo: string;
    usuario: string | null;
    plataforma: { nombre: string } | null;
  }[];
  const nombrePropietario = new Map(
    (props ?? []).map((p) => [p.id as string, p.nombre as string]),
  );

  if (!eq) notFound();
  const e = eq as unknown as Equipo;
  const movimientos = (movs ?? []) as unknown as Movimiento[];

  const datos: [string, string][] = [
    ["Tipo", e.articulo ? `${e.articulo.nombre} (${e.articulo.codigo_tipo})` : "—"],
    ["Categoría", e.articulo?.categoria ?? "—"],
    ["Marca", e.marca ?? "—"],
    ["Modelo", e.modelo ?? "—"],
    ["Serie", e.serie ?? "—"],
    ["Puertos", e.puertos.length ? e.puertos.join(", ") : "—"],
    ["Estado físico", ESTADO_FISICO[e.estado_fisico] ?? e.estado_fisico],
    [
      "Propiedad",
      `${PROPIEDAD[e.propiedad] ?? e.propiedad}${
        e.propiedad !== "propio" && e.propietario ? ` · ${e.propietario.nombre}` : ""
      }`,
    ],
    ["Devolver al propietario", e.fecha_devolucion ?? "—"],
    ["Lo tiene", e.responsable?.nombre ?? "—"],
    ["Caja", e.etiqueta_caja],
    ...(e.etiqueta_control ? [["Control", e.etiqueta_control] as [string, string]] : []),
    ...(e.etiqueta_cables ? [["Cables originales", e.etiqueta_cables] as [string, string]] : []),
    ["Etiquetas validadas", e.etiquetas_validadas_at ? fecha(e.etiquetas_validadas_at) : "No"],
    ["Registrado", fecha(e.created_at)],
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/equipos" className="text-sm text-muted hover:text-foreground">
            ← Equipos
          </Link>
          <h1 className="mt-2 font-mono text-3xl font-bold">{e.etiqueta}</h1>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${
              COLOR_ESTADO[e.estado_operativo] ?? ""
            }`}
          >
            {ESTADO_OPERATIVO[e.estado_operativo] ?? e.estado_operativo}
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {puedeImprimir ? (
            <Link
              href={`/equipos/etiquetas?id=${e.id}`}
              className="flex h-11 items-center rounded-lg border border-foreground/15 px-5 font-medium hover:border-brand"
            >
              Reimprimir etiquetas
            </Link>
          ) : null}
          {esAdmin ? (
            <Link
              href={`/equipos/${e.id}/editar`}
              className="flex h-11 items-center rounded-lg bg-brand px-5 font-semibold text-white"
            >
              Editar
            </Link>
          ) : null}
        </div>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {datos.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className={["Serie", "Caja", "Control", "Cables originales"].includes(k) ? "font-mono" : ""}>{v}</dd>
            </div>
          ))}
        </dl>
        {e.notas ? (
          <div className="mt-4 border-t border-foreground/10 pt-4">
            <p className="text-xs text-muted">Notas</p>
            <p className="whitespace-pre-wrap">{e.notas}</p>
          </div>
        ) : null}
      </section>

      {veCuentas ? (
        <section>
          <h2 className="mb-3 font-semibold">Cuentas en este equipo</h2>
          {cuentas.length === 0 ? (
            <p className="text-sm text-muted">
              Ninguna. Se ligan desde{" "}
              <Link href="/cuentas" className="text-brand hover:underline">
                Cuentas
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {cuentas.map((c) => (
                <li key={c.id}>
                  <Link href={`/cuentas/${c.id}`} className="text-brand hover:underline">
                    {c.plataforma?.nombre}: {c.correo}
                  </Link>
                  {c.usuario ? <span className="text-muted"> · {c.usuario}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-semibold">Historial</h2>
        {movimientos.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {movimientos.map((m) => {
              const cambios =
                m.tipo === "edicion"
                  ? Object.entries(m.datos as Record<string, { antes: unknown; despues: unknown }>)
                  : [];
              return (
                <li key={m.id} className="rounded-xl border border-foreground/10 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{TIPO_MOVIMIENTO[m.tipo] ?? m.tipo}</span>
                    <span className="text-xs text-muted">
                      {fecha(m.created_at)}
                      {m.realizado ? ` · ${m.realizado.nombre}` : ""}
                    </span>
                  </div>
                  {m.nota ? <p className="text-sm text-muted">{m.nota}</p> : null}
                  {cambios.length > 0 ? (
                    <ul className="mt-1 text-sm">
                      {cambios.map(([campo, c]) => (
                        <li key={campo}>
                          <span className="text-muted">{NOMBRE_CAMPO[campo] ?? campo}:</span>{" "}
                          <span className="line-through opacity-60">
                            {valorTexto(c?.antes, nombresCampo(campo, nombrePropietario))}
                          </span>{" "}
                          → {valorTexto(c?.despues, nombresCampo(campo, nombrePropietario))}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted">Sin movimientos visibles.</p>
        )}
      </section>
    </main>
  );
}
