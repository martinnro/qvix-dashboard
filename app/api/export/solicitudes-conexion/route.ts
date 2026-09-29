import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import { ensureTable, TABLA, SUCURSALES, SUCURSALES_VALIDAS } from "@/app/api/solicitudes-conexion/public/route";
import type { SolicitudRow } from "@/app/api/solicitudes-conexion/route";

function validDate(s: string | null): string | null {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
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
  const sucursalesConsulta = sucursalN !== null ? [sucursalN] : sucursalesBase;

  const desde = validDate(req.nextUrl.searchParams.get("desde"));
  const hasta = validDate(req.nextUrl.searchParams.get("hasta"));

  try {
    const pool = await getPool();
    await ensureTable(pool);

    const condiciones = [`cod_sucursal IN (${sucursalesConsulta.join(",") || "-1"})`];
    if (desde) condiciones.push(`fecha_solicitud >= '${desde}'`);
    if (hasta) condiciones.push(`fecha_solicitud < DATEADD(day, 1, '${hasta}')`);

    const result = await pool.request().query(`
      SELECT * FROM ${TABLA}
      WHERE ${condiciones.join(" AND ")}
      ORDER BY fecha_solicitud DESC
    `);
    const recordset = result.recordset as SolicitudRow[];

    const rows = recordset.map((r) => ({
      Fecha: r.fecha_solicitud,
      Origen: r.origen === "vendedor" ? "Vendedor" : "QR (cliente)",
      Vendedor: r.vendedor_nombre ?? "",
      Sucursal: SUCURSALES[r.cod_sucursal] ?? r.cod_sucursal,
      Velocidad: r.velocidad ?? "",
      "GO TV": r.go_tv ? "Sí" : "",
      Titular: r.titular_apellido_nombre,
      Tipo_Doc: r.titular_tipo_documento,
      Nro_Doc: r.titular_numero_documento,
      Telefono: r.titular_telefono,
      Email: r.titular_email ?? "",
      Barrio: r.titular_barrio ?? r.inm_barrio ?? "",
      Localidad: r.titular_localidad ?? r.inm_localidad ?? "",
      Provincia: r.titular_provincia ?? r.inm_provincia ?? "",
      Calle: r.titular_calle ?? r.inm_calle ?? "",
      Numero: r.titular_numero ?? r.inm_numero ?? "",
      Piso: r.titular_piso ?? r.inm_piso ?? "",
      Dpto: r.titular_dpto ?? r.inm_dpto ?? "",
      Telefono_Inmueble: r.inm_telefono ?? "",
      Ubicacion_Mapa: r.inm_lat !== null && r.inm_lng !== null ? `https://www.google.com/maps?q=${r.inm_lat},${r.inm_lng}` : "",
      Referencia: r.referencia ?? "",
      Lugar_Trabajo: r.lugar_trabajo ?? "",
      Ocupacion: r.ocupacion ?? "",
      Ambito: r.ambito ?? "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Solicitudes");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = sucursalN !== null ? (SUCURSALES[sucursalN] ?? sucursalN) : "Todas";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="solicitudes-conexion-${nombreSucursal}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export/solicitudes-conexion]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
