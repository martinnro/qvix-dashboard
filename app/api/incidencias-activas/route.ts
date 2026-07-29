import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

const _cache = new Map<string, { data: unknown[]; ts: number }>();
const CACHE_TTL = 60_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursalParam = req.nextUrl.searchParams.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;

  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = (sucursalesPermitidas ?? SUCURSALES_VALIDAS).filter((s) => SUCURSALES_VALIDAS.includes(s));
  const sucursalClause = sucursalN !== null && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;

  const cacheKey = sucursalClause;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        ih.id_conexion                                                          AS conexion,
        id.cod_sucursal,
        ih.estado_incidencia,
        CONCAT('N', cr.nap_primer_nivel, '.', cr.nap_segundo_nivel)             AS nap,
        CONVERT(VARCHAR, ih.fecha_carga, 5)                                     AS fecha,
        DATEDIFF(DAY, ih.fecha_carga, GETDATE())                                AS dias,
        -- Delay: desde creación hasta asignación (fecha_reclamo del OS más reciente)
        CASE WHEN vos.fecha_reclamo IS NOT NULL
             THEN DATEDIFF(DAY, ih.fecha_carga, vos.fecha_reclamo)
             ELSE NULL
        END                                                                     AS dias_hasta_asignacion,
        ps.problema_descripcion                                                  AS problema,
        cu.descripcion                                                           AS cuadrilla
      FROM incidencias_header ih WITH (NOLOCK)
      LEFT JOIN incidencias_detalle id     WITH (NOLOCK) ON id.id_incidencia  = ih.id_incidencia
      OUTER APPLY (
        SELECT TOP 1 o.fecha_reclamo, o.id_cuadrilla
        FROM v_ordenes_servicios o WITH (NOLOCK)
        WHERE o.id_incidencia = ih.id_incidencia
        ORDER BY o.id_Orden_Servicio DESC
      ) vos
      LEFT JOIN problemas ps               WITH (NOLOCK) ON ps.id_problema    = id.id_problema
      LEFT JOIN cuadrillas cu              WITH (NOLOCK) ON cu.id_cuadrilla   = vos.id_cuadrilla
      LEFT JOIN conexiones_referencia cr   WITH (NOLOCK) ON cr.id_conexion    = ih.id_conexion
      WHERE ih.tipo_incidencia = 2
        AND ih.estado_incidencia IN (1, 2)
        AND id.cod_sucursal ${sucursalClause}
      ORDER BY dias DESC
    `);

    _cache.set(cacheKey, { data: result.recordset, ts: Date.now() });
    return NextResponse.json(result.recordset);
  } catch (err: unknown) {
    console.error("[incidencias-activas]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
