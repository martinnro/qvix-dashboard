import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [0, 1, 4, 5, 6, 7, 8];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursalParam = req.nextUrl.searchParams.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;

  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = sucursalesPermitidas ?? SUCURSALES_VALIDAS;
  const sucursalClause = sucursalN !== null && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        ih.id_conexion                                              AS conexion,
        id.cod_sucursal,
        ih.estado_incidencia,
        CONCAT('N', cr.nap_primer_nivel, '.', cr.nap_segundo_nivel) AS nap,
        CONVERT(VARCHAR, ih.fecha_carga, 5)                        AS fecha,
        DATEDIFF(DAY, ih.fecha_carga, GETDATE())                   AS dias,
        ps.problema_descripcion                                     AS problema,
        cu.descripcion                                              AS cuadrilla
      FROM incidencias_header ih WITH (NOLOCK)
      LEFT JOIN incidencias_detalle id WITH (NOLOCK) ON id.id_incidencia = ih.id_incidencia
      LEFT JOIN Ordenes_Servicios os   WITH (NOLOCK) ON os.id_incidencia = ih.id_incidencia
      LEFT JOIN problemas ps           WITH (NOLOCK) ON ps.id_problema   = id.id_problema
      LEFT JOIN cuadrillas cu          WITH (NOLOCK) ON cu.id_cuadrilla  = os.id_cuadrilla
      LEFT JOIN conexiones_referencia cr WITH (NOLOCK) ON cr.id_conexion = ih.id_conexion
      WHERE ih.tipo_incidencia = 2
        AND ih.estado_incidencia IN (1, 2)
        AND id.cod_sucursal ${sucursalClause}
      ORDER BY dias DESC
    `);

    return NextResponse.json(result.recordset);
  } catch (err: unknown) {
    console.error("[incidencias-activas]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
