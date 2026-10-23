"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScanInput } from "@/components/scan-input";
import { ROL_ETIQUETA, type Rol } from "@/lib/auth-etiquetas";
import { sonar } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/client";

export type ArticuloCantidad = { articulo_id: string; codigo_tipo: string; nombre: string; disponible: number };

type Receptor = {
  id: string;
  nombre: string;
  rol: string;
  zona: string | null;
  tiene_pin: boolean;
  bloqueado: boolean;
};

type Pieza = {
  etiqueta: string;
  articulo: string;
  traeControl: boolean;
  traeCables: boolean;
  control: boolean;
  cables: boolean;
};

type Linea = { articulo_id: string; nombre: string; cantidad: number };

type SolicitudLista = {
  id: string;
  folio: number;
  zona: { nombre: string } | null;
  items: { articulo_id: string; reservado_cantidad: number; articulo: { nombre: string; serializado: boolean } | null }[];
  reservas: {
    equipo: {
      etiqueta: string;
      etiqueta_control: string | null;
      etiqueta_cables: string | null;
      articulo: { nombre: string } | null;
    } | null;
  }[];
};

type Aviso = { nivel: "ok" | "advertencia" | "error"; texto: string; folio?: number; prestamoId?: string };

const ESTILO = {
  ok: "border-green-500 bg-green-500/15 text-green-500",
  advertencia: "border-yellow-500 bg-yellow-500/15 text-yellow-500",
  error: "border-red-500 bg-red-500/15 text-red-500",
};

const ESTADO_TEXTO: Record<string, string> = {
  por_validar: "sin validar sus etiquetas",
  reservado: "apartado para una solicitud",
  prestado: "ya prestado",
  con_falla: "con falla",
  en_reparacion: "en reparación",
  devuelto_propietario: "devuelto a su dueño",
  baja: "dado de baja",
};

