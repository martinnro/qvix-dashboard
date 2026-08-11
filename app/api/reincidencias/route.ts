import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import sql from "mssql";

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

  let dateFilter: string;
  if (mesAnio) {
    dateFilter = `FORMAT(ih.fecha_carga, 'yyyy-MM') = '${mesAnio.replace(/'/g, "")}'`;
  } else if (anio) {
    dateFilter = `YEAR(ih.fecha_carga) = ${parseInt(anio, 10)}`;
  } else {
    // default: mes anterior
    dateFilter = `ih.fecha_carga >= DATEADD(MONTH, -1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)) AND ih.fecha_carga < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)`;
  }

  // Modo detalle: ?conexion=X → lista individual de incidencias para esa conexión
  const conexionParam = params.get("conexion");
  if (conexionParam) {
    try {
      const pool = await getPool();
      const result = await pool.request()
        .input("conexion", sql.NVarChar(100), conexionParam)
        .query(`
          SELECT
            ih.id_incidencia,
            FORMAT(ih.fecha_carga, 'dd/MM/yyyy HH:mm') AS fecha_carga,
            FORMAT(vos.fecha_reclamo, 'dd/MM/yyyy')    AS fecha_asignacion,
            FORMAT(ISNULL(vos.fecha_solucion, ih.fecha_anulacion), 'dd/MM/yyyy') AS fecha_cierre,
            ih.estado_incidencia,
            ps.problema_descripcion AS problema,
            cu.descripcion          AS cuadrilla,
            CASE
              WHEN vos.fecha_solucion IS NOT NULL
                THEN DATEDIFF(DAY, vos.fecha_reclamo, vos.fecha_solucion)
              WHEN ih.fecha_anulacion IS NOT NULL
                THEN DATEDIFF(DAY, ih.fecha_carga, ih.fecha_anulacion)
              ELSE DATEDIFF(DAY, ih.fecha_carga, GETDATE())
            END AS dias
          FROM incidencias_header ih WITH (NOLOCK)
          JOIN incidencias_detalle id WITH (NOLOCK)
            ON id.id_incidencia = ih.id_incidencia
          LEFT JOIN problemas ps WITH (NOLOCK)
            ON ps.id_problema = id.id_problema
          OUTER APPLY (
            SELECT TOP 1
              o.fecha_reclamo, o.fecha_solucion, o.id_cuadrilla
            FROM v_ordenes_servicios o WITH (NOLOCK)
            WHERE o.id_incidencia = ih.id_incidencia
            ORDER BY o.id_Orden_Servicio DESC
          ) vos
          LEFT JOIN cuadrillas cu WITH (NOLOCK)
            ON cu.id_cuadrilla = vos.id_cuadrilla
          WHERE ih.tipo_incidencia = 2
            AND ih.id_conexion = @conexion
            AND id.cod_sucursal ${sucursalClause}
            AND ${dateFilter}
          ORDER BY ih.fecha_carga DESC
        `);
      return NextResponse.json({ detalles: result.recordset });
    } catch (err: unknown) {
      console.error("[reincidencias/detalle]", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      WITH base AS (
        SELECT
          ih.id_conexion,
          MAX(id.cod_sucursal)            AS cod_sucursal,
          COUNT(*)                         AS total
        FROM incidencias_header ih WITH (NOLOCK)
        JOIN incidencias_detalle id WITH (NOLOCK)
          ON id.id_incidencia = ih.id_incidencia
        WHERE ih.tipo_incidencia = 2
          AND id.cod_sucursal ${sucursalClause}
          AND ${dateFilter}
        GROUP BY ih.id_conexion
        HAVING COUNT(*) >= 2
      ),
      por_problema AS (
        SELECT
          ih.id_conexion,
          id.id_problema,
          ps.problema_descripcion,
          COUNT(*) AS reps,
          ROW_NUMBER() OVER (
            PARTITION BY ih.id_conexion ORDER BY COUNT(*) DESC
          ) AS rn
        FROM incidencias_header ih WITH (NOLOCK)
        JOIN incidencias_detalle id WITH (NOLOCK)
          ON id.id_incidencia = ih.id_incidencia
        LEFT JOIN problemas ps WITH (NOLOCK)
          ON ps.id_problema = id.id_problema
        WHERE ih.tipo_incidencia = 2
          AND id.cod_sucursal ${sucursalClause}
          AND ${dateFilter}
        GROUP BY ih.id_conexion, id.id_problema, ps.problema_descripcion
      )
      SELECT
        b.id_conexion         AS conexion,
        b.cod_sucursal,
        b.total,
        p.reps                AS max_mismo_tipo,
        p.problema_descripcion AS problema_frecuente
      FROM base b
      LEFT JOIN por_problema p ON p.id_conexion = b.id_conexion AND p.rn = 1
      ORDER BY b.total DESC, b.id_conexion
    `);

    return NextResponse.json({ rows: result.recordset });
  } catch (err: unknown) {
    console.error("[reincidencias]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
