import Link from "next/link";
import { Icono } from "@/components/icono";
import { requireUsuario, ROL_ETIQUETA } from "@/lib/auth";
import { rangoFechas } from "@/lib/eventos";
import { gruposPara } from "@/lib/navegacion";
import { createClient } from "@/lib/supabase/server";

type Indicador = { titulo: string; valor: number; href: string; tono?: "alerta" | "normal" };

export default async function Home({ searchParams }: PageProps<"/">) {
  const usuario = await requireUsuario();
  const { contrasena } = await searchParams;
  const almacen = usuario.rol === "administrador" || usuario.rol === "almacenista";
  const lider = usuario.rol === "administrador" || usuario.rol === "lider";

  const supabase = await createClient();
  const contar = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [
    { data: evento },
    { data: firma },
    prestados,
    faltantes,
    porValidar,
    conFalla,
    porFacturar,
    aMiNombre,
    porPreparar,
    pendientesZona,
    misAbiertas,
  ] = await Promise.all([
      supabase
        .from("eventos")
        .select("id, nombre, fecha_inicio, fecha_fin, zonas(nombre, lider_id, zona_staff(usuario_id))")
        .eq("estado", "activo")
        .maybeSingle(),
      supabase.rpc("mi_firma"),
      almacen ? contar(supabase.from("equipos").select("id", { count: "exact", head: true }).eq("estado_operativo", "prestado")) : 0,
      almacen ? contar(supabase.from("v_prestamo_items").select("id", { count: "exact", head: true }).eq("estado", "faltante")) : 0,
      almacen ? contar(supabase.from("equipos").select("id", { count: "exact", head: true }).eq("estado_operativo", "por_validar")) : 0,
      almacen ? contar(supabase.from("equipos").select("id", { count: "exact", head: true }).eq("estado_operativo", "con_falla")) : 0,
      lider
        ? contar(supabase.from("compras").select("id", { count: "exact", head: true }).eq("estado_factura", "pendiente").eq("activo", true))
        : 0,
      contar(
        supabase
          .from("v_prestamo_items")
          .select("id", { count: "exact", head: true })
          .eq("receptor_id", usuario.id)
          .neq("estado", "devuelto"),
      ),
      almacen ? contar(supabase.from("solicitudes").select("id", { count: "exact", head: true }).eq("estado", "aprobada")) : 0,
      // RLS: el líder solo ve las de su zona (y las suyas, que nacen aprobadas).
      lider ? contar(supabase.from("solicitudes").select("id", { count: "exact", head: true }).eq("estado", "pendiente")) : 0,
      contar(
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("solicitante_id", usuario.id)
          .in("estado", ["pendiente", "aprobada", "lista"]),
      ),
    ]);

  const zonas = (evento?.zonas ?? []) as { nombre: string; lider_id: string | null; zona_staff: { usuario_id: string }[] }[];
  const zonaLider = zonas.find((z) => z.lider_id === usuario.id)?.nombre;
  const zonaStaff = zonas.find((z) => z.zona_staff.some((s) => s.usuario_id === usuario.id))?.nombre;
  const sinPin = !(firma as { tiene_pin?: boolean } | null)?.tiene_pin;

  const indicadores: Indicador[] = [
    ...(lider ? [{ titulo: "Solicitudes por aprobar", valor: pendientesZona, href: "/solicitudes", tono: "alerta" as const }] : []),
    ...(almacen ? [{ titulo: "Solicitudes por preparar", valor: porPreparar, href: "/solicitudes", tono: "alerta" as const }] : []),
    ...(!almacen ? [{ titulo: "Mis solicitudes abiertas", valor: misAbiertas, href: "/solicitudes" }] : []),
    ...(almacen
      ? [
          { titulo: "Equipos prestados", valor: prestados, href: "/prestamos" },
          { titulo: "Con faltantes", valor: faltantes, href: "/prestamos?ver=faltantes&evento=todos", tono: "alerta" as const },
          { titulo: "Por validar", valor: porValidar, href: "/equipos/validar", tono: "alerta" as const },
          { titulo: "Con falla", valor: conFalla, href: "/equipos", tono: "alerta" as const },
        ]
      : [{ titulo: "Tengo a mi nombre", valor: aMiNombre, href: "/prestamos" }]),
    ...(lider ? [{ titulo: "Compras por facturar", valor: porFacturar, href: "/compras?factura=pendiente", tono: "alerta" as const }] : []),
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-8">
      <div>
        <p className="text-sm text-muted">{ROL_ETIQUETA[usuario.rolReal]}</p>
        <h1 className="text-2xl font-bold">Hola, {usuario.nombre}</h1>
      </div>

      {contrasena === "ok" ? (
        <p role="status" className="rounded-xl bg-green-500/15 px-4 py-3 text-sm text-green-500">
          Contraseña guardada. Usa la nueva la próxima vez que entres.
        </p>
      ) : null}

      {sinPin ? (
        <Link
          href="/mi-credencial"
          className="flex items-center justify-between gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500 hover:border-yellow-500"
        >
          <span>Aún no tienes PIN de firma: créalo para poder recibir equipo.</span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}

      {/* Evento activo */}
      {evento ? (
        <Link
          href={`/eventos/${evento.id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 hover:border-green-500/60"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-green-500/15 text-green-500">
              <Icono nombre="eventos" />
            </span>
            <span>
              <span className="block text-xs font-medium uppercase tracking-wider text-green-500">Evento activo</span>
              <span className="block font-semibold">{evento.nombre}</span>
              <span className="block text-sm text-muted">{rangoFechas(evento.fecha_inicio, evento.fecha_fin)}</span>
            </span>
          </span>
          <span className="rounded-full bg-background/60 px-3 py-1 text-sm">
            {zonaLider ? `Líder de ${zonaLider}` : zonaStaff ? `Tu zona: ${zonaStaff}` : "Sin zona asignada"}
          </span>
        </Link>
      ) : (
        <p className="rounded-2xl border border-dashed border-foreground/15 px-5 py-4 text-sm text-muted">
          No hay un evento activo.{usuario.rol === "administrador" ? " Actívalo en Eventos para poder entregar equipo." : ""}
        </p>
      )}

      {/* Números del día */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {indicadores.map((i) => (
          <Link
            key={i.titulo}
            href={i.href}
            className="rounded-2xl border border-foreground/10 px-4 py-3 hover:border-brand"
          >
            <p
              className={`text-3xl font-bold tabular-nums ${
                i.tono === "alerta" && i.valor > 0 ? "text-yellow-500" : ""
              }`}
            >
              {i.valor}
            </p>
            <p className="text-sm text-muted">{i.titulo}</p>
          </Link>
        ))}
      </section>

      {/* Módulos por grupo */}
      {gruposPara(usuario.rol).map((g) => (
        <section key={g.titulo} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{g.titulo}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {g.modulos.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group flex flex-col gap-3 rounded-2xl border border-foreground/10 p-4 transition-colors hover:border-brand hover:bg-brand/5"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
                  <Icono nombre={m.icono} />
                </span>
                <span>
                  <span className="block font-semibold">
                    {m.href === "/prestamos" && usuario.rol === "staff" ? "Mis préstamos" : m.texto}
                  </span>
                  <span className="block text-sm text-muted">{m.descripcion}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
