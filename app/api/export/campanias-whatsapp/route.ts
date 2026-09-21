import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import * as XLSX from "xlsx";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import { buildDetalleQuery, SIN_RESPUESTA, CON_RESPUESTA, SIN_TV, estadoEnvioLabel, type DetalleRow } from "@/app/api/campanias-whatsapp/route";

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
  const sucursalClause =
    sucursalN !== null && sucursalesBase.includes(sucursalN)
      ? `= ${sucursalN}`
      : `IN (${sucursalesBase.join(",")})`;

  const campaniaIdParam = req.nextUrl.searchParams.get("campaniaId");
  const campaniaId = campaniaIdParam ? parseInt(campaniaIdParam, 10) : NaN;
  if (isNaN(campaniaId) || campaniaId <= 0)
    return NextResponse.json({ error: "campaniaId inválido" }, { status: 400 });

  const filtroRespuesta = req.nextUrl.searchParams.get("respuesta");
  const filtroEstadoParam = req.nextUrl.searchParams.get("estadoId");
  const filtroEstadoId = filtroEstadoParam ? parseInt(filtroEstadoParam, 10) : null;
  const filtroTarifaTv = req.nextUrl.searchParams.get("tarifaTv");

  try {
    const pool = await getPool();

    const campaniaResult = await pool.request()
      .input("campaniaId", sql.Int, campaniaId)
      .query(`SELECT nombre FROM Campanias WHERE id = @campaniaId`);
    const campaniaNombre = campaniaResult.recordset[0]?.nombre ?? `Campania ${campaniaId}`;

    const result = await pool.request()
      .input("campaniaId", sql.Int, campaniaId)
      .query(buildDetalleQuery(sucursalClause));
    let recordset = result.recordset as DetalleRow[];
    for (const r of recordset) r.estadoNombre = estadoEnvioLabel(r.estadoId, r.estadoNombre);

    if (filtroRespuesta === SIN_RESPUESTA) recordset = recordset.filter((r) => !r.respuesta);
    else if (filtroRespuesta === CON_RESPUESTA) recordset = recordset.filter((r) => r.respuesta);
    else if (filtroRespuesta) recordset = recordset.filter((r) => r.respuesta === filtroRespuesta);
    if (filtroEstadoId !== null) recordset = recordset.filter((r) => r.estadoId === filtroEstadoId);
    if (filtroTarifaTv === SIN_TV) recordset = recordset.filter((r) => !r.tarifa_tv);
    else if (filtroTarifaTv) recordset = recordset.filter((r) => r.tarifa_tv === filtroTarifaTv);

    const rows = recordset
      .slice()
      .sort((a, b) => new Date(b.fechaActualizado).getTime() - new Date(a.fechaActualizado).getTime())
      .map((r) => ({
        ID_Conexion: r.conexionId,
        Nombre: r.nombre,
        Telefono: r.telefono,
        Sucursal: SUCURSALES[Number(r.cod_sucursal)] ?? r.cod_sucursal,
        Tarifa_Internet: r.tarifa ?? "",
        Tarifa_TV: r.tarifa_tv ?? "",
        Estado_Envio: r.estadoNombre,
        Respuesta: r.respuesta ?? "",
        Fecha_Respuesta: r.fechaRespuesta ?? "",
        Fecha_Actualizado: r.fechaActualizado,
      }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Campaña WhatsApp");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = sucursalN !== null ? (SUCURSALES[sucursalN] ?? sucursalN) : "Todas";
    const nombreArchivo = campaniaNombre.replace(/[\\/:*?"<>|]/g, "").slice(0, 60);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="campania-${campaniaId}-${nombreArchivo}-${nombreSucursal}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export/campanias-whatsapp]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
