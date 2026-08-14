import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const params = req.nextUrl.searchParams;

  const sucursalParam = params.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;

  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = (sucursalesPermitidas ?? SUCURSALES_VALIDAS).filter((s) => SUCURSALES_VALIDAS.includes(s));
  const sucursalClause = sucursalN !== null && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;

  const mesAnio = params.get("mes_anio");
  const anio    = params.get("anio");
  const material = params.get("material");
  const modo    = params.get("modo");

  const dateExtras: string[] = [];
  if (mesAnio) dateExtras.push(`FORMAT(vos.fecha_solucion, 'yyyy-MM') = '${mesAnio.replace(/'/g, "")}'`);
  else if (anio) dateExtras.push(`YEAR(vos.fecha_solucion) = ${parseInt(anio, 10)}`);
  const dateWhere = dateExtras.length > 0 ? `AND ${dateExtras.join(" AND ")}` : "";

  const baseWhere = `
    vos.cod_sucursal        ${sucursalClause}
    AND vos.estado_ods      IN (1, 2, 4)
    AND vos.estado_incidencia IN (1, 2, 3)
    AND vos.fecha_solucion  IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM incidencias_soluciones is2 WITH (NOLOCK)
      WHERE is2.id_incidencia = vos.id_incidencia
    )
    ${dateWhere}
  `;

  try {
    const pool = await getPool();

    // ── Modo detalle: conexiones de un material específico ──
    if (material) {
      const matSafe = material.replace(/'/g, "''");
      const result = await pool.request().query(`
        SELECT
          ih.id_conexion                              AS conexion,
          CONVERT(VARCHAR, vos.fecha_solucion, 5)     AS fecha_cierre,
          vos.cod_sucursal,
          im.cantidad,
          t.descripcion                               AS tarifa,
          deco.tipo_deco
        FROM v_ordenes_servicios vos WITH (NOLOCK)
        INNER JOIN incidencias_materiales im WITH (NOLOCK)
          ON im.id_incidencia = vos.id_incidencia
        INNER JOIN DISPOSITIVOS d WITH (NOLOCK)
          ON d.id_dispositivo = im.id_dispositivo
        INNER JOIN incidencias_header ih WITH (NOLOCK)
          ON ih.id_incidencia = vos.id_incidencia
        LEFT JOIN v_con_dom vcd WITH (NOLOCK)
          ON vcd.id_conexion = ih.id_conexion
        LEFT JOIN tarifas t WITH (NOLOCK)
          ON t.id_tarifa = vcd.tarifa
        OUTER APPLY (
          SELECT TOP 1
            CASE
              WHEN d2.alias = 'COLSECOR' OR d2.nombre_dispositivo LIKE '%BOLD%'
              THEN 'Colsecor'
              WHEN d2.alias IS NOT NULL AND LEN(LTRIM(d2.alias)) > 0
              THEN LTRIM(RTRIM(d2.alias))
              ELSE 'OTT'
            END AS tipo_deco
          FROM conexion_dispostivos cd WITH (NOLOCK)
          INNER JOIN DISPOSITIVOS d2 WITH (NOLOCK)
            ON d2.id_dispositivo = cd.id_dispositivo
          WHERE cd.id_conexion = ih.id_conexion
            AND cd.estado = 0
            AND (d2.nombre_dispositivo LIKE '%STB%' OR d2.alias = 'COLSECOR')
          ORDER BY
            CASE WHEN d2.alias = 'COLSECOR' OR d2.nombre_dispositivo LIKE '%BOLD%' THEN 0 ELSE 1 END,
            cd.fecha_carga DESC
        ) deco
        WHERE ${baseWhere}
          AND d.nombre_dispositivo = '${matSafe}'
        ORDER BY vos.fecha_solucion DESC
      `);
      return NextResponse.json({ rows: result.recordset });
    }

    // ── Modo estadísticas: totales por material × mes ──
    if (modo === "estadisticas") {
      const estadAnio = anio ? parseInt(anio, 10) : new Date().getFullYear();
      const result = await pool.request().query(`
        SELECT
          d.nombre_dispositivo                              AS material,
          FORMAT(vos.fecha_solucion, 'yyyy-MM')            AS mes,
          SUM(im.cantidad)                                  AS total_unidades,
          SUM(SUM(im.cantidad)) OVER (
            PARTITION BY d.nombre_dispositivo
          )                                                 AS total_material
        FROM v_ordenes_servicios vos WITH (NOLOCK)
        INNER JOIN incidencias_materiales im WITH (NOLOCK)
          ON im.id_incidencia = vos.id_incidencia
        INNER JOIN DISPOSITIVOS d WITH (NOLOCK)
          ON d.id_dispositivo = im.id_dispositivo
        WHERE vos.cod_sucursal ${sucursalClause}
          AND vos.estado_ods        IN (1, 2, 4)
          AND vos.estado_incidencia IN (1, 2, 3)
          AND vos.fecha_solucion    IS NOT NULL
          AND YEAR(vos.fecha_solucion) = ${estadAnio}
          AND EXISTS (
            SELECT 1 FROM incidencias_soluciones is2 WITH (NOLOCK)
            WHERE is2.id_incidencia = vos.id_incidencia
          )
        GROUP BY d.nombre_dispositivo, FORMAT(vos.fecha_solucion, 'yyyy-MM')
        ORDER BY total_material DESC, material, mes
      `);
      return NextResponse.json({ rows: result.recordset, anio: estadAnio });
    }

    // ── Modo resumen (default) ──
    const result = await pool.request().query(`
      SELECT
        d.nombre_dispositivo                    AS material,
        SUM(im.cantidad)                        AS total_unidades,
        COUNT(DISTINCT vos.id_incidencia)       AS cantidad_ordenes
      FROM v_ordenes_servicios vos WITH (NOLOCK)
      INNER JOIN incidencias_materiales im WITH (NOLOCK)
        ON im.id_incidencia = vos.id_incidencia
      INNER JOIN DISPOSITIVOS d WITH (NOLOCK)
        ON d.id_dispositivo = im.id_dispositivo
      WHERE ${baseWhere}
      GROUP BY d.nombre_dispositivo
      ORDER BY SUM(im.cantidad) DESC
    `);
    return NextResponse.json({ rows: result.recordset });

  } catch (err: unknown) {
    console.error("[materiales-historial]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
