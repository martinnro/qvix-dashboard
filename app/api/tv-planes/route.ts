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

export interface TvRow {
  id_conexion: number;
  cod_sucursal: number;
  decos_iptv: number;
  decos_ott: number;
  plan_base: string | null;
  abono_base: number;
  bonif_base: number;
  base_bonificado: number;
  base_cant_cuotas: number | null;
  base_cuotas_generadas: number | null;
  tiene_hbo: number;
  neto_hbo: number;
  hbo_bonificado: number;
  hbo_cant_cuotas: number | null;
  hbo_cuotas_generadas: number | null;
  tiene_univ: number;
  neto_univ: number;
  univ_bonificado: number;
  univ_cant_cuotas: number | null;
  univ_cuotas_generadas: number | null;
  tiene_futbol: number;
  neto_futbol: number;
  futbol_bonificado: number;
  futbol_cant_cuotas: number | null;
  futbol_cuotas_generadas: number | null;
  tiene_app: number;
  neto_app: number;
  app_cant_cuotas: number | null;
  app_cuotas_generadas: number | null;
  total_neto: number;
}

function statPack(rows: TvRow[], tieneField: keyof TvRow, bonifField: keyof TvRow) {
  const con = rows.filter((r) => Number(r[tieneField]) === 1);
  const bonificado = con.filter((r) => Number(r[bonifField]) === 1).length;
  return { tiene: con.length, bonificado, paga: con.length - bonificado };
}

export type PlanEstado = "bonificado" | "con_cargo" | "sin_plan_con_cargo" | "sin_plan_sin_cargo" | "proximo_vencer";
export type NetoGlobalEstado = "bonificado" | "con_cargo";
export type PackTipo = "hbo" | "univ" | "futbol" | "app";
export type PackEstado = "bonificado" | "paga" | "proximo_vencer";

// A partir de cuántas cuotas restantes (inclusive) se considera "próximo a vencer".
export const PROXIMO_VENCER_UMBRAL = 2;

export function claseEstado(r: TvRow): Exclude<PlanEstado, "proximo_vencer"> {
  if (r.plan_base) return r.base_bonificado === 1 ? "bonificado" : "con_cargo";
  return r.total_neto > 0 ? "sin_plan_con_cargo" : "sin_plan_sin_cargo";
}

export function cuotasRestantesBase(r: TvRow): number | null {
  if (!r.base_cant_cuotas || r.base_cuotas_generadas === null) return null;
  return Math.max(0, r.base_cant_cuotas - r.base_cuotas_generadas);
}

// El plan base también puede estar "próximo a vencer" (bonificado, con pocas cuotas restantes) —
// no es algo que claseEstado() pueda devolver por sí sola porque no es una de sus 4 categorías.
export function matchesPlanEstado(r: TvRow, estado: PlanEstado): boolean {
  if (estado === "proximo_vencer") {
    if (r.base_bonificado !== 1) return false;
    const restantes = cuotasRestantesBase(r);
    return restantes !== null && restantes <= PROXIMO_VENCER_UMBRAL;
  }
  return claseEstado(r) === estado;
}

function cuotasRestantesPack(r: TvRow, pack: PackTipo): number | null {
  const cantCuotas =
    pack === "hbo" ? r.hbo_cant_cuotas : pack === "univ" ? r.univ_cant_cuotas : pack === "futbol" ? r.futbol_cant_cuotas : r.app_cant_cuotas;
  const generadas =
    pack === "hbo" ? r.hbo_cuotas_generadas : pack === "univ" ? r.univ_cuotas_generadas : pack === "futbol" ? r.futbol_cuotas_generadas : r.app_cuotas_generadas;
  if (!cantCuotas || generadas === null) return null;
  return Math.max(0, cantCuotas - generadas);
}

