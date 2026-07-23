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

  const tipoParam    = req.nextUrl.searchParams.get("tipo");
  const modelosParam = req.nextUrl.searchParams.get("modelos");
  const modelosFiltro = modelosParam ? new Set(modelosParam.split(",")) : null;
  const tipoClause   = tipoParam === "ont" ? "AND d.tipo_dispositivo = 'B'"
    : tipoParam === "deco" ? "AND d.tipo_dispositivo IN ('T', 'M')"
    : "";

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
        s.fecha_carga,
        tms.DESCRIPCION AS estado_stock,
        ult.id_conexion  AS ultima_conexion,
        ts.descripcion   AS ultimo_estado_servicio,
        rm.id_recibo_cm,
        rm.id_order_servicio,
        rm.fecha_carga  AS fecha_carga_recibo,
        rm.tipo_retiro,
        u.nom_usr
      FROM stock s
      JOIN DISPOSITIVOS d ON d.id_dispositivo = s.id_dispositivo
      LEFT JOIN tipo_movimiento_stock tms ON tms.tipo_movimiento_stock = s.tipo_movimiento_stock
      OUTER APPLY (
        SELECT TOP 1 cd.id_conexion, vcd.Estado_Servicio
        FROM conexion_dispostivos cd
        JOIN v_con_dom vcd ON vcd.id_conexion = cd.id_conexion
        WHERE cd.mac = s.mac
        ORDER BY cd.fecha_carga DESC
      ) ult
      LEFT JOIN tipo_estado_servicio ts ON ts.id_estado_servicio = ult.Estado_Servicio
      LEFT JOIN recibos_modem rm ON rm.id_conexion = ult.id_conexion AND rm.mac = s.mac
      LEFT JOIN usuarios u ON u.id_usuario = rm.id_usuario
      WHERE s.mac IS NOT NULL
        AND d.tipo_dispositivo IN ('T', 'M', 'B')
        ${tipoClause}
        AND s.cod_sucursal ${sucursalClause}
        AND NOT EXISTS (
          SELECT 1 FROM conexion_dispostivos cd
          WHERE cd.mac = s.mac AND cd.estado = 0
        )
      ORDER BY s.cod_sucursal, d.nombre_dispositivo, s.fecha_carga DESC
    `);

    const registros = (result.recordset as Record<string, unknown>[])
      .filter((r) => modelosFiltro === null || modelosFiltro.has(String(r.modelo)));

    const rows = registros.map((r) => ({
      Sucursal:               SUCURSALES[Number(r.cod_sucursal)] ?? r.cod_sucursal,
      Tipo:                   r.tipo,
      Modelo:                 r.modelo,
      MAC:                    r.mac,
      MTA_MAC:                r.mta_mac ?? "",
      Fecha_Carga:            r.fecha_carga ? new Date(String(r.fecha_carga)).toLocaleDateString("es-AR") : "",
      Estado_Stock:           r.estado_stock ?? "",
      Ultima_Conexion:        r.ultima_conexion ?? "",
      Ultimo_Estado_Servicio: r.ultimo_estado_servicio ?? "",
      ID_Recibo_CM:           r.id_recibo_cm ?? "",
      ID_Order_Servicio:      r.id_order_servicio ?? "",
      Fecha_Carga_Recibo:     r.fecha_carga_recibo ? new Date(String(r.fecha_carga_recibo)).toLocaleDateString("es-AR") : "",
      Tipo_Retiro:            r.tipo_retiro ?? "",
      Usuario_Recibo:         r.nom_usr ?? "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Stock Dispositivos");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = sucursalN !== null ? (SUCURSALES[sucursalN] ?? sucursalN) : "todas";

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
