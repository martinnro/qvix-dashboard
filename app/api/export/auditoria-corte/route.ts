import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import { buildQuery, SUCURSALES, SUCURSALES_VALIDAS, type AuditoriaCorteRow } from "@/app/api/auditoria-corte/route";

const ESTADO_INCIDENCIA: Record<number, string> = { 1: "Pendiente", 2: "Asignada", 3: "Cerrada" };
const ESTADO_ODS: Record<number, string> = { 1: "Pendiente", 2: "Impresa", 4: "Cerrada" };

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
      : `IN (${sucursalesBase.join(",") || "-1"})`;

  const filtroOds = req.nextUrl.searchParams.get("tieneOds"); // "si" | "no" | null (todos)

  try {
    const pool = await getPool();
    const result = await pool.request().query(buildQuery(sucursalClause));
    let recordset = result.recordset as AuditoriaCorteRow[];
    if (filtroOds === "si") recordset = recordset.filter((r) => r.id_orden_servicio !== null);
    if (filtroOds === "no") recordset = recordset.filter((r) => r.id_orden_servicio === null);

    const rows = recordset.map((r) => ({
      ID_Conexion: r.id_conexion,
      Sucursal: SUCURSALES[r.cod_sucursal] ?? r.cod_sucursal,
      Estado_Servicio: r.estado_servicio,
      Tiene_ODS_Retiro: r.id_orden_servicio !== null ? "Sí" : "No",
      N_ODS: r.id_orden_servicio ?? "",
      Estado_Incidencia: r.estado_incidencia !== null ? (ESTADO_INCIDENCIA[r.estado_incidencia] ?? r.estado_incidencia) : "",
      Estado_ODS: r.estado_ods !== null ? (ESTADO_ODS[r.estado_ods] ?? r.estado_ods) : "",
      Fecha_Reclamo: r.fecha_reclamo ?? "",
      Fecha_Asignacion: r.fecha_asignacion ?? "",
      Fecha_Solucion: r.fecha_solucion ?? "",
      Motivo: r.motivo ?? "",
      NAP_1er_Nivel: r.nap_primer_nivel ?? "",
      NAP_2do_Nivel: r.nap_segundo_nivel ?? "",
      Dias: r.dias ?? "",
      Dias_Calculado_Desde: r.dias === null ? "" : r.dias_desde_vencimiento === 1 ? "Vto. última factura impaga" : "Fecha de reclamo",
      ONT: r.ont,
      IPTV: r.iptv,
      OTT: r.ott,
      Antena: r.antena,
      Total_Dispositivos: r.total_dispositivos,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Auditoria Gestion de Corte");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = sucursalN !== null ? (SUCURSALES[sucursalN] ?? sucursalN) : "Todas";
    const sufijo = filtroOds === "si" ? "-con-ods" : filtroOds === "no" ? "-sin-ods" : "";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="auditoria-gestion-corte-${nombreSucursal}${sufijo}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export/auditoria-corte]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
