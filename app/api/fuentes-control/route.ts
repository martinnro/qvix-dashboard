import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const fechaDesde = params.get("fecha_desde") ?? "";
  const fechaHasta = params.get("fecha_hasta") ?? "";
  const tieneFuente = params.get("tiene_fuente") ?? ""; // "SI" | "NO" | ""

  const fechaDesdeClause = fechaDesde ? `AND CONVERT(DATE, vos.fecha_reclamo) >= '${fechaDesde}'` : "";
  const fechaHastaClause = fechaHasta ? `AND CONVERT(DATE, vos.fecha_reclamo) <= '${fechaHasta}'` : "";

  const query = `
    SELECT
        vcd.id_conexion,
        vos.id_Orden_Servicio,
        tes.descripcion                          AS Estado_Servicio,
        p2.problema_descripcion,
        ta.asistencia,
        CASE
            WHEN SUM(CASE WHEN im.id_dispositivo = 342 THEN 1 ELSE 0 END) > 0
            THEN 'SI' ELSE 'NO'
        END                                      AS Tiene_Fuente_12V,
        STUFF((
            SELECT DISTINCT ', ' + d2.nombre_dispositivo
            FROM incidencias_materiales im2
            JOIN DISPOSITIVOS d2 ON d2.id_dispositivo = im2.id_dispositivo
            WHERE im2.id_incidencia = ih.id_incidencia
              AND im2.id_dispositivo <> 342
            FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Otros_Materiales,
        CONVERT(DATE, vos.fecha_reclamo)         AS fecha_reclamo,
        CONVERT(DATE, vos.fecha_solucion)        AS fecha_solucion,
        tme.descripcion                          AS Motivo_Estado,
        DATEDIFF(DAY, vos.fecha_reclamo, GETDATE()) AS Dias
    FROM v_ordenes_servicios vos
    INNER JOIN (
        SELECT vo.id_conexion, MAX(vo.id_Orden_Servicio) AS max_id_Orden_Servicio
        FROM v_ordenes_servicios vo
        LEFT JOIN incidencias_soluciones is2 ON is2.id_incidencia = vo.id_incidencia
        WHERE (vo.subtipo_inicidencia = 1 AND vo.tipo_incidencia = 2)
          AND (vo.estado_ods IN (1, 2, 4))
          AND (vo.estado_incidencia IN (1, 2, 3))
          AND (is2.tipo_asistencia IN (57, 37, 115))
          AND vo.cod_sucursal = 4
        GROUP BY vo.id_conexion
    ) max_vos ON vos.id_Orden_Servicio = max_vos.max_id_Orden_Servicio
    LEFT JOIN v_con_dom vcd              ON vcd.id_conexion = vos.id_conexion
    LEFT JOIN tipo_estado_servicio tes   ON tes.id_estado_servicio = vcd.Estado_Servicio
    LEFT JOIN incidencias_header ih      ON ih.id_incidencia = vos.id_incidencia
    LEFT JOIN tipo_motivos_estado tme    ON tme.id_motivo = ih.id_motivo
    LEFT JOIN incidencias_soluciones is2 ON is2.id_incidencia = ih.id_incidencia
    LEFT JOIN tipo_asistencia ta         ON ta.tipo_asistencia = is2.tipo_asistencia
    LEFT JOIN incidencias_materiales im  ON im.id_incidencia = ih.id_incidencia
    LEFT JOIN incidencias_detalle id2    ON id2.id_incidencia = ih.id_incidencia
    LEFT JOIN problemas p2               ON p2.id_problema = id2.id_problema
    WHERE vos.cod_sucursal = 4
      AND (vos.subtipo_inicidencia = 1 AND vos.tipo_incidencia = 2)
      AND (vos.estado_ods IN (1, 2, 4))
      AND (vos.estado_incidencia IN (1, 2, 3))
      AND (is2.tipo_asistencia IN (57, 37, 115))
      ${fechaDesdeClause}
      ${fechaHastaClause}
    GROUP BY
        vcd.id_conexion, vos.id_Orden_Servicio, tes.descripcion, p2.problema_descripcion,
        is2.tipo_asistencia, ta.asistencia, ih.id_incidencia,
        vos.fecha_reclamo, vos.fecha_solucion, tme.descripcion
    ORDER BY vos.id_Orden_Servicio DESC
  `;

  try {
    const pool = await getPool();
    const result = await pool.request().query(query);

    let rows: Record<string, unknown>[] = result.recordset;

    // Filtro tiene_fuente en memoria (ya que es un campo calculado)
    if (tieneFuente === "SI" || tieneFuente === "NO") {
      rows = rows.filter((r) => r.Tiene_Fuente_12V === tieneFuente);
    }

    return NextResponse.json(rows);
  } catch (err: unknown) {
    console.error("[fuentes-control]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
