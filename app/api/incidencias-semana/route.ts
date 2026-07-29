import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 120_000;

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

  const cacheKey = `semana_${sucursalClause}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const pool = await getPool();

    const [cierreRes, nuevosRes, problemaRes, cuadrillaRes] = await Promise.all([

      // Cerrados esta semana vs anterior + promedio global de cierre (últimos 30 días)
      pool.request().query(`
        SELECT
          SUM(CASE WHEN vos.fecha_solucion >= DATEADD(DAY,-7,GETDATE())  THEN 1 ELSE 0 END) AS esta_semana,
          SUM(CASE WHEN vos.fecha_solucion >= DATEADD(DAY,-14,GETDATE())
                    AND vos.fecha_solucion <  DATEADD(DAY,-7,GETDATE())   THEN 1 ELSE 0 END) AS semana_anterior,
          ROUND(AVG(CASE
            WHEN vos.fecha_solucion >= DATEADD(DAY,-30,GETDATE()) AND vos.fecha_reclamo IS NOT NULL
            THEN CAST(DATEDIFF(DAY, vos.fecha_reclamo, vos.fecha_solucion) AS FLOAT)
          END), 1)                                                                            AS promedio_cierre
        FROM incidencias_header ih WITH (NOLOCK)
        LEFT JOIN incidencias_detalle id WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
        OUTER APPLY (
          SELECT TOP 1 o.fecha_reclamo, o.fecha_solucion
          FROM v_ordenes_servicios o WITH (NOLOCK)
          WHERE o.id_incidencia = ih.id_incidencia AND o.fecha_solucion IS NOT NULL
          ORDER BY o.id_Orden_Servicio DESC
        ) vos
        WHERE ih.tipo_incidencia = 2
          AND vos.fecha_solucion >= DATEADD(DAY,-14,GETDATE())
          AND id.cod_sucursal ${sucursalClause}
      `),

      // Nuevos reclamos esta semana vs anterior
      pool.request().query(`
        SELECT
          SUM(CASE WHEN ih.fecha_carga >= DATEADD(DAY,-7,GETDATE())  THEN 1 ELSE 0 END) AS esta_semana,
          SUM(CASE WHEN ih.fecha_carga >= DATEADD(DAY,-14,GETDATE())
                    AND ih.fecha_carga <  DATEADD(DAY,-7,GETDATE())   THEN 1 ELSE 0 END) AS semana_anterior
        FROM incidencias_header ih WITH (NOLOCK)
        LEFT JOIN incidencias_detalle id WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
        WHERE ih.tipo_incidencia = 2
          AND ih.fecha_carga >= DATEADD(DAY,-14,GETDATE())
          AND id.cod_sucursal ${sucursalClause}
      `),

      // Problema más frecuente esta semana
      pool.request().query(`
        SELECT TOP 1
          ps.problema_descripcion AS problema,
          COUNT(*)                AS cantidad
        FROM incidencias_header ih WITH (NOLOCK)
        LEFT JOIN incidencias_detalle id WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
        LEFT JOIN problemas ps         WITH (NOLOCK) ON ps.id_problema    = id.id_problema
        WHERE ih.tipo_incidencia = 2
          AND ih.fecha_carga >= DATEADD(DAY,-7,GETDATE())
          AND ps.problema_descripcion IS NOT NULL
          AND id.cod_sucursal ${sucursalClause}
        GROUP BY ps.problema_descripcion
        ORDER BY COUNT(*) DESC
      `),

      // Promedio de cierre por cuadrilla (últimos 30 días)
      pool.request().query(`
        SELECT
          cu.descripcion AS cuadrilla,
          ROUND(AVG(CAST(DATEDIFF(DAY, vos.fecha_reclamo, vos.fecha_solucion) AS FLOAT)), 1) AS promedio_dias
        FROM incidencias_header ih WITH (NOLOCK)
        LEFT JOIN incidencias_detalle id WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
        OUTER APPLY (
          SELECT TOP 1 o.fecha_reclamo, o.fecha_solucion, o.id_cuadrilla
          FROM v_ordenes_servicios o WITH (NOLOCK)
          WHERE o.id_incidencia = ih.id_incidencia AND o.fecha_solucion IS NOT NULL
          ORDER BY o.id_Orden_Servicio DESC
        ) vos
        LEFT JOIN cuadrillas cu WITH (NOLOCK) ON cu.id_cuadrilla = vos.id_cuadrilla
        WHERE ih.tipo_incidencia = 2
          AND vos.fecha_solucion >= DATEADD(DAY,-30,GETDATE())
          AND cu.descripcion IS NOT NULL
          AND vos.fecha_reclamo IS NOT NULL
          AND id.cod_sucursal ${sucursalClause}
        GROUP BY cu.descripcion
      `),
    ]);

    const cierre  = cierreRes.recordset[0]  ?? {};
    const nuevos  = nuevosRes.recordset[0]  ?? {};
    const problema = problemaRes.recordset[0] ?? null;

    const cuadrillaPromedios: Record<string, number> = {};
    for (const row of cuadrillaRes.recordset) {
      if (row.cuadrilla && row.promedio_dias != null) {
        cuadrillaPromedios[row.cuadrilla as string] = row.promedio_dias as number;
      }
    }

    const data = {
      cerradosEstaSemana:      cierre.esta_semana      ?? 0,
      cerradosSemanaAnterior:  cierre.semana_anterior  ?? 0,
      promedioCierreGlobal:    cierre.promedio_cierre  ?? null,
      nuevosEstaSemana:        nuevos.esta_semana      ?? 0,
      nuevosSemanaAnterior:    nuevos.semana_anterior  ?? 0,
      problemaFrecuente: problema?.problema
        ? { problema: problema.problema as string, cantidad: problema.cantidad as number }
        : null,
      cuadrillaPromedios,
    };

    _cache.set(cacheKey, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("[incidencias-semana]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
