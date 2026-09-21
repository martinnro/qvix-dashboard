import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};
const SUCURSALES_VALIDAS = Object.keys(SUCURSALES).map(Number);

// La tabla EstadosCampaniaDetalle nombra el id 3 como "Entregado", pero en la práctica no hay
// confirmación real de entrega/lectura: ese estado se marca apenas el envío sale OK. Se corrige
// acá el texto que se muestra, sin tocar el id numérico (que sigue usándose para filtrar).
const ESTADO_ENVIO_LABELS: Record<number, string> = {
  3: "Enviado",
  5: "Error",
};

export function estadoEnvioLabel(estadoId: number, nombreOriginal: string): string {
  return ESTADO_ENVIO_LABELS[estadoId] ?? nombreOriginal;
}

export interface CampaniaListItem {
  id: number;
  nombre: string;
  descripcion: string | null;
  plantilla: string | null;
  estado: string | null;
  fechaCreado: string;
  fechaActualizado: string | null;
  total: number;
}

export interface DetalleRow {
  conexionId: number;
  nombre: string;
  telefono: string;
  estadoId: number;
  estadoNombre: string;
  cod_sucursal: number;
  tarifa: string | null;
  tarifa_tv: string | null;
  respuesta: string | null;
  fechaRespuesta: string | null;
  fechaCreado: string;
  fechaActualizado: string;
}

// Sin respuesta se agrupa bajo este id — no puede colisionar con un texto real de respuesta
// (las respuestas son etiquetas de botones de la plantilla de WhatsApp, ej. "SI", "MAS INFORMACION").
export const SIN_RESPUESTA = "__sin_respuesta__";
// Cualquier respuesta, sin importar el texto — para el filtro de la tarjeta "Respondieron".
export const CON_RESPUESTA = "__con_respuesta__";
// Sin tarifa de TV asignada — mismo criterio que SIN_RESPUESTA pero para el filtro de tarifa TV.
export const SIN_TV = "__sin_tv__";

// El texto de respuesta llega con el id de campania pegado al final (ej. "SI@68") porque
// promo_whatsapp_sino no tiene columna de campaniaId propia; el REPLACE lo saca del lado SQL.
export function buildDetalleQuery(sucursalClause: string): string {
  return `
    SELECT
      a.conexionId,
      ab.apellido_nombre AS nombre,
      a.destinatario AS telefono,
      a.estadoId,
      ecd.nombre AS estadoNombre,
      a.fechaCreado,
      a.fechaActualizado,
      v.cod_sucursal,
      t1.descripcion AS tarifa,
      t2.descripcion AS tarifa_tv,
      REPLACE(r.respuesta, '@' + CONVERT(varchar, @campaniaId), '') AS respuesta,
      r.fecha AS fechaRespuesta
    FROM CampaniaDetalles a
      INNER JOIN conexiones con ON con.id_conexion = a.conexionId
      INNER JOIN abonados ab ON ab.id_abonado = con.id_abonado
      INNER JOIN v_con_dom v ON v.id_conexion = a.conexionId
      INNER JOIN EstadosCampaniaDetalle ecd ON ecd.id = a.estadoId
      LEFT JOIN tarifas t1 ON t1.id_tarifa = v.tarifa
      LEFT JOIN tarifas t2 ON t2.id_tarifa = v.tarifa_television
      OUTER APPLY (
        SELECT TOP 1 respuesta, fecha FROM promo_whatsapp_sino p
        WHERE p.id_conexion = a.conexionId AND p.respuesta LIKE '%@' + CONVERT(varchar, @campaniaId)
        ORDER BY p.fecha DESC
      ) r
    WHERE a.campaniaId = @campaniaId
      AND v.cod_sucursal ${sucursalClause}
  `;
}

