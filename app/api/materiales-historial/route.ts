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

  const sucursalesBase = (sucursalesPermitidas ?? SUCURSALES_VALIDAS).filter((s) => SUCURSALES_VALIDAS.includes(s));
  const sucursalClause = sucursalN !== null && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;

  const mesAnio = params.get("mes_anio");
  const anio    = params.get("anio");

  const dateExtras: string[] = [];
  if (mesAnio) dateExtras.push(`FORMAT(vos.fecha_solucion, 'yyyy-MM') = '${mesAnio.replace(/'/g, "")}'`);
  else if (anio) dateExtras.push(`YEAR(vos.fecha_solucion) = ${parseInt(anio, 10)}`);

  const dateWhere = dateExtras.length > 0 ? `AND ${dateExtras.join(" AND ")}` : "";

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        d.nombre_dispositivo                    AS material,
        SUM(im.cantidad)                        AS total_unidades,
        COUNT(DISTINCT vos.id_incidencia)       AS cantidad_ordenes
      FROM v_ordenes_servicios vos WITH (NOLOCK)
      INNER JOIN incidencias_materiales im WITH (NOLOCK)
        ON im.id_incidencia = vos.id_incidencia
      INNER JOIN DISPOSITIVOS d WITH (NOLOCK)
        ON d.id_dispositivo = im.id_dispositivo
      WHERE vos.cod_sucursal ${sucursalClause}
        AND vos.estado_ods          IN (1, 2, 4)
        AND vos.estado_incidencia   IN (1, 2, 3)
        AND vos.fecha_solucion      IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM incidencias_soluciones is2 WITH (NOLOCK)
          WHERE is2.id_incidencia = vos.id_incidencia
        )
        ${dateWhere}
      GROUP BY d.nombre_dispositivo
      ORDER BY SUM(im.cantidad) DESC
    `);

    return NextResponse.json({ rows: result.recordset });
  } catch (err: unknown) {
    console.error("[materiales-historial]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
