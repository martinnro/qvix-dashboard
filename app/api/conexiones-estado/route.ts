import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

export async function GET(req: NextRequest) {
  const sucursal = req.nextUrl.searchParams.get("sucursal");
  const sucursalNum = sucursal ? parseInt(sucursal, 10) : null;

  const sucursalClause = sucursalNum && !isNaN(sucursalNum) && SUCURSALES_VALIDAS.includes(sucursalNum)
    ? `AND vcd.cod_sucursal = ${sucursalNum}`
    : `AND vcd.cod_sucursal IN (${SUCURSALES_VALIDAS.join(",")})`;

  const query = `
    SELECT
      vcd.Estado_Servicio,
      ts.descripcion AS nombre,
      COUNT(*) AS cantidad
    FROM v_con_dom vcd
    LEFT JOIN tipo_estado_servicio ts ON ts.id_estado_servicio = vcd.Estado_Servicio
    WHERE 1=1
      ${sucursalClause}
    GROUP BY vcd.Estado_Servicio, ts.descripcion
    HAVING COUNT(*) > 0
    ORDER BY cantidad DESC
  `;

  try {
    const pool = await getPool();
    const result = await pool.request().query(query);
    return NextResponse.json(result.recordset);
  } catch (err: unknown) {
    console.error("[conexiones-estado]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
