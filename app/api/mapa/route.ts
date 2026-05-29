import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

function buildIn(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0 && n < 100000);
  return parsed.length > 0 ? parsed.join(",") : fallback;
}

export async function GET(req: NextRequest) {
  const sucursal       = parseInt(req.nextUrl.searchParams.get("sucursal") ?? "4", 10);
  const estadosIn      = buildIn(req.nextUrl.searchParams.get("estados"), "3,6");
  const barriosIn      = buildIn(req.nextUrl.searchParams.get("barrios"), null as unknown as string);
  const bajaModo = req.nextUrl.searchParams.get("bajaModo"); // "mas12" | "menos12"

  if (isNaN(sucursal)) return NextResponse.json([]);

  const barrioClause = barriosIn ? `AND vcd.cod_barrio IN (${barriosIn})` : "";

  const estadosArr = estadosIn.split(",").map(Number);
  const filtrarBaja = bajaModo && estadosArr.includes(7);

  const bajaComparacion = bajaModo === "mas12" ? "<" : ">=";
  const bajaClause = filtrarBaja
    ? `AND (
        vcd.Estado_Servicio <> 7
        OR EXISTS (
          SELECT 1 FROM bajas b
          WHERE b.id_conexion = c.id_conexion
            AND b.tipo_baja = 'SERV'
            AND b.tipo_serv = 'I'
            AND b.fecha_baja ${bajaComparacion} DATEADD(MONTH, -12, GETDATE())
        )
      )`
    : "";

  const query = `
    SELECT
      c.id_conexion,
      vcd.Estado_Servicio,
      ts.descripcion AS estado_nombre,
      TRY_CAST(i2.latitud  AS FLOAT) AS latitud,
      TRY_CAST(i2.longitud AS FLOAT) AS longitud,
      'N' + cr.nap_primer_nivel + '.' + cr.nap_segundo_nivel AS nap,
      b_last.fecha_baja
    FROM Clientes c
    LEFT JOIN v_con_dom vcd           ON vcd.id_conexion = c.id_conexion
    LEFT JOIN Conexiones c2           ON c2.id_conexion = c.id_conexion
    LEFT JOIN inmuebles i2            ON i2.id_inmueble = c2.id_inmueble
    LEFT JOIN tipo_estado_servicio ts ON ts.id_estado_servicio = vcd.Estado_Servicio
    LEFT JOIN Conexiones_referencia cr ON cr.id_conexion = c.id_conexion
    OUTER APPLY (
      SELECT TOP 1 b.fecha_baja
      FROM bajas b
      WHERE b.id_conexion = c.id_conexion
        AND b.tipo_baja = 'SERV'
        AND b.tipo_serv = 'I'
      ORDER BY b.fecha_baja DESC
    ) b_last
    WHERE vcd.cod_sucursal = ${sucursal}
      AND vcd.Estado_Servicio IN (${estadosIn})
      ${barrioClause}
      ${bajaClause}
      AND i2.latitud  IS NOT NULL
      AND i2.longitud IS NOT NULL
      AND i2.latitud  <> ''
      AND i2.longitud <> ''
      AND TRY_CAST(i2.latitud  AS FLOAT) IS NOT NULL
      AND TRY_CAST(i2.longitud AS FLOAT) IS NOT NULL
      AND TRY_CAST(i2.latitud  AS FLOAT) <> 0
      AND TRY_CAST(i2.longitud AS FLOAT) <> 0
  `;

  try {
    const pool = await getPool();
    const result = await pool.request().query(query);
    return NextResponse.json(result.recordset);
  } catch (err: unknown) {
    console.error("[mapa]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
