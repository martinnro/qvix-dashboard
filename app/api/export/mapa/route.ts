import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import * as XLSX from "xlsx";

const SUCURSALES: Record<number, string> = {
  4: "Valle Viejo",
  1: "Chumbicha",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};
const SUCURSALES_VALIDAS = Object.keys(SUCURSALES).map(Number);

function buildIn(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0 && n < 100000);
  return parsed.length > 0 ? parsed.join(",") : fallback;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursal = parseInt(req.nextUrl.searchParams.get("sucursal") ?? "4", 10);
  if (isNaN(sucursal) || !SUCURSALES_VALIDAS.includes(sucursal))
    return NextResponse.json({ error: "Sucursal inválida" }, { status: 400 });
  if (sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursal))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const estadosIn = buildIn(req.nextUrl.searchParams.get("estados"), "3,6");
  const barriosIn = buildIn(req.nextUrl.searchParams.get("barrios"), null as unknown as string);
  const bajaModo  = req.nextUrl.searchParams.get("bajaModo"); // "mas12" | "menos12"

  const barrioClause = barriosIn ? `AND vcd.cod_barrio IN (${barriosIn})` : "";

  const estadosArr  = estadosIn.split(",").map(Number);
  const filtrarBaja = bajaModo && estadosArr.includes(7);

  const bajaComparacion = bajaModo === "mas12" ? "<" : ">=";
  const bajaClause = filtrarBaja
    ? `AND (
        vcd.Estado_Servicio <> 7
        OR EXISTS (
          SELECT 1 FROM bajas b
          WHERE b.id_conexion = c.id_conexion
            AND b.tipo_baja = 'SERV'
            AND b.tipo_serv = 'I'
            AND b.fecha_baja ${bajaComparacion} DATEADD(MONTH, -12, GETDATE())
        )
      )`
    : "";

  const query = `
    SELECT
      c.id_conexion,
      vcd.Estado_Servicio,
      ts.descripcion AS estado_nombre,
      'N' + cr.nap_primer_nivel + '.' + cr.nap_segundo_nivel AS nap,
      vcd2.apellido_nombre,
      vcd2.nom_calle,
      vcd2.dom_numero,
      vcd2.celular,
      vcd2.telefono,
      b2.nom_barrio,
      cr.precinto,
      cr.precinto_ftth
    FROM Clientes c
    LEFT JOIN v_con_dom vcd           ON vcd.id_conexion = c.id_conexion
    LEFT JOIN Conexiones c2           ON c2.id_conexion = c.id_conexion
    LEFT JOIN inmuebles i2            ON i2.id_inmueble = c2.id_inmueble
    LEFT JOIN tipo_estado_servicio ts ON ts.id_estado_servicio = vcd.Estado_Servicio
    LEFT JOIN Conexiones_referencia cr ON cr.id_conexion = c.id_conexion
    LEFT JOIN v_conexiones_domicilio vcd2 ON vcd.id_conexion = vcd2.id_conexion
    LEFT JOIN barrios b2              ON b2.cod_barrio = vcd.cod_barrio
    WHERE vcd.cod_sucursal = ${sucursal}
      AND vcd.Estado_Servicio IN (${estadosIn})
      ${barrioClause}
      ${bajaClause}
      AND i2.latitud  IS NOT NULL
      AND i2.longitud IS NOT NULL
      AND i2.latitud  <> ''
      AND i2.longitud <> ''
      AND TRY_CAST(i2.latitud  AS FLOAT) IS NOT NULL
      AND TRY_CAST(i2.longitud AS FLOAT) IS NOT NULL
      AND TRY_CAST(i2.latitud  AS FLOAT) <> 0
      AND TRY_CAST(i2.longitud AS FLOAT) <> 0
    ORDER BY vcd.Estado_Servicio, c.id_conexion
  `;

  try {
    const pool = await getPool();
    const result = await pool.request().query(query);

    const rows = (result.recordset as Record<string, unknown>[]).map((r) => ({
      ID_Conexion:    r.id_conexion,
      Nombre:         r.apellido_nombre ?? "",
      Estado:         r.estado_nombre ?? "",
      Barrio:         r.nom_barrio ?? "",
      Calle:          r.nom_calle ?? "",
      Numero:         r.dom_numero ?? "",
      Celular:        r.celular ?? "",
      Telefono:       r.telefono ?? "",
      NAP:            r.nap ?? "",
      Precinto:       r.precinto ?? "",
      Precinto_FTTH:  r.precinto_ftth ?? "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Conexiones");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nombreSucursal = SUCURSALES[sucursal] ?? sucursal;

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="conexiones-mapa-${nombreSucursal}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export/mapa]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}