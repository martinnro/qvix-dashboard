import { NextRequest, NextResponse } from "next/server";
import { getPool, resetPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [0, 1, 3, 4, 5, 6, 7, 8];

function validDate(s: string | null, fallback: string): string {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
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

  const hoy = new Date().toISOString().slice(0, 10);
  const inicioAnio = `${new Date().getFullYear()}-01-01`;
  const desde = validDate(req.nextUrl.searchParams.get("desde"), inicioAnio);
  const hasta = validDate(req.nextUrl.searchParams.get("hasta"), hoy);

  // Jan–Aug 2026: bajadas.cable_usado; Sep 2026+: incidencias_materiales id_dispositivo=782
  const CORTE = "2026-09-01";
  const hasta_baj = hasta < CORTE ? hasta : "2026-08-31";
  const desde_inc = desde >= CORTE ? desde : CORTE;
  const needBajadas = desde <= "2026-08-31";
  const needInc = hasta >= CORTE;

  try {
    const pool = await getPool();

    type Row = { cod_sucursal: number; id_conexion: number; fecha: string; metros: number };
    const parts: Row[] = [];

    if (needBajadas) {
      const res = await pool.request().query(`
        SET ARITHABORT ON;
        SELECT b.cod_sucursal, b.id_conexion,
               CONVERT(VARCHAR(10), b.fecha, 23) AS fecha,
               CAST(b.cable_usado AS INT) AS metros
        FROM bajadas b
        WHERE b.fecha >= '${desde}'
          AND b.fecha <= '${hasta_baj}'
          AND b.cable_usado > 0
          AND b.cod_sucursal ${sucursalClause}
      `);
      parts.push(...res.recordset);
    }

    if (needInc) {
      const res = await pool.request().query(`
        SET ARITHABORT ON;
        SELECT ih.cod_sucursal, ih.id_conexion,
               CONVERT(VARCHAR(10), ih.fecha_reclamo, 23) AS fecha,
               CAST(im.cantidad AS INT) AS metros
        FROM incidencias_materiales im
        INNER JOIN incidencias_header ih ON ih.id_incidencia = im.id_incidencia
        WHERE im.id_dispositivo = 782
          AND im.cantidad > 0
          AND ih.tipo_incidencia = 1
          AND ih.fecha_reclamo >= '${desde_inc}'
          AND ih.fecha_reclamo <= '${hasta}'
          AND ih.cod_sucursal ${sucursalClause}
      `);
      parts.push(...res.recordset);
    }

    parts.sort((a, b) => b.fecha.localeCompare(a.fecha));

    return NextResponse.json({ rows: parts });
  } catch (e: unknown) {
    try { resetPool(); } catch { /* ignore */ }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