// "bonificado" para la App significa sin cargo (mismo campo neto_app, sin columna *_bonificado propia).
export function matchesPack(r: TvRow, pack: PackTipo, estado: PackEstado): boolean {
  const tiene = pack === "hbo" ? r.tiene_hbo === 1 : pack === "univ" ? r.tiene_univ === 1 : pack === "futbol" ? r.tiene_futbol === 1 : r.tiene_app === 1;
  if (!tiene) return false;

  const bonificado =
    pack === "hbo" ? r.hbo_bonificado === 1 : pack === "univ" ? r.univ_bonificado === 1 : pack === "futbol" ? r.futbol_bonificado === 1 : r.neto_app <= 0;

  if (estado === "paga") return !bonificado;
  if (estado === "bonificado") return bonificado;

  // "proximo_vencer": bonificado y con pocas cuotas restantes de descuento.
  if (!bonificado) return false;
  const restantes = cuotasRestantesPack(r, pack);
  return restantes !== null && restantes <= PROXIMO_VENCER_UMBRAL;
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
        -- Cuotas del descuento del plan base: cant_cuotas = duracion total de la promo, generadas =
        -- cuantas ya se facturaron. Cuando generadas llega a cant_cuotas, la bonificacion se vence.
        MAX(CASE WHEN fc.tipo_agrupador IN ('BONITV','BONIDP') AND fc.Descripcion NOT LIKE '%ANDROID%'
                 AND fc.operacion = '-' THEN fcu.cant_cuotas END)           AS base_cant_cuotas,
        MAX(CASE WHEN fc.tipo_agrupador IN ('BONITV','BONIDP') AND fc.Descripcion NOT LIKE '%ANDROID%'
                 AND fc.operacion = '-' THEN fcu.cant_cuotas_generadas END) AS base_cuotas_generadas,

        MAX(CASE WHEN fc.tipo_agrupador = 'HBO'  THEN 1 ELSE 0 END)                        AS tiene_hbo,
        SUM(CASE WHEN fc.tipo_agrupador = 'HBO'  THEN fcu.monto ELSE 0 END)                AS neto_hbo,
        MAX(CASE WHEN fc.tipo_agrupador = 'HBO'  AND fc.operacion = '+' THEN 1 ELSE 0 END) AS hbo_con_cargo,
        MAX(CASE WHEN fc.tipo_agrupador = 'HBO'  AND fc.operacion = '-' THEN fcu.cant_cuotas END)           AS hbo_cant_cuotas,
        MAX(CASE WHEN fc.tipo_agrupador = 'HBO'  AND fc.operacion = '-' THEN fcu.cant_cuotas_generadas END) AS hbo_cuotas_generadas,

        MAX(CASE WHEN fc.tipo_agrupador = 'UNIV' THEN 1 ELSE 0 END)                        AS tiene_univ,
        SUM(CASE WHEN fc.tipo_agrupador = 'UNIV' THEN fcu.monto ELSE 0 END)                AS neto_univ,
        MAX(CASE WHEN fc.tipo_agrupador = 'UNIV' AND fc.operacion = '+' THEN 1 ELSE 0 END) AS univ_con_cargo,
        MAX(CASE WHEN fc.tipo_agrupador = 'UNIV' AND fc.operacion = '-' THEN fcu.cant_cuotas END)           AS univ_cant_cuotas,
        MAX(CASE WHEN fc.tipo_agrupador = 'UNIV' AND fc.operacion = '-' THEN fcu.cant_cuotas_generadas END) AS univ_cuotas_generadas,

        MAX(CASE WHEN fc.tipo_agrupador = 'FUTB' THEN 1 ELSE 0 END)                        AS tiene_futbol,
        SUM(CASE WHEN fc.tipo_agrupador = 'FUTB' THEN fcu.monto ELSE 0 END)                AS neto_futbol,
        MAX(CASE WHEN fc.tipo_agrupador = 'FUTB' AND fc.operacion = '+' THEN 1 ELSE 0 END) AS futbol_con_cargo,
        MAX(CASE WHEN fc.tipo_agrupador = 'FUTB' AND fc.operacion = '-' THEN fcu.cant_cuotas END)           AS futbol_cant_cuotas,
        MAX(CASE WHEN fc.tipo_agrupador = 'FUTB' AND fc.operacion = '-' THEN fcu.cant_cuotas_generadas END) AS futbol_cuotas_generadas,

        MAX(CASE WHEN fc.tipo_agrupador = 'APP'  THEN 1 ELSE 0 END)                        AS tiene_app,
        -- suma tambien los descuentos "ANDROID" que quedaron tageados como BONITV/BONIDP
        -- en vez de APP, para que el neto de la app no ignore su propio descuento
        SUM(CASE
              WHEN fc.tipo_agrupador = 'APP' THEN fcu.monto
              WHEN fc.tipo_agrupador IN ('BONITV','BONIDP') AND fc.Descripcion LIKE '%ANDROID%' THEN fcu.monto
              ELSE 0
            END) AS neto_app,
        MAX(CASE
              WHEN fc.tipo_agrupador = 'APP' AND fc.operacion = '-' THEN fcu.cant_cuotas
              WHEN fc.tipo_agrupador IN ('BONITV','BONIDP') AND fc.Descripcion LIKE '%ANDROID%' AND fc.operacion = '-' THEN fcu.cant_cuotas
            END) AS app_cant_cuotas,
        MAX(CASE
              WHEN fc.tipo_agrupador = 'APP' AND fc.operacion = '-' THEN fcu.cant_cuotas_generadas
              WHEN fc.tipo_agrupador IN ('BONITV','BONIDP') AND fc.Descripcion LIKE '%ANDROID%' AND fc.operacion = '-' THEN fcu.cant_cuotas_generadas
            END) AS app_cuotas_generadas,
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
      vd.base_cant_cuotas, vd.base_cuotas_generadas,

      ISNULL(vd.tiene_hbo, 0) AS tiene_hbo,
      ISNULL(vd.neto_hbo, 0)  AS neto_hbo,
      CASE WHEN ISNULL(vd.hbo_con_cargo, 0) = 1 AND ISNULL(vd.neto_hbo, 0) <= 0 THEN 1 ELSE 0 END AS hbo_bonificado,
      vd.hbo_cant_cuotas, vd.hbo_cuotas_generadas,

      ISNULL(vd.tiene_univ, 0) AS tiene_univ,
      ISNULL(vd.neto_univ, 0)  AS neto_univ,
      CASE WHEN ISNULL(vd.univ_con_cargo, 0) = 1 AND ISNULL(vd.neto_univ, 0) <= 0 THEN 1 ELSE 0 END AS univ_bonificado,
      vd.univ_cant_cuotas, vd.univ_cuotas_generadas,

      ISNULL(vd.tiene_futbol, 0) AS tiene_futbol,
      ISNULL(vd.neto_futbol, 0)  AS neto_futbol,
      CASE WHEN ISNULL(vd.futbol_con_cargo, 0) = 1 AND ISNULL(vd.neto_futbol, 0) <= 0 THEN 1 ELSE 0 END AS futbol_bonificado,
      vd.futbol_cant_cuotas, vd.futbol_cuotas_generadas,

      ISNULL(vd.tiene_app, 0) AS tiene_app,
      ISNULL(vd.neto_app, 0)  AS neto_app,
      vd.app_cant_cuotas, vd.app_cuotas_generadas,
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
  const planEstadoParam = req.nextUrl.searchParams.get("planEstado") as PlanEstado | null;
  const netoGlobalParam = req.nextUrl.searchParams.get("netoGlobal") as NetoGlobalEstado | null;
  const packParam = req.nextUrl.searchParams.get("pack") as PackTipo | null;
  const packEstadoParam = req.nextUrl.searchParams.get("packEstado") as PackEstado | null;

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
    const porPlanMap = new Map<string, { cantidad: number; sumaPrecio: number; minPrecio: number; maxPrecio: number }>();
    for (const r of conPlanBase) {
      const plan = r.plan_base as string;
      const precio = r.abono_base;
      const actual = porPlanMap.get(plan);
      if (actual) {
        actual.cantidad += 1;
        actual.sumaPrecio += precio;
        actual.minPrecio = Math.min(actual.minPrecio, precio);
        actual.maxPrecio = Math.max(actual.maxPrecio, precio);
      } else {
        porPlanMap.set(plan, { cantidad: 1, sumaPrecio: precio, minPrecio: precio, maxPrecio: precio });
      }
    }
    // Cada plan tiene precios distintos entre conexiones (aumentos históricos, negociaciones, promos),
    // por eso se muestra un promedio y un rango en vez de un precio único.
    const porPlanBase = [...porPlanMap.entries()]
      .map(([plan, v]) => ({
        plan,
        cantidad: v.cantidad,
        precioProm: Math.round(v.sumaPrecio / v.cantidad),
        precioMin: v.minPrecio,
        precioMax: v.maxPrecio,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const conBonifBase = conPlanBase.filter((r) => r.base_bonificado === 1).length;

    const sinPlanBase = rows.filter((r) => !r.plan_base);
    const sinPlanConCargo = sinPlanBase.filter((r) => r.total_neto > 0).length;
    const sinPlanSinCargo = sinPlanBase.length - sinPlanConCargo;

    // Bonificado/paga global: no importa si tiene plan base o no, mira el neto total de TODO lo facturado en video
    const bonificadoGlobal = rows.filter((r) => r.total_neto <= 0).length;
    const conCargoGlobal = total - bonificadoGlobal;

    const hbo = statPack(rows, "tiene_hbo", "hbo_bonificado");
    const univ = statPack(rows, "tiene_univ", "univ_bonificado");
    const futbol = statPack(rows, "tiene_futbol", "futbol_bonificado");

    const appCon = rows.filter((r) => r.tiene_app === 1);
    const appConCargo = appCon.filter((r) => r.neto_app > 0).length;
    const appSinCargo = appCon.length - appConCargo;

    // "TV sin cargo (global)" no mira el plan base sino el neto total de TODO lo facturado en
    // video (mismo criterio que bonificadoGlobal/conCargoGlobal más arriba).
    const rowsParaDetalle = planEstadoParam
      ? rows.filter((r) => matchesPlanEstado(r, planEstadoParam))
      : netoGlobalParam
        ? rows.filter((r) => (netoGlobalParam === "bonificado" ? r.total_neto <= 0 : r.total_neto > 0))
        : packParam && packEstadoParam
          ? rows.filter((r) => matchesPack(r, packParam, packEstadoParam))
          : rows;

    const detalle = rowsParaDetalle
      .slice()
      .sort((a, b) => a.cod_sucursal - b.cod_sucursal || a.id_conexion - b.id_conexion)
      .slice(0, 500);

    // Conteo por sucursal del filtro activo (planEstado/netoGlobal/pack) — a diferencia de
    // porSucursal (siempre sobre el total sin filtrar), este sí refleja la situación elegida.
    const detallePorSucursalMap = new Map<number, number>();
    for (const r of rowsParaDetalle) detallePorSucursalMap.set(r.cod_sucursal, (detallePorSucursalMap.get(r.cod_sucursal) ?? 0) + 1);
    const detallePorSucursal = Object.fromEntries(detallePorSucursalMap);

    return NextResponse.json({
      total,
      decosIptvTotal,
      decosOttTotal,
      porSucursal,
      porPlanBase,
      planBase: {
        conPlan: conPlanBase.length,
        conBonif: conBonifBase,
        sinPlanConCargo,
        sinPlanSinCargo,
        bonificadoGlobal,
        conCargoGlobal,
      },
      hbo,
      univ,
      futbol,
      app: { tiene: appCon.length, conCargo: appConCargo, sinCargo: appSinCargo },
      detalle,
      detalleTotal: rowsParaDetalle.length,
      detallePorSucursal,
    });
  } catch (err: unknown) {
    console.error("[tv-planes]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