export function Entrega({ evento, stock }: { evento: string; stock: ArticuloCantidad[] }) {
  const router = useRouter();
  const [receptor, setReceptor] = useState<Receptor | null>(null);
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [articulo, setArticulo] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [pin, setPin] = useState("");
  const [notas, setNotas] = useState("");
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Solicitudes listas para recoger de quien recibe, y la que se está entregando.
  const [listas, setListas] = useState<SolicitudLista[]>([]);
  const [solicitud, setSolicitud] = useState<{ id: string; folio: number } | null>(null);
  const [apartado, setApartado] = useState<Record<string, number>>({});

  function avisar(a: Aviso) {
    sonar(a.nivel);
    setAviso(a);
  }

  function reiniciar() {
    setReceptor(null);
    setPiezas([]);
    setLineas([]);
    setPin("");
    setNotas("");
    setListas([]);
    setSolicitud(null);
    setApartado({});
  }

  async function buscarSolicitudes(receptorId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("solicitudes")
      .select(
        "id, folio, zona:zonas(nombre), items:solicitud_items(articulo_id, reservado_cantidad, articulo:catalogo_articulos(nombre, serializado)), reservas:solicitud_reservas(equipo:equipos(etiqueta, etiqueta_control, etiqueta_cables, articulo:catalogo_articulos(nombre)))",
      )
      .eq("solicitante_id", receptorId)
      .eq("estado", "lista")
      .order("folio");
    setListas((data ?? []) as unknown as SolicitudLista[]);
  }

  // Carga lo que almacén apartó para la solicitud: piezas y cantidades.
  function cargarSolicitud(s: SolicitudLista) {
    if (piezas.length > 0 || lineas.length > 0) {
      avisar({ nivel: "advertencia", texto: "Quita lo que ya escaneaste antes de cargar una solicitud." });
      return;
    }
    setPiezas(
      s.reservas
        .filter((r) => r.equipo)
        .map((r) => ({
          etiqueta: r.equipo!.etiqueta,
          articulo: r.equipo!.articulo?.nombre ?? "",
          traeControl: Boolean(r.equipo!.etiqueta_control),
          traeCables: Boolean(r.equipo!.etiqueta_cables),
          control: Boolean(r.equipo!.etiqueta_control),
          cables: Boolean(r.equipo!.etiqueta_cables),
        })),
    );
    const porCantidad = s.items.filter((i) => !i.articulo?.serializado && i.reservado_cantidad > 0);
    setLineas(porCantidad.map((i) => ({ articulo_id: i.articulo_id, nombre: i.articulo?.nombre ?? "", cantidad: i.reservado_cantidad })));
    setApartado(Object.fromEntries(porCantidad.map((i) => [i.articulo_id, i.reservado_cantidad])));
    setSolicitud({ id: s.id, folio: s.folio });
    avisar({ nivel: "ok", texto: `Solicitud ${s.folio} cargada. Revisa y pide el PIN.` });
  }

  function soltarSolicitud() {
    setSolicitud(null);
    setPiezas([]);
    setLineas([]);
    setApartado({});
  }

  async function onScan(codigo: string) {
    const supabase = createClient();

    // Credencial de persona
    if (codigo.startsWith("GPU-")) {
      if (receptor && (piezas.length > 0 || lineas.length > 0)) {
        avisar({ nivel: "advertencia", texto: `Ya estás entregando a ${receptor.nombre}. Termina o cancela antes de cambiar de persona.` });
        return;
      }
      setOcupado(true);
      const { data, error } = await supabase.rpc("buscar_por_credencial", { p_codigo: codigo });
      setOcupado(false);
      const r = data as (Receptor & { encontrado: boolean; activo: boolean; mensaje?: string }) | null;
      if (error || !r) return avisar({ nivel: "error", texto: error?.message ?? "No se pudo leer la credencial." });
      if (!r.encontrado) return avisar({ nivel: "error", texto: r.mensaje ?? "Credencial no reconocida." });
      if (!r.activo) return avisar({ nivel: "error", texto: `${r.nombre} está desactivado.` });
      setReceptor(r);
      setAviso(null);
      void buscarSolicitudes(r.id);
      sonar(r.tiene_pin && !r.bloqueado ? "ok" : "advertencia");
      if (!r.tiene_pin) setAviso({ nivel: "advertencia", texto: `${r.nombre} aún no tiene PIN: debe crearlo en "Mi credencial" para poder firmar.` });
      else if (r.bloqueado) setAviso({ nivel: "advertencia", texto: `El PIN de ${r.nombre} está bloqueado por intentos fallidos.` });
      return;
    }

    if (!receptor) {
      avisar({ nivel: "error", texto: "Primero escanea la credencial de quien recibe." });
      return;
    }

    // Etiqueta de pieza (o de su caja / control / cables)
    const base = codigo.replace(/-(CTRL|CBL|C)$/, "");
    const accesorio = codigo.endsWith("-CTRL") ? "control" : codigo.endsWith("-CBL") ? "cables" : null;
    const ya = piezas.find((p) => p.etiqueta === base);
    if (ya) {
      if (accesorio) {
        setPiezas((ps) => ps.map((p) => (p.etiqueta === base ? { ...p, [accesorio]: true } : p)));
        avisar({
          nivel: "ok",
          texto: accesorio === "control" ? `Control de ${base} confirmado.` : `Cables de ${base} confirmados.`,
        });
      } else {
        avisar({ nivel: "advertencia", texto: `${base} ya está en la lista.` });
      }
      return;
    }

    setOcupado(true);
    const { data, error } = await supabase
      .from("equipos")
      .select("etiqueta, estado_operativo, etiqueta_control, etiqueta_cables, articulo:catalogo_articulos(nombre), responsable:usuarios!equipos_responsable_id_fkey(nombre)")
      .eq("etiqueta", base)
      .maybeSingle();
    setOcupado(false);
    if (error) return avisar({ nivel: "error", texto: error.message });
    const e = data as unknown as {
      etiqueta: string;
      estado_operativo: string;
      etiqueta_control: string | null;
      etiqueta_cables: string | null;
      articulo: { nombre: string } | null;
      responsable: { nombre: string } | null;
    } | null;
    if (!e) return avisar({ nivel: "error", texto: `Etiqueta no reconocida: ${codigo}` });
    if (e.estado_operativo !== "disponible") {
      const extra = e.estado_operativo === "prestado" && e.responsable ? ` a ${e.responsable.nombre}` : "";
      return avisar({ nivel: "error", texto: `${e.etiqueta} no se puede entregar: está ${ESTADO_TEXTO[e.estado_operativo] ?? e.estado_operativo}${extra}.` });
    }
    setPiezas((ps) => [
      ...ps,
      {
        etiqueta: e.etiqueta,
        articulo: e.articulo?.nombre ?? "",
        traeControl: Boolean(e.etiqueta_control),
        traeCables: Boolean(e.etiqueta_cables),
        control: Boolean(e.etiqueta_control),
        cables: Boolean(e.etiqueta_cables),
      },
    ]);
    avisar({ nivel: "ok", texto: `${e.etiqueta} agregado.` });
  }

  function agregarCantidad() {
    const a = stock.find((s) => s.articulo_id === articulo);
    const n = Number(cantidad);
    if (!a || !Number.isInteger(n) || n <= 0) return;
    const yaLleva = lineas.find((l) => l.articulo_id === a.articulo_id)?.cantidad ?? 0;
    const tope = a.disponible + (apartado[a.articulo_id] ?? 0);
    if (yaLleva + n > tope) {
      avisar({ nivel: "error", texto: `Solo hay ${tope} ${a.nombre} disponibles.` });
      return;
    }
    setLineas((ls) =>
      ls.some((l) => l.articulo_id === a.articulo_id)
        ? ls.map((l) => (l.articulo_id === a.articulo_id ? { ...l, cantidad: l.cantidad + n } : l))
        : [...ls, { articulo_id: a.articulo_id, nombre: a.nombre, cantidad: n }],
    );
    setCantidad("1");
  }

  async function firmar() {
    if (!receptor) return;
    setOcupado(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("registrar_entrega", {
      p_receptor: receptor.id,
      p_pin: pin,
      p_piezas: piezas.map((p) => ({ etiqueta: p.etiqueta, control: p.control, cables: p.cables })),
      p_cantidades: lineas.map((l) => ({ articulo_id: l.articulo_id, cantidad: l.cantidad })),
      p_notas: notas || null,
      p_solicitud: solicitud?.id ?? null,
    });
    setOcupado(false);
    setPin("");
    const r = data as { ok: boolean; mensaje: string; folio?: number; prestamo_id?: string } | null;
    if (error || !r) return avisar({ nivel: "error", texto: error?.message ?? "No se pudo registrar." });
    if (!r.ok) return avisar({ nivel: "error", texto: r.mensaje });
    avisar({ nivel: "ok", texto: r.mensaje, folio: r.folio, prestamoId: r.prestamo_id });
    reiniciar();
    router.refresh(); // actualiza el stock disponible
  }

  const total = piezas.length + lineas.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-4">
        <ScanInput
          onScan={onScan}
          disabled={ocupado}
          placeholder={receptor ? "Escanea las piezas…" : "Escanea la credencial de quien recibe…"}
        />

        {aviso ? (
          <div role="status" aria-live="assertive" className={`rounded-2xl border-2 p-4 text-center ${ESTILO[aviso.nivel]}`}>
            <p className="font-semibold">{aviso.texto}</p>
            {aviso.prestamoId ? (
              <Link href={`/prestamos/${aviso.prestamoId}`} className="text-sm underline">
                Ver préstamo {aviso.folio}
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* Quién recibe */}
        <section className="rounded-2xl border border-foreground/10 p-4">
          {receptor ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Recibe</p>
                <p className="text-lg font-semibold">{receptor.nombre}</p>
                <p className="text-sm text-muted">
                  {ROL_ETIQUETA[receptor.rol as Rol] ?? receptor.rol} · {receptor.zona ? `Zona ${receptor.zona}` : "sin zona en este evento"} · {evento}
                </p>
              </div>
              <button type="button" onClick={reiniciar} className="text-sm text-muted underline">
                Cancelar
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">Esperando la credencial de quien recibe…</p>
          )}
        </section>

        {/* Solicitudes listas para recoger */}
        {receptor && solicitud ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-sm">
            <span>
              Entregando la <span className="font-semibold">solicitud #{solicitud.folio}</span>. Puedes quitar o agregar
              cosas; lo apartado que no se entregue se libera solo.
            </span>
            <button type="button" onClick={soltarSolicitud} className="text-muted underline">
              No usar la solicitud
            </button>
          </section>
        ) : receptor && listas.length > 0 ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-sm">
            <p className="font-semibold">
              {receptor.nombre} tiene {listas.length === 1 ? "una solicitud lista" : `${listas.length} solicitudes listas`} para
              recoger
            </p>
            {listas.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  #{l.folio} · Zona {l.zona?.nombre} · {l.reservas.length} piezas
                  {l.items.some((i) => !i.articulo?.serializado && i.reservado_cantidad > 0)
                    ? ` y ${l.items.reduce((t, i) => t + (i.articulo?.serializado ? 0 : i.reservado_cantidad), 0)} por cantidad`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => cargarSolicitud(l)}
                  className="h-9 rounded-lg bg-brand px-4 font-semibold text-white"
                >
                  Cargar solicitud
                </button>
              </div>
            ))}
          </section>
        ) : null}

        {/* Piezas */}
        {receptor ? (
          <section className="rounded-2xl border border-foreground/10 p-4">
            <h2 className="mb-2 font-semibold">Piezas ({piezas.length})</h2>
            {piezas.length === 0 ? (
              <p className="text-sm text-muted">Escanea la etiqueta de cada pieza (equipo o caja).</p>
            ) : (
              <ul className="flex flex-col divide-y divide-foreground/10 text-sm">
                {piezas.map((p) => (
                  <li key={p.etiqueta} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-mono font-semibold">{p.etiqueta}</span>
                      <span className="ml-2 text-muted">{p.articulo}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-4">
                      {p.traeControl ? (
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={p.control}
                            onChange={(ev) =>
                              setPiezas((ps) => ps.map((x) => (x.etiqueta === p.etiqueta ? { ...x, control: ev.target.checked } : x)))
                            }
                          />
                          con control
                        </label>
                      ) : null}
                      {p.traeCables ? (
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={p.cables}
                            onChange={(ev) =>
                              setPiezas((ps) => ps.map((x) => (x.etiqueta === p.etiqueta ? { ...x, cables: ev.target.checked } : x)))
                            }
                          />
                          con cables
                        </label>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setPiezas((ps) => ps.filter((x) => x.etiqueta !== p.etiqueta))}
                        className="text-xs text-muted underline hover:text-red-500"
                      >
                        Quitar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {/* Por cantidad */}
        {receptor && stock.length > 0 ? (
          <section className="rounded-2xl border border-foreground/10 p-4">
            <h2 className="mb-2 font-semibold">Artículos por cantidad</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={articulo}
                onChange={(e) => setArticulo(e.target.value)}
                className="h-10 min-w-56 flex-1 rounded-lg border border-foreground/15 bg-background px-3 text-sm"
              >
                <option value="">Elige un artículo…</option>
                {stock.map((s) => (
                  <option key={s.articulo_id} value={s.articulo_id} disabled={s.disponible <= 0}>
                    {s.nombre} ({s.disponible} disponibles)
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="h-10 w-24 rounded-lg border border-foreground/15 bg-background px-3 text-sm"
                aria-label="Cantidad"
              />
              <button
                type="button"
                onClick={agregarCantidad}
                disabled={!articulo}
                className="h-10 rounded-lg border border-foreground/15 px-4 text-sm font-medium hover:border-brand disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
            {lineas.length > 0 ? (
              <ul className="mt-3 flex flex-col divide-y divide-foreground/10 text-sm">
                {lineas.map((l) => (
                  <li key={l.articulo_id} className="flex items-center justify-between py-2">
                    <span>
                      {l.cantidad} × {l.nombre}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.articulo_id !== l.articulo_id))}
                      className="text-xs text-muted underline hover:text-red-500"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* Firma */}
      <aside className="flex flex-col gap-3 self-start rounded-2xl border border-foreground/10 p-4 lg:sticky lg:top-4">
        <h2 className="font-semibold">Firma</h2>
        <p className="text-sm text-muted">
          {receptor
            ? total > 0
              ? `${receptor.nombre} recibe ${piezas.length} ${piezas.length === 1 ? "pieza" : "piezas"}${lineas.length ? ` y ${lineas.reduce((s, l) => s + l.cantidad, 0)} artículos por cantidad` : ""}. Pásale la pantalla para que escriba su PIN.`
              : "Agrega lo que se entrega."
            : "Primero escanea la credencial."}
        </p>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Notas (opcional)"
          rows={2}
          disabled={!receptor}
          className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm disabled:opacity-50"
        />
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pin.length >= 4 && total > 0) void firmar();
          }}
          placeholder="PIN de quien recibe"
          disabled={!receptor || total === 0}
          aria-label="PIN de quien recibe"
          className="h-14 w-full rounded-xl border-2 border-foreground/15 bg-background px-4 text-center font-mono text-2xl tracking-[0.5em] outline-none placeholder:font-sans placeholder:text-base placeholder:tracking-normal focus:border-brand disabled:opacity-50"
        />
        <button
          type="button"
          onClick={firmar}
          disabled={!receptor || total === 0 || pin.length < 4 || ocupado}
          className="h-12 rounded-lg bg-brand font-semibold text-white disabled:opacity-50"
        >
          {ocupado ? "Registrando…" : "Firmar y entregar"}
        </button>
      </aside>
    </div>
  );
}
