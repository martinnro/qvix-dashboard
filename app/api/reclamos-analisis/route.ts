import { NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursalesBase = (sucursalesPermitidas ?? SUCURSALES_VALIDAS).filter((s) =>
    SUCURSALES_VALIDAS.includes(s)
  );
  const sucursalClause = `IN (${sucursalesBase.join(",")})`;

  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        ih.id_incidencia,
        ih.id_conexion                                AS conexion,
        id.cod_sucursal,
        id.id_problema,
        ih.estado_incidencia,
        ps.problema_descripcion                       AS problema,
        id.problema_detalle,
        cu.descripcion                                AS cuadrilla,
        ih.id_usuario                                 AS usuario_id,
        u.desc_usr                                    AS usuario_carga,
        ih.observaciones,
        ih.observacion_solucion                       AS obs_cierre,
        sol.solucion,
        CONVERT(VARCHAR, ih.fecha_carga, 5)           AS fecha,
        DATEDIFF(DAY, ih.fecha_carga, GETDATE())      AS dias,
        CASE
          WHEN ih.estado_incidencia >= 3 AND vos.fecha_solucion IS NOT NULL
          THEN DATEDIFF(DAY, ih.fecha_carga, vos.fecha_solucion)
          ELSE DATEDIFF(DAY, ih.fecha_carga, GETDATE())
        END                                           AS dias_resolucion
      FROM incidencias_header ih WITH (NOLOCK)
      LEFT JOIN incidencias_detalle id   WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
      OUTER APPLY (
        SELECT TOP 1 o.id_cuadrilla, o.fecha_solucion
        FROM v_ordenes_servicios o WITH (NOLOCK)
        WHERE o.id_incidencia = ih.id_incidencia
        ORDER BY o.id_Orden_Servicio DESC
      ) vos
      OUTER APPLY (
        SELECT TOP 1 ta.asistencia AS solucion
        FROM incidencias_soluciones is2 WITH (NOLOCK)
        LEFT JOIN tipo_asistencia ta WITH (NOLOCK) ON ta.tipo_asistencia = is2.tipo_asistencia
        WHERE is2.id_incidencia = ih.id_incidencia
        ORDER BY is2.fecha_carga DESC
      ) sol
      LEFT JOIN problemas ps             WITH (NOLOCK) ON ps.id_problema  = id.id_problema
      LEFT JOIN cuadrillas cu            WITH (NOLOCK) ON cu.id_cuadrilla = vos.id_cuadrilla
      LEFT JOIN usuarios u               WITH (NOLOCK) ON u.id_usuario    = ih.id_usuario
      WHERE ih.tipo_incidencia = 2
        AND ih.fecha_carga >= DATEADD(DAY, -10, GETDATE())
        AND id.cod_sucursal ${sucursalClause}
      ORDER BY ih.fecha_carga DESC
    `);

    const rows = result.recordset;

    const materialesMap: Record<number, Array<{ material: string; cantidad: number }>> = {};

    if (rows.length > 0) {
      const allIds = rows.map((r) => r.id_incidencia as number);
      const matResult = await pool.request().query(`
        SELECT
          im.id_incidencia,
          d.nombre_dispositivo  AS material,
          SUM(im.cantidad)      AS cantidad
        FROM incidencias_materiales im WITH (NOLOCK)
        INNER JOIN DISPOSITIVOS d WITH (NOLOCK) ON d.id_dispositivo = im.id_dispositivo
        WHERE im.id_incidencia IN (${allIds.join(",")})
        GROUP BY im.id_incidencia, d.nombre_dispositivo
        HAVING SUM(im.cantidad) > 0
        ORDER BY im.id_incidencia, SUM(im.cantidad) DESC
      `);
      for (const m of matResult.recordset) {
        if (!materialesMap[m.id_incidencia]) materialesMap[m.id_incidencia] = [];
        materialesMap[m.id_incidencia].push({ material: m.material, cantidad: m.cantidad });
      }
    }

    // Conteo mensual por conexión para detectar reincidencias
    const mesMap = new Map<number, { total: number; byProblema: Map<number | null, number> }>();
    if (rows.length > 0) {
      const uniqueConexiones = [...new Set(rows.map((r) => Number(r.conexion)))];
      const mesResult = await pool.request().query(`
        SELECT ih.id_conexion, id.id_problema, COUNT(*) AS cnt
        FROM incidencias_header ih WITH (NOLOCK)
        LEFT JOIN incidencias_detalle id WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
        WHERE ih.tipo_incidencia = 2
          AND ih.fecha_carga >= DATEADD(DAY, 1-DAY(GETDATE()), CAST(GETDATE() AS DATE))
          AND ih.id_conexion IN (${uniqueConexiones.join(",")})
        GROUP BY ih.id_conexion, id.id_problema
      `);
      for (const m of mesResult.recordset) {
        const conn = Number(m.id_conexion);
        if (!mesMap.has(conn)) mesMap.set(conn, { total: 0, byProblema: new Map() });
        const entry = mesMap.get(conn)!;
        entry.total += m.cnt;
        entry.byProblema.set(m.id_problema ?? null, (entry.byProblema.get(m.id_problema ?? null) ?? 0) + m.cnt);
      }
    }

    return NextResponse.json(
      rows.map((r) => {
        const conn = Number(r.conexion);
        const mesInfo = mesMap.get(conn);
        return {
          ...r,
          materiales: materialesMap[r.id_incidencia] ?? [],
          reclamos_mes: mesInfo?.total ?? 1,
          reincidencia_mismo_problema: mesInfo?.byProblema.get(r.id_problema ?? null) ?? 1,
        };
      })
    );
  } catch (err: unknown) {
    console.error("[reclamos-analisis]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
