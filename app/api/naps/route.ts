import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  const sucursal = parseInt(req.nextUrl.searchParams.get("sucursal") ?? "4", 10);
  if (isNaN(sucursal)) return NextResponse.json([]);

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT nap, latitud, longitud, fibra, cod_sucursal
      FROM geo_naps
      WHERE cod_sucursal = ${sucursal}
    `);

    const data = result.recordset
      .map((row: Record<string, unknown>) => ({
        nap:  row.nap,
        fibra: row.fibra,
        cod_sucursal: row.cod_sucursal,
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
