import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  const sucursal = parseInt(req.nextUrl.searchParams.get("sucursal") ?? "4", 10);
  if (isNaN(sucursal)) return NextResponse.json([]);

  try {
    const pool = await getPool();
    const [napsResult, cntResult] = await Promise.all([
      pool.request().query(`
        SELECT nap, latitud, longitud, fibra
        FROM geo_naps
        WHERE cod_sucursal = ${sucursal}
      `),
      pool.request().query(`
        SELECT
          'N' + cr.nap_primer_nivel + '.' + cr.nap_segundo_nivel AS NAP,
          COUNT(*) AS Cantidad
        FROM v_con_dom vcd
        LEFT JOIN Conexiones_referencia cr ON vcd.id_conexion = cr.id_conexion
        WHERE vcd.cod_sucursal = ${sucursal}
          AND vcd.Estado_Servicio IN (3, 6, 61, 62)
          AND cr.nap_primer_nivel IS NOT NULL
        GROUP BY cr.nap_primer_nivel, cr.nap_segundo_nivel
      `).catch(() => ({ recordset: [] as Record<string, unknown>[] })),
    ]);

    const countMap = new Map<string, number>();
    for (const row of cntResult.recordset as Record<string, unknown>[]) {
      countMap.set(String(row.NAP), Number(row.Cantidad));
    }

    const data = napsResult.recordset
      .map((row: Record<string, unknown>) => ({
        nap:      String(row.nap),
        fibra:    row.fibra,
        cantidad: countMap.get(String(row.nap)) ?? 0,
        latitud:  parseFloat(String(row.latitud).replace(",", ".")),
        longitud: parseFloat(String(row.longitud).replace(",", ".")),
      }))
      .filter((r: { latitud: number; longitud: number }) => !isNaN(r.latitud) && !isNaN(r.longitud) && r.latitud !== 0);

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("[naps]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
