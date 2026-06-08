import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import * as XLSX from "xlsx";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};
const SUCURSALES_VALIDAS = Object.keys(SUCURSALES).map(Number);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursalParam = req.nextUrl.searchParams.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;

  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = sucursalesPermitidas ?? SUCURSALES_VALIDAS;
  const sucursalClause = sucursalN && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        s.cod_sucursal,
        d.nombre_dispositivo AS modelo,
        CASE d.tipo_dispositivo
          WHEN 'B' THEN 'ONT'
          ELSE 'Deco/STB'
        END AS tipo,
        s.mac,
        s.mta_mac,
        s.fecha_carga
      FROM stock s
      JOIN DISPOSITIVOS d ON d.id_dispositivo = s.id_dispositivo
      WHERE s.cantidad_actual = 1
        AND s.mac IS NOT NULL
        AND d.tipo_dispositivo IN ('T', 'M', 'B')
        AND s.cod_sucursal ${sucursalClause}
        AND NOT EXISTS (
          SELECT 1 FROM conexion_dispostivos cd
          WHERE cd.mac = s.mac AND cd.estado = 0
        )
      ORDER BY s.cod_sucursal, d.nombre_dispositivo, s.fecha_carga DESC
    `);

    const rows = result.recordset.map((r: Record<string, unknown>) => ({
      Sucursal:    SUCURSALES[Number(r.cod_sucursal)] ?? r.cod_sucursal,
      Tipo:        r.tipo,
      Modelo:      r.modelo,
      MAC:         r.mac,
      MTA_MAC:     r.mta_mac ?? "",
      Fecha_Carga: r.fecha_carga ? new Date(String(r.fecha_carga)).toLocaleDateString("es-AR") : "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Stock Dispositivos");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = sucursalN ? (SUCURSALES[sucursalN] ?? sucursalN) : "todas";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock-dispositivos-${nombreSucursal}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export/dispositivos]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
