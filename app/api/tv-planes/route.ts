import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};
const SUCURSALES_VALIDAS = Object.keys(SUCURSALES).map(Number);

function buildEstadosIn(raw: string | null): string {
  const defaults = [3, 6];
  if (!raw) return defaults.join(",");
  const parsed = raw
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0 && n < 1000);
  return (parsed.length > 0 ? parsed : defaults).join(",");
}

interface TvRow {
  id_conexion: number;
  cod_sucursal: number;
  decos_iptv: number;
  decos_ott: number;
  plan_base: string | null;
  abono_base: number;
  bonif_base: number;
  base_bonificado: number;
  tiene_hbo: number;
  neto_hbo: number;
  hbo_bonificado: number;
  tiene_univ: number;
  neto_univ: number;
  univ_bonificado: number;
  tiene_futbol: number;
  neto_futbol: number;
  futbol_bonificado: number;
  tiene_app: number;
  neto_app: number;
  total_neto: number;
}

function statPack(rows: TvRow[], tieneField: keyof TvRow, bonifField: keyof TvRow) {
  const con = rows.filter((r) => Number(r[tieneField]) === 1);
  const bonificado = con.filter((r) => Number(r[bonifField]) === 1).length;
  return { tiene: con.length, bonificado, paga: con.length - bonificado };
}

