import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

const SUCURSALES: Record<number, string> = {
  4: "Valle Viejo",
  1: "Chumbicha",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

function buildEstadosIn(raw: string | null): string {
  const defaults = [3, 6];
  if (!raw) return defaults.join(",");
  const parsed = raw
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0 && n < 1000);
  return (parsed.length > 0 ? parsed : defaults).join(",");
}

function buildSucursalFilter(raw: string | null, allSucursales: string): string {
  if (!raw) return allSucursales;
  const parsed = raw
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
  return parsed.length > 0 ? parsed.join(",") : allSucursales;
}

export async function GET(req: NextRequest) {
  const estadosIn = buildEstadosIn(req.nextUrl.searchParams.get("estados"));
  const allSucursalesIn = Object.keys(SUCURSALES).join(",");
  const sucursalesIn = buildSucursalFilter(req.nextUrl.searchParams.get("sucursal"), allSucursalesIn);

  const globalQuery = `
    WITH
    has_cubiware AS (
      SELECT DISTINCT cd.id_conexion
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d ON cd.id_dispositivo = d.id_dispositivo
      JOIN tipo_dispositivos td ON d.tipo_dispositivo = td.tipo_dispositivo
      JOIN v_con_dom vcd ON cd.id_conexion = vcd.id_conexion
      WHERE (td.tipo_dispositivo = 'T' OR td.tipo_dispositivo = 'M')
        AND cd.estado = 0
        AND vcd.Estado_Servicio IN (${estadosIn})
        AND vcd.cod_sucursal IN (${sucursalesIn})
        AND d.tipo_cuenta_usuario = 'CUBIWARE'
    ),
    has_qvix AS (
      SELECT DISTINCT cd.id_conexion
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d ON cd.id_dispositivo = d.id_dispositivo
      JOIN tipo_dispositivos td ON d.tipo_dispositivo = td.tipo_dispositivo
      JOIN v_con_dom vcd ON cd.id_conexion = vcd.id_conexion
      WHERE (td.tipo_dispositivo = 'T' OR td.tipo_dispositivo = 'M')
        AND cd.estado = 0
        AND vcd.Estado_Servicio IN (${estadosIn})
        AND vcd.cod_sucursal IN (${sucursalesIn})
        AND d.tipo_cuenta_usuario = 'QVIX'
    ),
    has_app AS (
      SELECT DISTINCT vcd.id_conexion
      FROM v_con_dom vcd
      JOIN facturas_cuentas fcu ON fcu.id_conexion = vcd.id_conexion
      JOIN facturas_conceptos fc ON fc.cod_concepto = fcu.cod_concepto
      WHERE fc.tipo_producto = 'V'
        AND fc.tipo_agrupador = 'APP'
        AND vcd.estado_servicio IN (${estadosIn})
        AND vcd.cod_sucursal IN (${sucursalesIn})
        AND fcu.estado = 0
    ),
    all_tv AS (
      SELECT id_conexion FROM has_cubiware
      UNION SELECT id_conexion FROM has_qvix
      UNION SELECT id_conexion FROM has_app
    ),
    tv_classified AS (
      SELECT
        tv.id_conexion,
        CASE WHEN hc.id_conexion IS NOT NULL THEN 1 ELSE 0 END AS is_cubiware,
        CASE WHEN hq.id_conexion IS NOT NULL THEN 1 ELSE 0 END AS is_qvix,
        CASE WHEN ha.id_conexion IS NOT NULL THEN 1 ELSE 0 END AS is_app
      FROM all_tv tv
      LEFT JOIN has_cubiware hc ON tv.id_conexion = hc.id_conexion
      LEFT JOIN has_qvix    hq ON tv.id_conexion = hq.id_conexion
      LEFT JOIN has_app     ha ON tv.id_conexion = ha.id_conexion
    )
    SELECT
      (SELECT COUNT(DISTINCT id_conexion) FROM v_con_dom
       WHERE Estado_Servicio IN (${estadosIn}) AND cod_sucursal IN (${sucursalesIn})) AS total_clientes,
      COUNT(*)                                                                         AS total_tv,
      SUM(CASE WHEN is_cubiware=1 OR is_qvix=1               THEN 1 ELSE 0 END)       AS con_deco,
      SUM(CASE WHEN is_cubiware=0 AND is_qvix=0              THEN 1 ELSE 0 END)       AS solo_app,
      SUM(CASE WHEN is_cubiware=1 AND is_qvix=0 AND is_app=0 THEN 1 ELSE 0 END)      AS iptv,
      SUM(CASE WHEN is_cubiware=1 AND is_qvix=0 AND is_app=1 THEN 1 ELSE 0 END)      AS iptv_app,
      SUM(CASE WHEN is_cubiware=1 AND is_qvix=1 AND is_app=0 THEN 1 ELSE 0 END)      AS iptv_ott,
      SUM(CASE WHEN is_cubiware=1 AND is_qvix=1 AND is_app=1 THEN 1 ELSE 0 END)      AS iptv_ott_app,
      SUM(CASE WHEN is_cubiware=0 AND is_qvix=1 AND is_app=0 THEN 1 ELSE 0 END)      AS ott,
      SUM(CASE WHEN is_cubiware=0 AND is_qvix=1 AND is_app=1 THEN 1 ELSE 0 END)      AS ott_app,
      (SELECT ISNULL(COUNT(*), 0)
       FROM conexion_dispostivos cd2
       JOIN DISPOSITIVOS d2 ON cd2.id_dispositivo = d2.id_dispositivo
       JOIN tipo_dispositivos td2 ON d2.tipo_dispositivo = td2.tipo_dispositivo
       JOIN v_con_dom vcd2 ON cd2.id_conexion = vcd2.id_conexion
       WHERE (td2.tipo_dispositivo = 'T' OR td2.tipo_dispositivo = 'M')
         AND cd2.estado = 0
         AND vcd2.Estado_Servicio IN (${estadosIn})
         AND vcd2.cod_sucursal IN (${sucursalesIn})
      ) AS total_decos_stb
    FROM tv_classified
  `;

  const sucursalQuery = `
    WITH
    has_cubiware AS (
      SELECT DISTINCT cd.id_conexion
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d ON cd.id_dispositivo = d.id_dispositivo
      JOIN tipo_dispositivos td ON d.tipo_dispositivo = td.tipo_dispositivo
      JOIN v_con_dom vcd ON cd.id_conexion = vcd.id_conexion
      WHERE (td.tipo_dispositivo = 'T' OR td.tipo_dispositivo = 'M')
        AND cd.estado = 0
        AND vcd.Estado_Servicio IN (${estadosIn})
        AND d.tipo_cuenta_usuario = 'CUBIWARE'
    ),
    has_qvix AS (
      SELECT DISTINCT cd.id_conexion
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d ON cd.id_dispositivo = d.id_dispositivo
      JOIN tipo_dispositivos td ON d.tipo_dispositivo = td.tipo_dispositivo
      JOIN v_con_dom vcd ON cd.id_conexion = vcd.id_conexion
      WHERE (td.tipo_dispositivo = 'T' OR td.tipo_dispositivo = 'M')
        AND cd.estado = 0
        AND vcd.Estado_Servicio IN (${estadosIn})
        AND d.tipo_cuenta_usuario = 'QVIX'
    ),
    has_app AS (
      SELECT DISTINCT vcd.id_conexion
      FROM v_con_dom vcd
      JOIN facturas_cuentas fcu ON fcu.id_conexion = vcd.id_conexion
      JOIN facturas_conceptos fc ON fc.cod_concepto = fcu.cod_concepto
      WHERE fc.tipo_producto = 'V'
        AND fc.tipo_agrupador = 'APP'
        AND vcd.estado_servicio IN (${estadosIn})
        AND fcu.estado = 0
    ),
    all_tv AS (
      SELECT id_conexion FROM has_cubiware
      UNION SELECT id_conexion FROM has_qvix
      UNION SELECT id_conexion FROM has_app
    ),
    clientes_por_sucursal AS (
      SELECT cod_sucursal, COUNT(DISTINCT id_conexion) AS total_clientes
      FROM v_con_dom
      WHERE Estado_Servicio IN (${estadosIn})
        AND cod_sucursal IN (${allSucursalesIn})
      GROUP BY cod_sucursal
    ),
    iptv_por_sucursal AS (
      SELECT vcd.cod_sucursal,
        COUNT(DISTINCT cd.id_conexion) AS clientes_iptv,
        COUNT(*) AS decos_iptv
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d ON cd.id_dispositivo = d.id_dispositivo
      JOIN tipo_dispositivos td ON d.tipo_dispositivo = td.tipo_dispositivo
      JOIN v_con_dom vcd ON cd.id_conexion = vcd.id_conexion
      WHERE (td.tipo_dispositivo = 'T' OR td.tipo_dispositivo = 'M')
        AND cd.estado = 0
        AND vcd.Estado_Servicio IN (${estadosIn})
        AND vcd.cod_sucursal IN (${allSucursalesIn})
        AND d.tipo_cuenta_usuario = 'CUBIWARE'
      GROUP BY vcd.cod_sucursal
    ),
    ott_por_sucursal AS (
      SELECT vcd.cod_sucursal,
        COUNT(DISTINCT cd.id_conexion) AS clientes_ott,
        COUNT(*) AS decos_ott
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d ON cd.id_dispositivo = d.id_dispositivo
      JOIN tipo_dispositivos td ON d.tipo_dispositivo = td.tipo_dispositivo
      JOIN v_con_dom vcd ON cd.id_conexion = vcd.id_conexion
      WHERE (td.tipo_dispositivo = 'T' OR td.tipo_dispositivo = 'M')
        AND cd.estado = 0
        AND vcd.Estado_Servicio IN (${estadosIn})
        AND vcd.cod_sucursal IN (${allSucursalesIn})
        AND d.tipo_cuenta_usuario = 'QVIX'
      GROUP BY vcd.cod_sucursal
    ),
    tv_por_sucursal AS (
      SELECT DISTINCT tv.id_conexion, vcd.cod_sucursal
      FROM all_tv tv
      JOIN v_con_dom vcd ON tv.id_conexion = vcd.id_conexion
      WHERE vcd.Estado_Servicio IN (${estadosIn})
        AND vcd.cod_sucursal IN (${allSucursalesIn})
    )
    SELECT
      c.cod_sucursal,
      c.total_clientes,
      COUNT(DISTINCT t.id_conexion)       AS total_tv,
      ISNULL(i.clientes_iptv, 0)          AS clientes_iptv,
      ISNULL(i.decos_iptv, 0)             AS decos_iptv,
      ISNULL(o.clientes_ott, 0)           AS clientes_ott,
      ISNULL(o.decos_ott, 0)              AS decos_ott
    FROM clientes_por_sucursal c
    LEFT JOIN tv_por_sucursal   t ON t.cod_sucursal = c.cod_sucursal
    LEFT JOIN iptv_por_sucursal i ON i.cod_sucursal = c.cod_sucursal
    LEFT JOIN ott_por_sucursal  o ON o.cod_sucursal = c.cod_sucursal
    GROUP BY c.cod_sucursal, c.total_clientes,
             i.clientes_iptv, i.decos_iptv, o.clientes_ott, o.decos_ott
    ORDER BY c.total_clientes DESC
  `;

  const estadosQuery = `
    SELECT id_estado_servicio AS id, descripcion AS nombre
    FROM tipo_estado_servicio
    ORDER BY id_estado_servicio
  `;

  try {
    const pool = await getPool();
    const [globalRes, sucursalRes, estadosRes] = await Promise.all([
      pool.request().query(globalQuery),
      pool.request().query(sucursalQuery),
      pool.request().query(estadosQuery),
    ]);

    const global = globalRes.recordset[0];
    const totalTV = Number(global.total_tv);
    const totalClientes = Number(global.total_clientes);

    const sucursales = sucursalRes.recordset.map((row: any) => ({
      cod_sucursal:  row.cod_sucursal,
      nombre:        SUCURSALES[row.cod_sucursal] ?? `Sucursal ${row.cod_sucursal}`,
      total_clientes: Number(row.total_clientes),
      total_tv:      Number(row.total_tv),
      porcentaje:    row.total_clientes > 0 ? Math.round((row.total_tv / row.total_clientes) * 100) : 0,
      clientes_iptv: Number(row.clientes_iptv),
      decos_iptv:    Number(row.decos_iptv),
      clientes_ott:  Number(row.clientes_ott),
      decos_ott:     Number(row.decos_ott),
    }));

    return NextResponse.json({
      total_clientes: totalClientes,
      total_tv: totalTV,
      posicionamiento: totalClientes > 0 ? Math.round((totalTV / totalClientes) * 100) : 0,
      con_deco: Number(global.con_deco),
      solo_app: Number(global.solo_app),
      total_decos_stb: Number(global.total_decos_stb),
      tipos: {
        iptv:         Number(global.iptv),
        iptv_app:     Number(global.iptv_app),
        iptv_ott:     Number(global.iptv_ott),
        iptv_ott_app: Number(global.iptv_ott_app),
        ott:          Number(global.ott),
        ott_app:      Number(global.ott_app),
      },
      sucursales,
      estados_disponibles: estadosRes.recordset,
    });
  } catch (err: unknown) {
    console.error("[clientes-tv]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
