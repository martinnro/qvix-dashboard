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

  const mesAnio  = params.get("mes_anio");
  const anio     = params.get("anio");
  const estado   = params.get("estado");
  const durMin   = params.get("dur_min");
  const durMax   = params.get("dur_max");
  const offset   = parseInt(params.get("offset") ?? "0", 10);
  const limit    = params.get("limit") === "all" ? 99999 : 50;

  // Filtros sobre la base (antes del cálculo de duración)
  const baseExtras: string[] = [];
  if (mesAnio) baseExtras.push(`FORMAT(ih.fecha_carga, 'yyyy-MM') = '${mesAnio.replace(/'/g, "")}'`);
  else if (anio) baseExtras.push(`YEAR(ih.fecha_carga) = ${parseInt(anio, 10)}`);
  if (estado === "1") baseExtras.push(`ih.estado_incidencia = 1`);
  else if (estado === "2") baseExtras.push(`ih.estado_incidencia = 2`);
  else if (estado === "cerrado") baseExtras.push(`ih.estado_incidencia NOT IN (1, 2) AND ih.fecha_anulacion IS NULL`);
  else if (estado === "anulado") baseExtras.push(`ih.fecha_anulacion IS NOT NULL`);

  const baseWhere = baseExtras.length > 0 ? `AND ${baseExtras.join(" AND ")}` : "";

  // Filtros sobre la duración calculada (aplicados en la CTE exterior)
  const durExtras: string[] = [];
  if (durMin) durExtras.push(`dias >= ${parseInt(durMin, 10)}`);
  if (durMax) durExtras.push(`dias <= ${parseInt(durMax, 10)}`);
  const durWhere = durExtras.length > 0 ? `WHERE ${durExtras.join(" AND ")}` : "";

  // CTE base con duración real (asignación → cierre)
  const cte = `
    WITH base AS (
      SELECT
        ih.id_conexion                                                          AS conexion,
        id.cod_sucursal,
        ih.estado_incidencia,
        CONVERT(VARCHAR, vos.fecha_reclamo, 5)                                  AS fecha_carga,
        CONVERT(VARCHAR, vos.fecha_solucion, 5)                                 AS fecha_solucion,
        CONVERT(VARCHAR, ih.fecha_anulacion, 5)                                 AS fecha_anulacion,
        DATEDIFF(DAY, vos.fecha_reclamo,
          ISNULL(vos.fecha_solucion, ISNULL(ih.fecha_anulacion, GETDATE()))
        )                                                                       AS dias,
        FORMAT(ih.fecha_carga, 'yyyy-MM')                                       AS mes_anio,
        ih.fecha_carga                                                          AS fecha_sort,
        ps.problema_descripcion                                                 AS problema,
        cu.descripcion                                                          AS cuadrilla
      FROM incidencias_header ih WITH (NOLOCK)
      LEFT JOIN incidencias_detalle id WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
      OUTER APPLY (
        SELECT TOP 1 o.fecha_reclamo, o.fecha_solucion, o.id_cuadrilla
        FROM v_ordenes_servicios o WITH (NOLOCK)
        WHERE o.id_incidencia = ih.id_incidencia
        ORDER BY o.id_Orden_Servicio DESC
      ) vos
      LEFT JOIN problemas ps  WITH (NOLOCK) ON ps.id_problema  = id.id_problema
      LEFT JOIN cuadrillas cu WITH (NOLOCK) ON cu.id_cuadrilla = vos.id_cuadrilla
      WHERE ih.tipo_incidencia = 2
        AND ih.fecha_carga >= '2025-01-01'
        AND id.cod_sucursal ${sucursalClause}
        ${baseWhere}
    )
  `;

  try {
    const pool = await getPool();

    const [dataResult, countResult] = await Promise.all([
      pool.request().query(`
        ${cte}
        SELECT * FROM base
        ${durWhere}
        ORDER BY fecha_sort DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `),
      pool.request().query(`
        ${cte}
        SELECT COUNT(*) AS total FROM base
        ${durWhere}
      `),
    ]);

    return NextResponse.json({
      rows: dataResult.recordset,
      total: countResult.recordset[0]?.total ?? 0,
      offset,
      limit,
    });
  } catch (err: unknown) {
    console.error("[incidencias-historial]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
