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
  const limitesRaw = params.get("limites");

  if (!limitesRaw) return NextResponse.json({ rows: [] });

  let limites: Record<string, number>;
  try {
    limites = JSON.parse(limitesRaw);
    if (typeof limites !== "object" || Array.isArray(limites)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Parámetro limites inválido" }, { status: 400 });
  }

  const materialNames = Object.keys(limites).filter((k) => typeof limites[k] === "number" && limites[k] >= 1);
  if (materialNames.length === 0) return NextResponse.json({ rows: [] });

  const dateExtras: string[] = [];
  if (mesAnio) dateExtras.push(`FORMAT(vos.fecha_solucion, 'yyyy-MM') = '${mesAnio.replace(/'/g, "")}'`);
  else if (anio) dateExtras.push(`YEAR(vos.fecha_solucion) = ${parseInt(anio, 10)}`);
  const dateWhere = dateExtras.length > 0 ? `AND ${dateExtras.join(" AND ")}` : "";

  const matList = materialNames.map((n) => `'${n.replace(/'/g, "''")}'`).join(", ");
  const caseLines = materialNames
    .map((n) => `WHEN '${n.replace(/'/g, "''")}' THEN ${Number(limites[n])}`)
    .join("\n      ");

  const querySql = `
    SELECT
      d.nombre_dispositivo                            AS material,
      ih.id_conexion                                  AS conexion,
      ih.id_incidencia,
      CONVERT(VARCHAR, vos.fecha_solucion, 5)         AS fecha_cierre,
      vos.cod_sucursal,
      SUM(im.cantidad)                                AS cantidad_usada
    FROM v_ordenes_servicios vos WITH (NOLOCK)
    INNER JOIN incidencias_materiales im WITH (NOLOCK)
      ON im.id_incidencia = vos.id_incidencia
    INNER JOIN DISPOSITIVOS d WITH (NOLOCK)
      ON d.id_dispositivo = im.id_dispositivo
    INNER JOIN incidencias_header ih WITH (NOLOCK)
      ON ih.id_incidencia = vos.id_incidencia
    WHERE vos.cod_sucursal            ${sucursalClause}
      AND vos.estado_ods              IN (1, 2, 4)
      AND vos.estado_incidencia       IN (1, 2, 3)
      AND vos.fecha_solucion          IS NOT NULL
      AND d.nombre_dispositivo        IN (${matList})
      ${dateWhere}
      AND EXISTS (
        SELECT 1 FROM incidencias_soluciones is2 WITH (NOLOCK)
        WHERE is2.id_incidencia = vos.id_incidencia
      )
    GROUP BY
      d.nombre_dispositivo,
      ih.id_conexion,
      ih.id_incidencia,
      vos.fecha_solucion,
      vos.cod_sucursal
    HAVING SUM(im.cantidad) > CASE d.nombre_dispositivo
      ${caseLines}
      ELSE 99999
    END
    ORDER BY vos.fecha_solucion DESC
  `;

  try {
    const pool = await getPool();
    const result = await pool.request().query(querySql);
    return NextResponse.json({ rows: result.recordset });
  } catch (err: unknown) {
    console.error("[materiales-anomalias]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
