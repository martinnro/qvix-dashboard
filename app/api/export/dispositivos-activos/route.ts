import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import * as XLSX from "xlsx";

const SUCURSALES: Record<number, string> = {
  0: "Central",
  1: "Chumbicha",
  3: "SonoVision",
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
  const sucursalClause = sucursalN !== null && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;

  const tipoParam    = req.nextUrl.searchParams.get("tipo"); // "ont" | "deco"
  const modelosParam = req.nextUrl.searchParams.get("modelos"); // "ModeloA,ModeloB"
  const modelosFiltro = modelosParam ? new Set(modelosParam.split(",")) : null;
  const tipoClause   = tipoParam === "ont" ? "AND d.tipo_dispositivo = 'B'"
    : tipoParam === "deco" ? "AND d.tipo_dispositivo IN ('T', 'M')"
    : "";

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        vcd.cod_sucursal,
        CASE d.tipo_dispositivo
          WHEN 'B' THEN 'ONT'
          ELSE 'Deco/STB'
        END AS tipo,
        d.nombre_dispositivo AS modelo,
        cd.mac,
        cd.id_conexion,
        ts.descripcion AS estado_servicio,
        cd.fecha_carga AS fecha_asignacion
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d ON d.id_dispositivo = cd.id_dispositivo
      JOIN v_con_dom vcd ON vcd.id_conexion = cd.id_conexion
      LEFT JOIN tipo_estado_servicio ts ON ts.id_estado_servicio = vcd.Estado_Servicio
      WHERE cd.estado = 0
        AND d.tipo_dispositivo IN ('T', 'M', 'B')
        ${tipoClause}
        AND vcd.cod_sucursal ${sucursalClause}
      ORDER BY vcd.cod_sucursal, d.nombre_dispositivo
    `);

    const registros = (result.recordset as Record<string, unknown>[])
      .filter((r) => modelosFiltro === null || modelosFiltro.has(String(r.modelo)));

    const rows = registros.map((r) => ({
      Sucursal:         SUCURSALES[Number(r.cod_sucursal)] ?? r.cod_sucursal,
      Tipo:             r.tipo,
      Modelo:           r.modelo,
      MAC:              r.mac ?? "",
      ID_Conexion:      r.id_conexion,
      Estado_Servicio:  r.estado_servicio ?? "",
      Fecha_Asignacion: r.fecha_asignacion ? new Date(String(r.fecha_asignacion)).toLocaleDateString("es-AR") : "",
    }));

    // Resumen agrupado por sucursal + tipo + estado_servicio + modelo
    type ResumenKey = string;
    type ResumenRow = { Sucursal: string; Tipo: string; Estado_Servicio: string; Modelo: string; Cantidad: number };
    const resumenMap = new Map<ResumenKey, ResumenRow>();
    for (const r of registros) {
      const suc = SUCURSALES[Number(r.cod_sucursal)] ?? String(r.cod_sucursal);
      const tipo = String(r.tipo);
      const est = String(r.estado_servicio ?? "Sin estado");
      const mod = String(r.modelo);
      const key = `${suc}|${tipo}|${est}|${mod}`;
      if (!resumenMap.has(key)) resumenMap.set(key, { Sucursal: suc, Tipo: tipo, Estado_Servicio: est, Modelo: mod, Cantidad: 0 });
      resumenMap.get(key)!.Cantidad += 1;
    }
    const resumenRows = Array.from(resumenMap.values())
      .sort((a, b) => a.Sucursal.localeCompare(b.Sucursal) || a.Tipo.localeCompare(b.Tipo) || a.Estado_Servicio.localeCompare(b.Estado_Servicio) || b.Cantidad - a.Cantidad);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Activos en Conexiones");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), "Resumen");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = sucursalN !== null ? (SUCURSALES[sucursalN] ?? sucursalN) : "todas";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="activos-dispositivos-${nombreSucursal}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export/dispositivos-activos]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