function sucursalClauseFor(sucursalN: number | null, sucursalesBase: number[]): string {
  return sucursalN !== null && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursalParam = req.nextUrl.searchParams.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;
  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = sucursalesPermitidas ?? SUCURSALES_VALIDAS;
  const sucursalClause = sucursalClauseFor(sucursalN, sucursalesBase);

  const campaniaIdParam = req.nextUrl.searchParams.get("campaniaId");

  try {
    const pool = await getPool();

    // ── Modo listado: sin campaniaId, devuelve las campañas recientes para elegir ──
    if (!campaniaIdParam) {
      const result = await pool.request().query(`
        SELECT TOP 40
          c.id, c.nombre, c.descripcion,
          p.nombre AS plantilla,
          ec.nombre AS estado,
          c.fechaCreado, c.fechaActualizado,
          (
            SELECT COUNT(*) FROM CampaniaDetalles cd
            INNER JOIN v_con_dom v ON v.id_conexion = cd.conexionId
            WHERE cd.campaniaId = c.id AND v.cod_sucursal ${sucursalClause}
          ) AS total
        FROM Campanias c
        LEFT JOIN Plantillas p ON p.id = c.plantillaId
        LEFT JOIN EstadosCampania ec ON ec.id = c.estadoId
        ORDER BY c.fechaCreado DESC
      `);
      const campanias = result.recordset as CampaniaListItem[];
      return NextResponse.json({ campanias });
    }

    // ── Modo detalle: una campaña puntual ──
    const campaniaId = parseInt(campaniaIdParam, 10);
    if (isNaN(campaniaId) || campaniaId <= 0)
      return NextResponse.json({ error: "campaniaId inválido" }, { status: 400 });

    const campaniaResult = await pool.request()
      .input("campaniaId", sql.Int, campaniaId)
      .query(`
        SELECT c.id, c.nombre, c.descripcion, p.nombre AS plantilla, ec.nombre AS estado,
          c.fechaCreado, c.fechaActualizado
        FROM Campanias c
        LEFT JOIN Plantillas p ON p.id = c.plantillaId
        LEFT JOIN EstadosCampania ec ON ec.id = c.estadoId
        WHERE c.id = @campaniaId
      `);
    const campania = campaniaResult.recordset[0];
    if (!campania) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

    const detalleResult = await pool.request()
      .input("campaniaId", sql.Int, campaniaId)
      .query(buildDetalleQuery(sucursalClause));
    const rows = detalleResult.recordset as DetalleRow[];
    for (const r of rows) r.estadoNombre = estadoEnvioLabel(r.estadoId, r.estadoNombre);

    const total = rows.length;

    const porEstadoMap = new Map<number, { estadoId: number; nombre: string; cantidad: number }>();
    for (const r of rows) {
      const actual = porEstadoMap.get(r.estadoId);
      if (actual) actual.cantidad += 1;
      else porEstadoMap.set(r.estadoId, { estadoId: r.estadoId, nombre: r.estadoNombre, cantidad: 1 });
    }
    const porEstadoEnvio = [...porEstadoMap.values()].sort((a, b) => a.estadoId - b.estadoId);

    const respondieron = rows.filter((r) => r.respuesta).length;
    const sinRespuesta = total - respondieron;

    const porRespuestaMap = new Map<string, number>();
    for (const r of rows) {
      if (!r.respuesta) continue;
      porRespuestaMap.set(r.respuesta, (porRespuestaMap.get(r.respuesta) ?? 0) + 1);
    }
    const porRespuesta = [...porRespuestaMap.entries()]
      .map(([respuesta, cantidad]) => ({ respuesta, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const porSucursalMap = new Map<number, { cantidad: number; respondieron: number }>();
    for (const r of rows) {
      const actual = porSucursalMap.get(r.cod_sucursal) ?? { cantidad: 0, respondieron: 0 };
      actual.cantidad += 1;
      if (r.respuesta) actual.respondieron += 1;
      porSucursalMap.set(r.cod_sucursal, actual);
    }
    const porSucursal = [...porSucursalMap.entries()]
      .map(([cod, v]) => ({ cod_sucursal: cod, nombre: SUCURSALES[cod] ?? `Suc. ${cod}`, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad);

    // Tarifa de TV asignada a la conexión — ej. la tarifa promocional que se pone cuando el
    // cliente responde "SI" y se le genera la ODS de instalación. Se agrupa por texto exacto
    // (igual que porRespuesta) en vez de un simple "tiene/no tiene" porque distintas tarifas de
    // TV significan cosas distintas (una promo de esta campaña no es lo mismo que un plan viejo).
    const conTv = rows.filter((r) => r.tarifa_tv).length;
    const sinTv = total - conTv;
    const porTarifaTvMap = new Map<string, number>();
    for (const r of rows) {
      if (!r.tarifa_tv) continue;
      porTarifaTvMap.set(r.tarifa_tv, (porTarifaTvMap.get(r.tarifa_tv) ?? 0) + 1);
    }
    const porTarifaTv = [...porTarifaTvMap.entries()]
      .map(([tarifa_tv, cantidad]) => ({ tarifa_tv, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    // Filtros del detalle (server-side: hay campañas con miles de destinatarios, por encima del tope de 500)
    const filtroRespuesta = req.nextUrl.searchParams.get("respuesta");
    const filtroEstadoParam = req.nextUrl.searchParams.get("estadoId");
    const filtroEstadoId = filtroEstadoParam ? parseInt(filtroEstadoParam, 10) : null;
    const filtroTarifaTv = req.nextUrl.searchParams.get("tarifaTv");

    let rowsParaDetalle = rows;
    if (filtroRespuesta === SIN_RESPUESTA) rowsParaDetalle = rowsParaDetalle.filter((r) => !r.respuesta);
    else if (filtroRespuesta === CON_RESPUESTA) rowsParaDetalle = rowsParaDetalle.filter((r) => r.respuesta);
    else if (filtroRespuesta) rowsParaDetalle = rowsParaDetalle.filter((r) => r.respuesta === filtroRespuesta);
    if (filtroEstadoId !== null) rowsParaDetalle = rowsParaDetalle.filter((r) => r.estadoId === filtroEstadoId);
    if (filtroTarifaTv === SIN_TV) rowsParaDetalle = rowsParaDetalle.filter((r) => !r.tarifa_tv);
    else if (filtroTarifaTv) rowsParaDetalle = rowsParaDetalle.filter((r) => r.tarifa_tv === filtroTarifaTv);

    const detalleTotal = rowsParaDetalle.length;
    const detalle = rowsParaDetalle
      .slice()
      .sort((a, b) => new Date(b.fechaActualizado).getTime() - new Date(a.fechaActualizado).getTime())
      .slice(0, 500);

    return NextResponse.json({
      campania,
      total,
      porEstadoEnvio,
      respondieron,
      sinRespuesta,
      porRespuesta,
      conTv,
      sinTv,
      porTarifaTv,
      porSucursal,
      detalle,
      detalleTotal,
    });
  } catch (err: unknown) {
    console.error("[campanias-whatsapp]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