export function buildQuery(estadosIn: string, sucursalClause: string): string {
  return `
    WITH filtro AS (
      SELECT id_conexion, cod_sucursal
      FROM v_con_dom
      WHERE Estado_Servicio IN (${estadosIn})
        AND cod_sucursal    ${sucursalClause}
    ),
    decos AS (
      SELECT cd.id_conexion,
        SUM(CASE WHEN d.tipo_cuenta_usuario = 'CUBIWARE' THEN 1 ELSE 0 END) AS decos_iptv,
        SUM(CASE WHEN d.tipo_cuenta_usuario = 'QVIX'     THEN 1 ELSE 0 END) AS decos_ott
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d       ON d.id_dispositivo    = cd.id_dispositivo
      JOIN tipo_dispositivos td ON td.tipo_dispositivo = d.tipo_dispositivo
      WHERE cd.estado = 0
        AND td.tipo_dispositivo IN ('T','M')
        AND d.tipo_cuenta_usuario IN ('CUBIWARE','QVIX')
      GROUP BY cd.id_conexion
    ),
    video AS (
      SELECT fcu.id_conexion,
        MAX(CASE WHEN fc.tipo_agrupador = 'TV' AND fc.operacion = '+' THEN fc.Descripcion END) AS plan_base,
        SUM(CASE WHEN fc.tipo_agrupador = 'TV' THEN fcu.monto ELSE 0 END) AS abono_base,
        -- BONITV/BONIDP es una bolsa compartida de descuentos: algunos conceptos (ej. "3 PANT. ANDROID")
        -- en realidad son descuentos de la app, no del plan base, y se excluyen de aca.
        SUM(CASE WHEN fc.tipo_agrupador IN ('BONITV','BONIDP') AND fc.Descripcion NOT LIKE '%ANDROID%'
                 THEN fcu.monto ELSE 0 END) AS bonif_base,
        MAX(CASE WHEN fc.tipo_agrupador = 'HBO'  THEN 1 ELSE 0 END)                        AS tiene_hbo,
        SUM(CASE WHEN fc.tipo_agrupador = 'HBO'  THEN fcu.monto ELSE 0 END)                AS neto_hbo,
        MAX(CASE WHEN fc.tipo_agrupador = 'HBO'  AND fc.operacion = '+' THEN 1 ELSE 0 END) AS hbo_con_cargo,
        MAX(CASE WHEN fc.tipo_agrupador = 'UNIV' THEN 1 ELSE 0 END)                        AS tiene_univ,
        SUM(CASE WHEN fc.tipo_agrupador = 'UNIV' THEN fcu.monto ELSE 0 END)                AS neto_univ,
        MAX(CASE WHEN fc.tipo_agrupador = 'UNIV' AND fc.operacion = '+' THEN 1 ELSE 0 END) AS univ_con_cargo,
        MAX(CASE WHEN fc.tipo_agrupador = 'FUTB' THEN 1 ELSE 0 END)                        AS tiene_futbol,
        SUM(CASE WHEN fc.tipo_agrupador = 'FUTB' THEN fcu.monto ELSE 0 END)                AS neto_futbol,
        MAX(CASE WHEN fc.tipo_agrupador = 'FUTB' AND fc.operacion = '+' THEN 1 ELSE 0 END) AS futbol_con_cargo,
        MAX(CASE WHEN fc.tipo_agrupador = 'APP'  THEN 1 ELSE 0 END)                        AS tiene_app,
        -- suma tambien los descuentos "ANDROID" que quedaron tageados como BONITV/BONIDP
        -- en vez de APP, para que el neto de la app no ignore su propio descuento
        SUM(CASE
              WHEN fc.tipo_agrupador = 'APP' THEN fcu.monto
              WHEN fc.tipo_agrupador IN ('BONITV','BONIDP') AND fc.Descripcion LIKE '%ANDROID%' THEN fcu.monto
              ELSE 0
            END) AS neto_app,
        -- neto real de TODO lo facturado en conceptos de video (incluye packs premium/cine,
        -- adicionales de deco, ajustes IPC/ENACOM, etc. aunque no tengan su propia columna)
        SUM(fcu.monto) AS total_neto
      FROM facturas_cuentas fcu
      JOIN facturas_conceptos fc ON fc.cod_concepto = fcu.cod_concepto
      WHERE fcu.estado = 0 AND fc.tipo_producto = 'V'
      GROUP BY fcu.id_conexion
    )
    SELECT
      f.id_conexion,
      f.cod_sucursal,
      ISNULL(dc.decos_iptv, 0) AS decos_iptv,
      ISNULL(dc.decos_ott, 0)  AS decos_ott,
      vd.plan_base,
      ISNULL(vd.abono_base, 0) AS abono_base,
      ISNULL(vd.bonif_base, 0) AS bonif_base,
      CASE WHEN ISNULL(vd.abono_base, 0) > 0 AND ISNULL(vd.bonif_base, 0) < 0 THEN 1 ELSE 0 END AS base_bonificado,

      ISNULL(vd.tiene_hbo, 0) AS tiene_hbo,
      ISNULL(vd.neto_hbo, 0)  AS neto_hbo,
      CASE WHEN ISNULL(vd.hbo_con_cargo, 0) = 1 AND ISNULL(vd.neto_hbo, 0) <= 0 THEN 1 ELSE 0 END AS hbo_bonificado,

      ISNULL(vd.tiene_univ, 0) AS tiene_univ,
      ISNULL(vd.neto_univ, 0)  AS neto_univ,
      CASE WHEN ISNULL(vd.univ_con_cargo, 0) = 1 AND ISNULL(vd.neto_univ, 0) <= 0 THEN 1 ELSE 0 END AS univ_bonificado,

      ISNULL(vd.tiene_futbol, 0) AS tiene_futbol,
      ISNULL(vd.neto_futbol, 0)  AS neto_futbol,
      CASE WHEN ISNULL(vd.futbol_con_cargo, 0) = 1 AND ISNULL(vd.neto_futbol, 0) <= 0 THEN 1 ELSE 0 END AS futbol_bonificado,

      ISNULL(vd.tiene_app, 0) AS tiene_app,
      ISNULL(vd.neto_app, 0)  AS neto_app,
      ISNULL(vd.total_neto, 0) AS total_neto
    FROM filtro f
    LEFT JOIN decos dc ON dc.id_conexion = f.id_conexion
    LEFT JOIN video vd ON vd.id_conexion = f.id_conexion
    WHERE dc.id_conexion IS NOT NULL
       OR vd.id_conexion IS NOT NULL
  `;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursalParam = req.nextUrl.searchParams.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;
  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = sucursalesPermitidas ?? SUCURSALES_VALIDAS;
  const sucursalClause =
    sucursalN !== null && sucursalesBase.includes(sucursalN)
      ? `= ${sucursalN}`
      : `IN (${sucursalesBase.join(",")})`;

  const estadosIn = buildEstadosIn(req.nextUrl.searchParams.get("estados"));

  try {
    const pool = await getPool();
    const result = await pool.request().query(buildQuery(estadosIn, sucursalClause));
    const rows = result.recordset as TvRow[];

    const total = rows.length;
    const decosIptvTotal = rows.reduce((s, r) => s + Number(r.decos_iptv), 0);
    const decosOttTotal = rows.reduce((s, r) => s + Number(r.decos_ott), 0);

    const porSucursalMap = new Map<number, number>();
    for (const r of rows) porSucursalMap.set(r.cod_sucursal, (porSucursalMap.get(r.cod_sucursal) ?? 0) + 1);
    const porSucursal = [...porSucursalMap.entries()]
      .map(([cod, cantidad]) => ({ cod_sucursal: cod, nombre: SUCURSALES[cod] ?? `Suc. ${cod}`, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const conPlanBase = rows.filter((r) => r.plan_base);
    const porPlanMap = new Map<string, number>();
    for (const r of conPlanBase) porPlanMap.set(r.plan_base as string, (porPlanMap.get(r.plan_base as string) ?? 0) + 1);
    const porPlanBase = [...porPlanMap.entries()]
      .map(([plan, cantidad]) => ({ plan, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const conBonifBase = conPlanBase.filter((r) => r.base_bonificado === 1).length;

    const hbo = statPack(rows, "tiene_hbo", "hbo_bonificado");
    const univ = statPack(rows, "tiene_univ", "univ_bonificado");
    const futbol = statPack(rows, "tiene_futbol", "futbol_bonificado");

    const appCon = rows.filter((r) => r.tiene_app === 1);
    const appConCargo = appCon.filter((r) => r.neto_app > 0).length;
    const appSinCargo = appCon.length - appConCargo;

    const detalle = rows
      .slice()
      .sort((a, b) => a.cod_sucursal - b.cod_sucursal || a.id_conexion - b.id_conexion)
      .slice(0, 500);

    return NextResponse.json({
      total,
      decosIptvTotal,
      decosOttTotal,
      porSucursal,
      porPlanBase,
      planBase: { conPlan: conPlanBase.length, conBonif: conBonifBase },
      hbo,
      univ,
      futbol,
      app: { tiene: appCon.length, conCargo: appConCargo, sinCargo: appSinCargo },
      detalle,
      detalleTotal: rows.length,
    });
  } catch (err: unknown) {
    console.error("[tv-planes]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
