import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import * as XLSX from "xlsx";
import { buildQuery } from "@/app/api/tv-planes/route";

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

    const rows = (result.recordset as Record<string, unknown>[]).map((r) => ({
      ID_Conexion:       r.id_conexion,
      Sucursal:          SUCURSALES[Number(r.cod_sucursal)] ?? r.cod_sucursal,
      Decos_IPTV:        r.decos_iptv,
      Decos_OTT:         r.decos_ott,
      Plan_Base:         r.plan_base ?? "",
      Abono_Base:        r.abono_base,
      Bonif_Base:        r.bonif_base,
      Base_Bonificado:   r.base_bonificado === 1 ? "Si" : "No",
      Tiene_HBO:         r.tiene_hbo === 1 ? "Si" : "No",
      HBO_Bonificado:    r.hbo_bonificado === 1 ? "Si" : "No",
      Tiene_Universal:   r.tiene_univ === 1 ? "Si" : "No",
      Universal_Bonificado: r.univ_bonificado === 1 ? "Si" : "No",
      Tiene_Futbol:      r.tiene_futbol === 1 ? "Si" : "No",
      Futbol_Bonificado: r.futbol_bonificado === 1 ? "Si" : "No",
      Tiene_App:         r.tiene_app === 1 ? "Si" : "No",
      Neto_App:          r.neto_app,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Planes TV");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = sucursalN !== null ? (SUCURSALES[sucursalN] ?? sucursalN) : "Todas";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="planes-tv-${nombreSucursal}.xlsx"`,
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
