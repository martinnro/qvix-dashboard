import { NextRequest, NextResponse } from "next/server";
import { getPool, resetPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES: Record<number, string> = {
  0: "Central",
  1: "Chumbicha",
  3: "SonoVision",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};
const SUCURSALES_VALIDAS = Object.keys(SUCURSALES).map(Number);

function validDate(s: string | null, fallback: string): string {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
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
  const sucursalClause =
    sucursalN !== null && sucursalesBase.includes(sucursalN)
      ? `= ${sucursalN}`
      : `IN (${sucursalesBase.join(",")})`;

  const hoy = new Date().toISOString().slice(0, 10);
  const inicioAnio = `${new Date().getFullYear()}-01-01`;
  const desde = validDate(req.nextUrl.searchParams.get("desde"), inicioAnio);
  const hasta = validDate(req.nextUrl.searchParams.get("hasta"), hoy);

  const baseFrom = `
    FROM v_con_dom v
    INNER JOIN conexion_dispostivos cd ON cd.id_conexion = v.id_conexion
    INNER JOIN DISPOSITIVOS d ON d.id_dispositivo = cd.id_dispositivo AND d.tipo_dispositivo IN ('T','M','B')
    INNER JOIN tarifas t ON t.id_tarifa = v.tarifa
    INNER JOIN v_ordenes_servicios vods ON vods.id_Orden_Servicio = cd.id_orden_servicio
    INNER JOIN incidencias_header ih ON ih.id_incidencia = vods.id_incidencia
    INNER JOIN Tipo_incidencias ti ON ti.tipo_incidencia = ih.tipo_incidencia
    INNER JOIN tipo_subtipo_incidencias tsi ON tsi.subtipo_inicidencia = ih.subtipo_incidencia
      AND tsi.tipo_incidencia = ih.tipo_incidencia
    LEFT JOIN tipo_motivos_estado tme ON tme.id_motivo = ih.id_motivo
  `;
  const baseWhere = `
    WHERE cd.estado = 0
      AND tme.id_motivo = 14
      AND CONVERT(date, vods.fecha_solucion) >= '${desde}'
      AND CONVERT(date, vods.fecha_solucion) <= '${hasta}'
      AND v.cod_sucursal ${sucursalClause}
  `;

  try {
    const pool = await getPool();

    const modeloRes = await pool.request().query(`
      SET ARITHABORT ON;
      SELECT d.nombre_dispositivo AS modelo, d.tipo_dispositivo AS tipo, COUNT(*) AS cantidad
      ${baseFrom}
      ${baseWhere}
      GROUP BY d.nombre_dispositivo, d.tipo_dispositivo
      ORDER BY cantidad DESC
    `);
    const mesRes = await pool.request().query(`
      SET ARITHABORT ON;
      SELECT FORMAT(vods.fecha_solucion, 'yyyy-MM') AS mes, COUNT(*) AS cantidad
      ${baseFrom}
      ${baseWhere}
      GROUP BY FORMAT(vods.fecha_solucion, 'yyyy-MM')
      ORDER BY mes
    `);
    const subtipoRes = await pool.request().query(`
      SET ARITHABORT ON;
      SELECT tsi.descripcion AS subtipo, COUNT(*) AS cantidad
      ${baseFrom}
      ${baseWhere}
      GROUP BY tsi.descripcion
      ORDER BY cantidad DESC
    `);
    const detalleRes = await pool.request().query(`
      SET ARITHABORT ON;
      SELECT TOP 500
        v.cod_sucursal,
        d.nombre_dispositivo AS modelo,
        d.tipo_dispositivo AS tipo,
        cd.mac,
        cd.id_conexion,
        CONVERT(varchar, vods.fecha_reclamo, 103) AS fecha_reclamo,
        CONVERT(varchar, vods.fecha_solucion, 103) AS fecha_solucion,
        ts.descripcion AS estado_servicio,
        tsi.descripcion AS subtipo,
        vods.cuadrilla
      ${baseFrom}
      LEFT JOIN tipo_estado_servicio ts ON ts.id_estado_servicio = v.Estado_Servicio
      ${baseWhere}
      ORDER BY vods.fecha_solucion DESC
    `);
    const sucursalRes = await pool.request().query(`
      SET ARITHABORT ON;
      SELECT v.cod_sucursal, COUNT(*) AS cantidad
      ${baseFrom}
      ${baseWhere}
      GROUP BY v.cod_sucursal
      ORDER BY cantidad DESC
    `);
    const cuadrillaRes = await pool.request().query(`
      SET ARITHABORT ON;
      SELECT vods.cuadrilla, COUNT(*) AS cantidad
      ${baseFrom}
      ${baseWhere}
        AND vods.cuadrilla IS NOT NULL
      GROUP BY vods.cuadrilla
      ORDER BY cantidad DESC
    `);

    const pendientesWhere = `
      WHERE vods.fecha_solucion IS NULL
        AND v.cod_sucursal ${sucursalClause}
    `;
    const pendientesCountRes = await pool.request().query(`
      SET ARITHABORT ON;
      SELECT COUNT(*) AS total
      ${baseFrom}
      ${pendientesWhere}
    `);
    const pendientesDetalleRes = await pool.request().query(`
      SET ARITHABORT ON;
      SELECT TOP 500
        v.cod_sucursal,
        d.nombre_dispositivo AS modelo,
        d.tipo_dispositivo AS tipo,
        cd.mac,
        cd.id_conexion,
        CONVERT(varchar, vods.fecha_reclamo, 103) AS fecha_reclamo,
        DATEDIFF(day, vods.fecha_reclamo, GETDATE()) AS dias_demora,
        tsi.descripcion AS subtipo,
        vods.cuadrilla
      ${baseFrom}
      ${pendientesWhere}
      ORDER BY dias_demora DESC
    `);

    const porModelo = (modeloRes.recordset as Record<string, unknown>[]).map((r) => ({
      modelo:   String(r.modelo ?? ""),
      tipo:     String(r.tipo ?? ""),
      cantidad: Number(r.cantidad),
    }));
    const porMes = (mesRes.recordset as Record<string, unknown>[]).map((r) => ({
      mes:      String(r.mes ?? ""),
      cantidad: Number(r.cantidad),
    }));
    const porSubtipo = (subtipoRes.recordset as Record<string, unknown>[]).map((r) => ({
      subtipo:  String(r.subtipo ?? ""),
      cantidad: Number(r.cantidad),
    }));
    const detalle = (detalleRes.recordset as Record<string, unknown>[]).map((r) => ({
      sucursal:        SUCURSALES[Number(r.cod_sucursal)] ?? String(r.cod_sucursal),
      modelo:          String(r.modelo ?? ""),
      mac:             String(r.mac ?? ""),
      id_conexion:     r.id_conexion != null ? Number(r.id_conexion) : null,
      fecha_reclamo:   String(r.fecha_reclamo ?? ""),
      fecha_solucion:  String(r.fecha_solucion ?? ""),
      estado_servicio: String(r.estado_servicio ?? ""),
      subtipo:         String(r.subtipo ?? ""),
      cuadrilla:       r.cuadrilla != null ? String(r.cuadrilla) : null,
    }));
    const porSucursal = (sucursalRes.recordset as Record<string, unknown>[]).map((r) => ({
      cod_sucursal: Number(r.cod_sucursal),
      nombre:       SUCURSALES[Number(r.cod_sucursal)] ?? `Suc. ${r.cod_sucursal}`,
      cantidad:     Number(r.cantidad),
    }));
    const porCuadrilla = (cuadrillaRes.recordset as Record<string, unknown>[]).map((r) => ({
      cuadrilla: String(r.cuadrilla ?? ""),
      cantidad:  Number(r.cantidad),
    }));
    const pendientesTotal = Number((pendientesCountRes.recordset[0] as Record<string, unknown>)?.total ?? 0);
    const pendientesDetalle = (pendientesDetalleRes.recordset as Record<string, unknown>[]).map((r) => ({
      sucursal:      SUCURSALES[Number(r.cod_sucursal)] ?? String(r.cod_sucursal),
      modelo:        String(r.modelo ?? ""),
      tipo:          String(r.tipo ?? ""),
      mac:           String(r.mac ?? ""),
      id_conexion:   r.id_conexion != null ? Number(r.id_conexion) : null,
      fecha_reclamo: String(r.fecha_reclamo ?? ""),
      dias_demora:   Number(r.dias_demora ?? 0),
      subtipo:       String(r.subtipo ?? ""),
      cuadrilla:     r.cuadrilla != null ? String(r.cuadrilla) : null,
    }));

    const total = porModelo.reduce((s, r) => s + r.cantidad, 0);

    return NextResponse.json({ porModelo, porMes, porSubtipo, porSucursal, porCuadrilla, pendientesTotal, pendientesDetalle, detalle, total });
  } catch (err: unknown) {
    console.error("[instalaciones]", err);
    await resetPool();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
