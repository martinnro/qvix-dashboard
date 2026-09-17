import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import * as XLSX from "xlsx";
import { buildQuery, claseEstado, type PlanEstado, type TvRow } from "@/app/api/tv-planes/route";

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

// Mismo texto que se ve en la pantalla, en vez de flags 0/1
function estadoPack(tiene: number, bonificado: number): string {
  if (tiene !== 1) return "";
  return bonificado === 1 ? "Bonificado" : "Paga";
}
function estadoApp(tiene: number, neto: number): string {
  if (tiene !== 1) return "";
  return neto > 0 ? "Con cargo" : "Sin cargo";
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

  try {
    const pool = await getPool();
    const result = await pool.request().query(buildQuery(estadosIn, sucursalClause));
    const recordset = result.recordset as TvRow[];
    const filtrados = planEstadoParam
      ? recordset.filter((r) => claseEstado(r) === planEstadoParam)
      : recordset;

    const rows = filtrados.map((r) => ({
      ID_Conexion:    r.id_conexion,
      Sucursal:       SUCURSALES[Number(r.cod_sucursal)] ?? r.cod_sucursal,
      Decos_IPTV:     r.decos_iptv,
      Decos_OTT:      r.decos_ott,
      Plan_Base:      r.plan_base ?? "",
      Precio_Plan_Base: r.abono_base + r.bonif_base,
      Bonif_Base:     r.base_bonificado === 1 ? "Sí" : "",
      "HBO+":         estadoPack(r.tiene_hbo, r.hbo_bonificado),
      Precio_HBO:     r.tiene_hbo === 1 ? r.neto_hbo : "",
      "Universal+":   estadoPack(r.tiene_univ, r.univ_bonificado),
      Precio_Universal: r.tiene_univ === 1 ? r.neto_univ : "",
      Futbol:         estadoPack(r.tiene_futbol, r.futbol_bonificado),
      Precio_Futbol:  r.tiene_futbol === 1 ? r.neto_futbol : "",
      App:            estadoApp(r.tiene_app, r.neto_app),
      Precio_App:     r.tiene_app === 1 ? r.neto_app : "",
      Neto_TV:        r.total_neto,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Planes TV");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = sucursalN !== null ? (SUCURSALES[sucursalN] ?? sucursalN) : "Todas";
    const sufijoEstado = planEstadoParam ? `-${planEstadoParam}` : "";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="planes-tv-${nombreSucursal}${sufijoEstado}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export/tv-planes]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
