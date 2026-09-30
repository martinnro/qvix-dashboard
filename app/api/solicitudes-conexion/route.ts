import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import { ensureTable, TABLA, SUCURSALES, SUCURSALES_VALIDAS } from "@/app/api/solicitudes-conexion/public/route";

function validDate(s: string | null): string | null {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export interface SolicitudRow {
  id: number;
  origen: string;
  vendedor_usuario: string | null;
  vendedor_nombre: string | null;
  cod_sucursal: number;
  fecha_solicitud: string;
  doble_play: boolean;
  velocidad: string | null;
  go_tv: boolean;
  inm_barrio: string | null;
  inm_localidad: string | null;
  inm_provincia: string | null;
  inm_calle: string | null;
  inm_numero: string | null;
  inm_piso: string | null;
  inm_dpto: string | null;
  inm_telefono: string | null;
  inm_lat: number | null;
  inm_lng: number | null;
  referencia: string | null;
  titular_apellido_nombre: string;
  titular_tipo_documento: string;
  titular_numero_documento: string;
  titular_barrio: string | null;
  titular_localidad: string | null;
  titular_provincia: string | null;
  titular_calle: string | null;
  titular_numero: string | null;
  titular_piso: string | null;
  titular_dpto: string | null;
  titular_telefono: string;
  titular_email: string | null;
  lugar_trabajo: string | null;
  ocupacion: string | null;
  ambito: string | null;
  precio: number | null;
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
    const rows = result.recordset as SolicitudRow[];

    const total = rows.length;
    const porOrigen = { vendedor: rows.filter((r) => r.origen === "vendedor").length, qr: rows.filter((r) => r.origen === "qr").length };
    const conGoTv = rows.filter((r) => r.go_tv).length;

    const porSucursalMap = new Map<number, number>();
    for (const r of rows) porSucursalMap.set(r.cod_sucursal, (porSucursalMap.get(r.cod_sucursal) ?? 0) + 1);
    const porSucursal = [...porSucursalMap.entries()]
      .map(([cod, cantidad]) => ({ cod_sucursal: cod, nombre: SUCURSALES[cod] ?? `Suc. ${cod}`, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);

    return NextResponse.json({
      total,
      porOrigen,
      conGoTv,
      porSucursal,
      rows: rows.slice(0, 500),
    });
  } catch (err: unknown) {
    console.error("[solicitudes-conexion GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
