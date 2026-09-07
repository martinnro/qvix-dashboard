import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const params = req.nextUrl.searchParams;

  const sucursalParam = params.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;

  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = (sucursalesPermitidas ?? SUCURSALES_VALIDAS).filter((s) =>
    SUCURSALES_VALIDAS.includes(s)
  );
  const sucursalClause =
    sucursalN !== null && sucursalesBase.includes(sucursalN)
      ? `= ${sucursalN}`
      : `IN (${sucursalesBase.join(",")})`;

  const mesAnio = params.get("mes_anio");
  const anio = params.get("anio");

  const dateExtras: string[] = [];
  if (mesAnio) dateExtras.push(`FORMAT(vos.fecha_solucion, 'yyyy-MM') = '${mesAnio.replace(/'/g, "")}'`);
  else if (anio) dateExtras.push(`YEAR(vos.fecha_solucion) = ${parseInt(anio, 10)}`);
  else dateExtras.push(`YEAR(vos.fecha_solucion) >= 2025`);
  const dateWhere = `AND ${dateExtras.join(" AND ")}`;

  const pool = await getPool();

  try {
    const result = await pool.request().query(`
      SELECT TOP 1000
        ih.id_conexion                              AS conexion,
        CONVERT(VARCHAR, vos.fecha_solucion, 5)     AS fecha_cierre,
        vos.cod_sucursal,
        t.descripcion                               AS tarifa,
        vos.subtipo_incidencia_descripcion          AS subtipo
      FROM v_ordenes_servicios vos WITH (NOLOCK)
      INNER JOIN incidencias_header ih WITH (NOLOCK)
        ON ih.id_incidencia = vos.id_incidencia
      LEFT JOIN v_con_dom vcd WITH (NOLOCK)
        ON vcd.id_conexion = ih.id_conexion
      LEFT JOIN tarifas t WITH (NOLOCK)
        ON t.id_tarifa = vcd.tarifa
      WHERE vos.cod_sucursal        ${sucursalClause}
        AND vos.estado_ods          IN (1, 2, 4)
        AND vos.estado_incidencia   IN (1, 2, 3)
        AND vos.fecha_solucion      IS NOT NULL
        AND vos.tipo_incidencia     = 1
        AND vos.subtipo_inicidencia = 16
        AND t.descripcion           LIKE '%FTTH%'
        ${dateWhere}
        AND NOT EXISTS (
          SELECT 1
          FROM incidencias_materiales im WITH (NOLOCK)
          INNER JOIN DISPOSITIVOS d WITH (NOLOCK)
            ON d.id_dispositivo = im.id_dispositivo
          WHERE im.id_incidencia      = vos.id_incidencia
            AND d.nombre_dispositivo  LIKE '%FIBRA DROP%'
            AND im.cantidad           > 0
        )
      ORDER BY vos.fecha_solucion DESC
    `);
    return NextResponse.json({ rows: result.recordset });
  } catch (err: unknown) {
    console.error("[materiales-falta-cargar]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
