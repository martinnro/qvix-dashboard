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

  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        ih.id_incidencia,
        CONVERT(VARCHAR(19), ih.fecha_reclamo, 20)  AS fecha_reclamo,
        ps.problema_descripcion                      AS problema_mini,
        CONVERT(VARCHAR(19), ih.fecha_solucion, 20)  AS fecha_solucion,
        vos_cu.cuadrilla                             AS ls_nombre_cuadrilla,
        b.nom_barrio,
        ih.id_conexion,
        ta.asistencia                                AS solucion,
        CASE ih.cod_sucursal
          WHEN 1 THEN 'Chumbicha'
          WHEN 4 THEN 'Valle Viejo'
          WHEN 5 THEN 'Tinogasta'
          WHEN 6 THEN 'Rodeo'
          WHEN 7 THEN 'La Puerta'
          WHEN 8 THEN 'Fiambalá'
          ELSE 'Sucursal ' + CAST(ih.cod_sucursal AS VARCHAR)
        END AS descripcion
      FROM incidencias_header ih WITH (NOLOCK)
      OUTER APPLY (
        SELECT TOP 1 vos.cuadrilla
        FROM v_ordenes_servicios vos WITH (NOLOCK)
        WHERE vos.id_incidencia = ih.id_incidencia
        ORDER BY vos.id_Orden_Servicio DESC
      ) vos_cu
      OUTER APPLY (
        SELECT TOP 1 id2.id_problema
        FROM incidencias_detalle id2 WITH (NOLOCK)
        WHERE id2.id_incidencia = ih.id_incidencia
      ) det
      OUTER APPLY (
        SELECT TOP 1 is2.tipo_asistencia
        FROM incidencias_soluciones is2 WITH (NOLOCK)
        WHERE is2.id_incidencia = ih.id_incidencia
      ) sol
      LEFT JOIN problemas ps       WITH (NOLOCK) ON ps.id_problema     = det.id_problema
      LEFT JOIN tipo_asistencia ta WITH (NOLOCK) ON ta.tipo_asistencia = sol.tipo_asistencia
      LEFT JOIN v_con_dom vcd      WITH (NOLOCK) ON vcd.id_conexion    = ih.id_conexion
      LEFT JOIN barrios b          WITH (NOLOCK) ON b.cod_barrio       = vcd.cod_barrio
      WHERE ih.tipo_incidencia = 2
        AND ih.fecha_reclamo >= '2025-01-01'
        AND ih.cod_sucursal IN (${sucursalesBase.join(",")})
        AND sol.tipo_asistencia IS NOT NULL
      ORDER BY ih.fecha_reclamo ASC
    `);

    return NextResponse.json({ rows: result.recordset });
  } catch (err: unknown) {
    console.error("[reclamos GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
