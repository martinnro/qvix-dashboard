import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [0, 1, 4, 5, 6, 7, 8];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const params = req.nextUrl.searchParams;

  const sucursalParam = params.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;

  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = sucursalesPermitidas ?? SUCURSALES_VALIDAS;
  const sucursalClause = sucursalN !== null && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;

  // Filtros opcionales
  const mesAnio   = params.get("mes_anio");  // "2025-03"
  const estado    = params.get("estado");    // "1" | "2" | "cerrado"
  const problema  = params.get("problema");  // texto parcial
  const durMin    = params.get("dur_min");   // días
  const durMax    = params.get("dur_max");   // días
  const offset    = parseInt(params.get("offset") ?? "0", 10);
  const limit     = params.get("limit") === "all" ? 99999 : 50;

  // WHERE extra
  const extras: string[] = [];
  if (mesAnio) extras.push(`FORMAT(ih.fecha_carga, 'yyyy-MM') = '${mesAnio.replace(/'/g, "")}'`);
  if (estado === "1") extras.push(`ih.estado_incidencia = 1`);
  else if (estado === "2") extras.push(`ih.estado_incidencia = 2`);
  else if (estado === "cerrado") extras.push(`ih.estado_incidencia NOT IN (1, 2)`);
  if (problema) extras.push(`ps.problema_descripcion LIKE '%${problema.replace(/'/g, "").substring(0, 80)}%'`);
  if (durMin) extras.push(`DATEDIFF(DAY, ih.fecha_carga, GETDATE()) >= ${parseInt(durMin, 10)}`);
  if (durMax) extras.push(`DATEDIFF(DAY, ih.fecha_carga, GETDATE()) <= ${parseInt(durMax, 10)}`);

  const whereExtra = extras.length > 0 ? `AND ${extras.join(" AND ")}` : "";

  try {
    const pool = await getPool();

    const [dataResult, countResult] = await Promise.all([
      pool.request().query(`
        SELECT
          ih.id_conexion                                              AS conexion,
          id.cod_sucursal,
          ih.estado_incidencia,
          CONVERT(VARCHAR, ih.fecha_carga, 5)                        AS fecha_carga,
          DATEDIFF(DAY, ih.fecha_carga, GETDATE())                   AS dias,
          FORMAT(ih.fecha_carga, 'yyyy-MM')                          AS mes_anio,
          ps.problema_descripcion                                     AS problema,
          cu.descripcion                                              AS cuadrilla
        FROM incidencias_header ih WITH (NOLOCK)
        LEFT JOIN incidencias_detalle id  WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
        LEFT JOIN Ordenes_Servicios os    WITH (NOLOCK) ON os.id_incidencia = ih.id_incidencia
        LEFT JOIN problemas ps            WITH (NOLOCK) ON ps.id_problema   = id.id_problema
        LEFT JOIN cuadrillas cu           WITH (NOLOCK) ON cu.id_cuadrilla  = os.id_cuadrilla
        WHERE ih.tipo_incidencia = 2
          AND ih.fecha_carga >= '2025-01-01'
          AND id.cod_sucursal ${sucursalClause}
          ${whereExtra}
        ORDER BY ih.fecha_carga DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `),
      pool.request().query(`
        SELECT COUNT(*) AS total
        FROM incidencias_header ih WITH (NOLOCK)
        LEFT JOIN incidencias_detalle id  WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
        LEFT JOIN Ordenes_Servicios os    WITH (NOLOCK) ON os.id_incidencia = ih.id_incidencia
        LEFT JOIN problemas ps            WITH (NOLOCK) ON ps.id_problema   = id.id_problema
        WHERE ih.tipo_incidencia = 2
          AND ih.fecha_carga >= '2025-01-01'
          AND id.cod_sucursal ${sucursalClause}
          ${whereExtra}
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
