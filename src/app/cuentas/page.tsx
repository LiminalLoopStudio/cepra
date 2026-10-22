import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CuentaForm, type Opcion } from "./formularios";

export const metadata: Metadata = { title: "Cuentas" };

type Cuenta = {
  id: string;
  correo: string;
  usuario: string | null;
  notas: string | null;
  activo: boolean;
  plataforma_id: string;
  equipo: { id: string; etiqueta: string } | null;
};

type Plataforma = { id: string; nombre: string; activo: boolean };

export default async function CuentasPage({ searchParams }: PageProps<"/cuentas">) {
  await requireUsuario(["administrador", "lider"]);
  const params = await searchParams;
  const filtro = typeof params.p === "string" ? params.p : "";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const verInactivas = params.inactivas === "1";

  const supabase = await createClient();
  let consulta = supabase
    .from("cuentas")
    .select("id, correo, usuario, notas, activo, plataforma_id, equipo:equipos(id, etiqueta)")
    .order("correo");
  if (filtro) consulta = consulta.eq("plataforma_id", filtro);
  if (!verInactivas) consulta = consulta.eq("activo", true);
  if (q) {
    // Busca en correo, usuario y notas (se quitan comas y paréntesis: rompen el filtro).
    const limpio = q.replace(/[,()]/g, " ");
    consulta = consulta.or(`correo.ilike.%${limpio}%,usuario.ilike.%${limpio}%,notas.ilike.%${limpio}%`);
  }

  const [{ data: cuentasData, error }, { data: plataformasData }, { data: equiposData }] = await Promise.all([
    consulta,
    supabase.from("plataformas").select("id, nombre, activo").order("orden").order("nombre"),
    supabase
      .from("equipos")
      .select("id, etiqueta, articulo:catalogo_articulos(nombre)")
      .not("estado_operativo", "in", "(baja,devuelto_propietario)")
      .order("etiqueta"),
  ]);

  const cuentas = (cuentasData ?? []) as unknown as Cuenta[];
  const plataformas = (plataformasData ?? []) as Plataforma[];
  const activas = plataformas.filter((p) => p.activo);
  const equipos: Opcion[] = ((equiposData ?? []) as unknown as { id: string; etiqueta: string; articulo: { nombre: string } | null }[]).map(
    (e) => ({ id: e.id, texto: `${e.etiqueta} — ${e.articulo?.nombre ?? ""}` }),
  );

  // Agrupadas por plataforma, en el orden de la lista de plataformas.
  const grupos = plataformas
    .map((p) => ({ plataforma: p, cuentas: cuentas.filter((c) => c.plataforma_id === p.id) }))
    .filter((g) => g.cuentas.length > 0);

  const enlace = (cambios: Record<string, string>) => {
    const s = new URLSearchParams({ ...(filtro ? { p: filtro } : {}), ...(q ? { q } : {}), ...(verInactivas ? { inactivas: "1" } : {}), ...cambios });
    for (const [k, val] of [...s.entries()]) if (!val) s.delete(k);
    const texto = s.toString();
    return texto ? `/cuentas?${texto}` : "/cuentas";
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Inicio
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Cuentas</h1>
          <p className="text-sm text-muted">
            Cuentas de plataformas usadas en los equipos. Las contraseñas no se guardan aquí.
          </p>
        </div>
        <Link href="/cuentas/clasificaciones" className="text-sm text-brand hover:underline">
          Administrar clasificaciones
        </Link>
      </div>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-4 font-semibold">Registrar cuenta</h2>
        <div>
          <CuentaForm
            modo="crear"
            plataformas={activas.map((p) => ({ id: p.id, texto: p.nombre }))}
            equipos={equipos}
            plataformaInicial={filtro}
          />
        </div>
      </section>

      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href={enlace({ p: "" })}
            className={`rounded-full border px-3 py-1 ${!filtro ? "border-brand bg-brand/10 text-brand" : "border-foreground/15"}`}
          >
            Todas
          </Link>
          {activas.map((p) => (
            <Link
              key={p.id}
              href={enlace({ p: p.id })}
              className={`rounded-full border px-3 py-1 ${filtro === p.id ? "border-brand bg-brand/10 text-brand" : "border-foreground/15"}`}
            >
              {p.nombre}
            </Link>
          ))}
        </nav>
        <form action="/cuentas" className="flex flex-wrap items-center gap-2">
          {filtro ? <input type="hidden" name="p" value={filtro} /> : null}
          {verInactivas ? <input type="hidden" name="inactivas" value="1" /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por correo, usuario o notas…"
            className="h-10 min-w-60 flex-1 rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus:border-brand"
          />
          <button type="submit" className="h-10 rounded-lg border border-foreground/15 px-4 text-sm hover:border-brand">
            Buscar
          </button>
          <Link href={enlace({ inactivas: verInactivas ? "" : "1" })} className="text-sm text-muted underline">
            {verInactivas ? "Ocultar desactivadas" : "Ver desactivadas"}
          </Link>
        </form>
      </div>

      {error ? (
        <p className="text-sm text-red-500">No se pudieron cargar: {error.message}</p>
      ) : grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
          {q || filtro ? "No hay cuentas con ese filtro." : "Aún no hay cuentas registradas."}
        </p>
      ) : (
        grupos.map(({ plataforma, cuentas: lista }) => (
          <section key={plataforma.id}>
            <h2 className="mb-2 font-semibold">
              {plataforma.nombre} <span className="text-muted">({lista.length})</span>
            </h2>
            <div className="overflow-x-auto rounded-xl border border-foreground/10">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-foreground/5 text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Correo</th>
                    <th className="px-4 py-2 font-medium">Usuario</th>
                    <th className="px-4 py-2 font-medium">Equipo</th>
                    <th className="px-4 py-2 font-medium">Notas</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {lista.map((c) => (
                    <tr key={c.id} className={c.activo ? "" : "opacity-50"}>
                      <td className="px-4 py-2 font-mono text-xs">
                        {c.correo}
                        {!c.activo ? <span className="ml-2 font-sans text-muted">(desactivada)</span> : null}
                      </td>
                      <td className="px-4 py-2">{c.usuario ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {c.equipo ? (
                          <Link href={`/equipos/${c.equipo.id}`} className="text-brand hover:underline">
                            {c.equipo.etiqueta}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-64 truncate px-4 py-2 text-muted" title={c.notas ?? ""}>
                        {c.notas ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/cuentas/${c.id}`} className="text-brand hover:underline">
                          Editar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </main>
  );
}
