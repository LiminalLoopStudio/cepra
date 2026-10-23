import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getUsuarioActual, ROL_ETIQUETA, type Rol } from "@/lib/auth";
import { rangoFechas } from "@/lib/eventos";
import { calcularBalance, cargarMaestro, consumoRenglon } from "@/lib/maestro";
import { ORIGEN } from "@/lib/maestro-textos";
import { ESTADO_SOLICITUD, fechaHora } from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/server";

// Colores (ARGB)
const MORADO = "FF4C1D95";
const MORADO_CLARO = "FFEDE9FE";
const LILA = "FFF5F3FF";
const GRIS = "FFF3F4F6";
const ROJO_FONDO = "FFFDE2E2";
const ROJO = "FFB91C1C";
const VERDE = "FF15803D";
const BLANCO = "FFFFFFFF";

const borde: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

function relleno(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function titulo(ws: ExcelJS.Worksheet, columnas: number, texto: string, sub: string) {
  // Al imprimir: horizontal y a lo ancho de una hoja.
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.pageSetup.printTitlesRow = "4:4";
  ws.mergeCells(1, 1, 1, columnas);
  ws.mergeCells(2, 1, 2, columnas);
  const t = ws.getCell(1, 1);
  t.value = texto;
  t.font = { bold: true, size: 16, color: { argb: MORADO } };
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { size: 10, color: { argb: "FF6B7280" } };
  ws.getRow(1).height = 26;
}

function encabezado(fila: ExcelJS.Row) {
  fila.height = 30;
  fila.eachCell((c) => {
    c.font = { bold: true, color: { argb: BLANCO } };
    c.fill = relleno(MORADO);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = borde;
  });
}

function bordes(fila: ExcelJS.Row, desde: number, hasta: number) {
  for (let i = desde; i <= hasta; i++) fila.getCell(i).border = borde;
}

const col = (n: number) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export async function GET(_req: Request, ctx: RouteContext<"/eventos/[id]/maestro/excel">) {
  const yo = await getUsuarioActual();
  if (!yo || !["administrador", "almacenista", "lider"].includes(yo.rol)) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const { id } = await ctx.params;
  const d = await cargarMaestro(id);
  if (!d) return new NextResponse("Evento no encontrado", { status: 404 });

  const inv = new Map(d.inventario.map((a) => [a.articulo_id, a]));
  const balance = calcularBalance(d);
  const zonas = d.zonas;
  const generado = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long", timeStyle: "short" });
  const sub = `${rangoFechas(d.evento.fecha_inicio, d.evento.fecha_fin)}${d.evento.lugar ? ` · ${d.evento.lugar}` : ""} · Documento ${
    d.estado === "cerrado" ? `cerrado${d.cerradoPor ? ` por ${d.cerradoPor}` : ""} (${fechaHora(d.cerradoAt)})` : "en borrador"
  } · Generado el ${generado}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "CEPRA · Gaming Partners";
  wb.created = new Date();
  // Que Excel recalcule las fórmulas (totales) al abrir el archivo.
  wb.calcProperties.fullCalcOnLoad = true;

  // ===========================================================================
  // 1) RESUMEN: equipo × zona, con lo que hay en almacén y lo que falta
  // ===========================================================================
  {
    const ws = wb.addWorksheet("Resumen", { views: [{ state: "frozen", xSplit: 2, ySplit: 4 }] });
    const fijas = ["Código", "Equipo", "Categoría"];
    const finales = [
      "Total requerido",
      "Sale de almacén",
      "Hay en almacén",
      "Queda en almacén",
      "Compra",
      "Renta",
      "Patrocinio",
      "Consumo c/u (W)",
      "Consumo total (W)",
    ];
    const nCols = fijas.length + zonas.length + finales.length;
    titulo(ws, nCols, `Documento maestro · ${d.evento.nombre}`, sub);

    const cab = ws.getRow(4);
    [...fijas, ...zonas.map((z) => z.nombre), ...finales].forEach((t, i) => (cab.getCell(i + 1).value = t));
    encabezado(cab);

    const cZ1 = fijas.length + 1; // primera columna de zona
    const cTot = cZ1 + zonas.length; // Total requerido
    const cAlm = cTot + 1; // Sale de almacén
    const cHay = cTot + 2; // Hay en almacén
    const cQueda = cTot + 3; // Queda
    const cCompra = cTot + 4;
    const cWu = cTot + 7;
    const cWt = cTot + 8;

    let r = 5;
    for (const b of balance) {
      const fila = ws.getRow(r);
      fila.getCell(1).value = b.codigo;
      fila.getCell(2).value = b.nombre;
      fila.getCell(3).value = b.categoria;
      zonas.forEach((z, i) => {
        const n = b.porZona.get(z.id) ?? 0;
        fila.getCell(cZ1 + i).value = n || null;
      });
      const total = b.asignado + b.compra + b.renta + b.patrocinio;
      fila.getCell(cTot).value =
        zonas.length > 0
          ? { formula: `SUM(${col(cZ1)}${r}:${col(cZ1 + zonas.length - 1)}${r})`, result: total }
          : total;
      fila.getCell(cAlm).value = b.asignado;
      if (b.total_almacen === null) {
        fila.getCell(cHay).value = "—";
        fila.getCell(cQueda).value = "—";
      } else {
        fila.getCell(cHay).value = b.total_almacen;
        fila.getCell(cQueda).value = { formula: `${col(cHay)}${r}-${col(cAlm)}${r}`, result: b.total_almacen - b.asignado };
      }
      fila.getCell(cCompra).value = b.compra || null;
      fila.getCell(cCompra + 1).value = b.renta || null;
      fila.getCell(cCompra + 2).value = b.patrocinio || null;
      fila.getCell(cWu).value = b.consumo_w || null;
      fila.getCell(cWt).value = { formula: `${col(cWu)}${r}*${col(cTot)}${r}`, result: b.consumo_w * total };
      bordes(fila, 1, nCols);
      for (let c = cZ1; c <= nCols; c++) fila.getCell(c).alignment = { horizontal: "center" };
      fila.getCell(cTot).font = { bold: true };
      fila.getCell(cAlm).fill = relleno(LILA);
      fila.getCell(cHay).fill = relleno(LILA);
      if (b.total_almacen !== null && b.total_almacen - b.asignado < 0) {
        fila.getCell(cQueda).fill = relleno(ROJO_FONDO);
        fila.getCell(cQueda).font = { bold: true, color: { argb: ROJO } };
      } else {
        fila.getCell(cQueda).font = { bold: true, color: { argb: VERDE } };
      }
      r++;
    }

    // Totales
    if (balance.length > 0) {
      const tot = ws.getRow(r);
      tot.getCell(2).value = "TOTAL";
      const suma = (f: (b: (typeof balance)[number]) => number) => balance.reduce((acc, b) => acc + f(b), 0);
      const todo = (b: (typeof balance)[number]) => b.asignado + b.compra + b.renta + b.patrocinio;
      const resultados: [number, number][] = [
        ...zonas.map((z, i): [number, number] => [cZ1 + i, suma((b) => b.porZona.get(z.id) ?? 0)]),
        [cTot, suma(todo)],
        [cAlm, suma((b) => b.asignado)],
        [cCompra, suma((b) => b.compra)],
        [cCompra + 1, suma((b) => b.renta)],
        [cCompra + 2, suma((b) => b.patrocinio)],
        [cWt, suma((b) => b.consumo_w * todo(b))],
      ];
      for (const [c, result] of resultados) {
        tot.getCell(c).value = { formula: `SUM(${col(c)}5:${col(c)}${r - 1})`, result };
      }
      tot.font = { bold: true };
      tot.eachCell((c) => {
        c.fill = relleno(MORADO_CLARO);
        c.border = { ...borde, top: { style: "medium", color: { argb: MORADO } } };
        c.alignment = { horizontal: "center" };
      });
      tot.getCell(2).alignment = { horizontal: "left" };
      r += 2;
    }
    const nota = ws.getRow(r);
    ws.mergeCells(r, 1, r, nCols);
    nota.getCell(1).value =
      "Queda en almacén = lo que hay en almacén − lo que sale de almacén. En rojo: falta y se cubre con compra, renta o patrocinio. " +
      "Las columnas de zona suman todo el equipo de esa zona (de cualquier origen).";
    nota.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    nota.getCell(1).alignment = { wrapText: true };
    nota.height = 30;

    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 34;
    ws.getColumn(3).width = 18;
    zonas.forEach((_, i) => (ws.getColumn(cZ1 + i).width = 14));
    for (let c = cTot; c <= nCols; c++) ws.getColumn(c).width = 13;
    if (balance.length > 0) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + balance.length, column: nCols } };
  }

  // ===========================================================================
  // 2) POR ZONA: cada zona y sección con su líder, staff y equipo
  // ===========================================================================
  {
    const ws = wb.addWorksheet("Por zona", { views: [{ state: "frozen", ySplit: 4 }] });
    const N = 8;
    titulo(ws, N, `Equipo por zona · ${d.evento.nombre}`, sub);
    const cab = ws.getRow(4);
    ["Código", "Equipo", "Cantidad", "Sale de", "Consumo c/u (W)", "Consumo total (W)", "Notas", "Hay en almacén"].forEach(
      (t, i) => (cab.getCell(i + 1).value = t),
    );
    encabezado(cab);

    let r = 5;
    let totalPiezas = 0;
    let totalW = 0;
    for (const z of zonas) {
      const deZona = d.renglones.filter((x) => x.zona_id === z.id);
      const staffZona = z.staff.length + z.secciones.reduce((s, x) => s + x.staff.length, 0);
      ws.mergeCells(r, 1, r, N);
      const banda = ws.getCell(r, 1);
      banda.value = `ZONA ${z.nombre.toUpperCase()}   ·   Líder de zona: ${z.lider?.nombre ?? "SIN ASIGNAR"}   ·   ${staffZona} staff`;
      banda.font = { bold: true, size: 12, color: { argb: BLANCO } };
      banda.fill = relleno(MORADO);
      ws.getRow(r).height = 22;
      r++;

      const lugares = [
        { nombre: z.secciones.length ? "Zona general" : "Equipo de la zona", lider: z.lider, staff: z.staff, id: null as string | null, esSeccion: false },
        ...z.secciones.map((s) => ({ nombre: /^secci[oó]n\b/i.test(s.nombre) ? s.nombre : `Sección ${s.nombre}`, lider: s.lider, staff: s.staff, id: s.id as string | null, esSeccion: true })),
      ];
      let piezasZona = 0;
      let wZona = 0;
      for (const l of lugares) {
        const filas = deZona.filter((x) => x.seccion_id === l.id);
        if (filas.length === 0 && l.staff.length === 0 && !l.esSeccion) continue;
        ws.mergeCells(r, 1, r, N);
        const s = ws.getCell(r, 1);
        const lider = l.lider?.nombre ?? (l.esSeccion ? `recibe ${z.lider?.nombre ?? "SIN LÍDER"} (líder de zona)` : "SIN ASIGNAR");
        s.value = `${l.nombre}  —  Líder: ${lider}${l.staff.length ? `  —  Staff: ${l.staff.map((p) => p.nombre).join(", ")}` : ""}`;
        s.font = { bold: true, color: { argb: MORADO } };
        s.fill = relleno(MORADO_CLARO);
        s.alignment = { wrapText: true, vertical: "middle" };
        ws.getRow(r).height = l.staff.length > 6 ? 30 : 18;
        r++;
        if (filas.length === 0) {
          ws.getCell(r, 2).value = "Sin equipo asignado";
          ws.getCell(r, 2).font = { italic: true, color: { argb: "FF9CA3AF" } };
          r++;
          continue;
        }
        for (const x of filas) {
          const a = x.articulo_id ? inv.get(x.articulo_id) : undefined;
          const wu = (a ? a.consumo_w : x.consumo_w) ?? 0;
          const fila = ws.getRow(r);
          fila.values = [
            a?.codigo_tipo ?? "—",
            a?.nombre ?? x.descripcion ?? "",
            x.cantidad,
            ORIGEN[x.origen],
            wu || null,
            { formula: `C${r}*E${r}`, result: wu * x.cantidad },
            x.notas ?? "",
            a ? a.total_almacen : "—",
          ];
          bordes(fila, 1, N);
          for (const c of [1, 3, 4, 5, 6, 8]) fila.getCell(c).alignment = { horizontal: "center" };
          if (x.origen !== "almacen") fila.getCell(4).fill = relleno("FFFEF3C7");
          piezasZona += x.cantidad;
          wZona += consumoRenglon(x, inv);
          r++;
        }
      }
      const sub = ws.getRow(r);
      sub.getCell(2).value = `Total ${z.nombre}`;
      sub.getCell(3).value = piezasZona;
      sub.getCell(6).value = wZona;
      sub.font = { bold: true };
      for (let c = 1; c <= N; c++) {
        sub.getCell(c).fill = relleno(GRIS);
        sub.getCell(c).border = { top: { style: "thin", color: { argb: MORADO } } };
      }
      sub.getCell(3).alignment = { horizontal: "center" };
      sub.getCell(6).alignment = { horizontal: "center" };
      totalPiezas += piezasZona;
      totalW += wZona;
      r += 2;
    }
    const fin = ws.getRow(r);
    fin.getCell(2).value = "TOTAL DEL EVENTO";
    fin.getCell(3).value = totalPiezas;
    fin.getCell(6).value = totalW;
    fin.getCell(7).value = `${(totalW / 1000).toLocaleString("es-MX", { maximumFractionDigits: 2 })} kW`;
    fin.font = { bold: true, size: 12 };
    for (let c = 1; c <= N; c++) fin.getCell(c).fill = relleno(MORADO_CLARO);
    fin.getCell(3).alignment = { horizontal: "center" };
    fin.getCell(6).alignment = { horizontal: "center" };

    [10, 36, 10, 13, 14, 15, 30, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }

  // ===========================================================================
  // 3) PERSONAL: quién está en cada lugar
  // ===========================================================================
  {
    const ws = wb.addWorksheet("Personal", { views: [{ state: "frozen", ySplit: 4 }] });
    titulo(ws, 5, `Personal por zona · ${d.evento.nombre}`, sub);
    const cab = ws.getRow(4);
    ["Zona", "Sección", "Función en el evento", "Nombre", "Rol en CEPRA"].forEach((t, i) => (cab.getCell(i + 1).value = t));
    encabezado(cab);
    let r = 5;
    const add = (zona: string, seccion: string, funcion: string, p: { nombre: string; rol: string }, lider: boolean) => {
      const fila = ws.getRow(r++);
      fila.values = [zona, seccion, funcion, p.nombre, p.rol === "lider" ? "Líder" : (ROL_ETIQUETA[p.rol as Rol] ?? p.rol)];
      bordes(fila, 1, 5);
      if (lider) {
        fila.font = { bold: true };
        fila.eachCell((c) => (c.fill = relleno(LILA)));
      }
    };
    for (const z of zonas) {
      if (z.lider) add(z.nombre, "—", "Líder de zona", z.lider, true);
      for (const p of z.staff) add(z.nombre, z.secciones.length ? "Zona general" : "—", "Staff", p, false);
      for (const s of z.secciones) {
        if (s.lider) add(z.nombre, s.nombre, "Líder de sección", s.lider, true);
        for (const p of s.staff) add(z.nombre, s.nombre, "Staff", p, false);
      }
    }
    if (r === 5) ws.getCell(5, 1).value = "Todavía no hay personal asignado.";
    [22, 22, 20, 30, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    if (r > 5) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: r - 1, column: 5 } };
  }

  // ===========================================================================
  // 4) PIEZAS: etiquetas concretas que almacén apartó o entregó
  // ===========================================================================
  {
    const supabase = await createClient();
    type Equipo = { etiqueta: string; marca: string | null; modelo: string | null; serie: string | null; articulo: { codigo_tipo: string; nombre: string } | null };
    const { data } = await supabase
      .from("solicitudes")
      .select(
        "folio, estado, zona:zonas(nombre), seccion:secciones(nombre), reservas:solicitud_reservas(equipo:equipos(etiqueta, marca, modelo, serie, articulo:catalogo_articulos(codigo_tipo, nombre))), prestamo:prestamos(folio, items:prestamo_items(equipo:equipos(etiqueta, marca, modelo, serie, articulo:catalogo_articulos(codigo_tipo, nombre))))",
      )
      .eq("evento_id", id)
      .eq("origen", "maestro")
      .in("estado", ["lista", "entregada"])
      .order("folio");
    const sols = (data ?? []) as unknown as {
      folio: number;
      estado: string;
      zona: { nombre: string } | null;
      seccion: { nombre: string } | null;
      reservas: { equipo: Equipo | null }[];
      prestamo: { folio: number; items: { equipo: Equipo | null }[] } | null;
    }[];
    const filas = sols.flatMap((s) =>
      [...s.reservas.map((x) => x.equipo), ...(s.prestamo?.items ?? []).map((x) => x.equipo)]
        .filter((e): e is Equipo => Boolean(e))
        .map((e) => ({ s, e })),
    );
    if (filas.length > 0) {
      const ws = wb.addWorksheet("Piezas", { views: [{ state: "frozen", ySplit: 4 }] });
      titulo(ws, 9, `Piezas apartadas y entregadas · ${d.evento.nombre}`, sub);
      const cab = ws.getRow(4);
      ["Zona", "Sección", "Etiqueta", "Código", "Equipo", "Marca", "Modelo", "Serie", "Estado"].forEach(
        (t, i) => (cab.getCell(i + 1).value = t),
      );
      encabezado(cab);
      let r = 5;
      for (const { s, e } of filas) {
        const fila = ws.getRow(r++);
        fila.values = [
          s.zona?.nombre ?? "",
          s.seccion?.nombre ?? "—",
          e.etiqueta,
          e.articulo?.codigo_tipo ?? "",
          e.articulo?.nombre ?? "",
          e.marca ?? "",
          e.modelo ?? "",
          e.serie ?? "",
          s.estado === "entregada" ? `Entregada (préstamo ${s.prestamo?.folio ?? ""})` : ESTADO_SOLICITUD[s.estado],
        ];
        bordes(fila, 1, 9);
        fila.getCell(3).font = { name: "Consolas", bold: true };
      }
      [20, 18, 18, 9, 30, 14, 16, 20, 24].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: r - 1, column: 9 } };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `Documento maestro - ${d.evento.nombre}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="documento-maestro.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
