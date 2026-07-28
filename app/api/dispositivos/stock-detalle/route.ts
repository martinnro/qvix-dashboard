import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

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

  const tipoParam = req.nextUrl.searchParams.get("tipo");
  const tipoClause = tipoParam === "ont"  ? "AND d.tipo_dispositivo = 'B'"
    : tipoParam === "deco" ? "AND d.tipo_dispositivo IN ('T', 'M')"
    : "";

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        s.cod_sucursal,
        CASE d.tipo_dispositivo WHEN 'B' THEN 'ONT' ELSE 'Deco/STB' END AS tipo,
        d.nombre_dispositivo AS modelo,
        s.mac,
        s.mta_mac,
        rem_ent.fecha_carga,
        tms.DESCRIPCION AS estado_stock,
        ult.id_conexion  AS ultima_conexion,
        ts.descripcion   AS ultimo_estado_servicio,
        teg.descripcion  AS estado_dispositivo,
        rm.id_recibo_cm,
        rm.id_order_servicio,
        rm.fecha_carga  AS fecha_carga_recibo,
        rm.tipo_retiro,
        u.nom_usr
      FROM stock s
      JOIN DISPOSITIVOS d ON d.id_dispositivo = s.id_dispositivo
      LEFT JOIN tipo_movimiento_stock tms ON tms.tipo_movimiento_stock = s.tipo_movimiento_stock
      OUTER APPLY (
        SELECT TOP 1 cd.id_conexion, vcd.Estado_Servicio, cd.estado AS estado_dispositivo
        FROM conexion_dispostivos cd
        JOIN v_con_dom vcd ON vcd.id_conexion = cd.id_conexion
        WHERE cd.mac = s.mac
        ORDER BY cd.fecha_carga DESC
      ) ult
      LEFT JOIN tipo_estado_general teg ON teg.tipo_estado = ult.estado_dispositivo
      OUTER APPLY (
        SELECT TOP 1 rd.fecha_carga
        FROM remitos_detalle rd
        WHERE rd.mac = s.mac
          AND rd.cod_sucursal = s.cod_sucursal
          AND rd.tipo_remito LIKE 'ENT%'
        ORDER BY rd.fecha_carga DESC
      ) rem_ent
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

    const rows = (result.recordset as Record<string, unknown>[]).map((r) => ({
      sucursal:               SUCURSALES[Number(r.cod_sucursal)] ?? String(r.cod_sucursal),
      tipo:                   r.tipo,
      modelo:                 r.modelo,
      mac:                    r.mac ?? "",
      mta_mac:                r.mta_mac ?? "",
      fecha_carga:            r.fecha_carga ? new Date(String(r.fecha_carga)).toLocaleDateString("es-AR") : "",
      estado_stock:           r.estado_stock ?? "",
      ultima_conexion:        r.ultima_conexion ?? "",
      ultimo_estado_servicio: r.ultimo_estado_servicio ?? "",
      estado_dispositivo:     r.estado_dispositivo ?? "",
      id_recibo_cm:           r.id_recibo_cm ?? "",
      id_order_servicio:      r.id_order_servicio ?? "",
      fecha_carga_recibo:     r.fecha_carga_recibo ? new Date(String(r.fecha_carga_recibo)).toLocaleDateString("es-AR") : "",
      tipo_retiro:            r.tipo_retiro ?? "",
      nom_usr:                r.nom_usr ?? "",
    }));

    return NextResponse.json(rows);
  } catch (err: unknown) {
    console.error("[dispositivos/stock-detalle]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
