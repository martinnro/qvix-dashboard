import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

function buildSucursalClause(raw: string | null): string {
  if (!raw) return `IN (${SUCURSALES_VALIDAS.join(",")})`;
  const n = parseInt(raw, 10);
  if (!isNaN(n) && SUCURSALES_VALIDAS.includes(n)) return `= ${n}`;
  return `IN (${SUCURSALES_VALIDAS.join(",")})`;
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
  const sucursalClause = sucursalN && sucursalesBase.includes(sucursalN)
    ? `= ${sucursalN}`
    : `IN (${sucursalesBase.join(",")})`;

  try {
    const pool = await getPool();

    const [activosRes, stockRes] = await Promise.all([
      // Dispositivos activos en conexiones
      pool.request().query(`
        SELECT
          cd.cod_sucursal,
          d.nombre_dispositivo AS modelo,
          d.tipo_dispositivo,
          vcd.Estado_Servicio,
          ts.descripcion AS estado_nombre,
          COUNT(*) AS cantidad
        FROM conexion_dispostivos cd
        JOIN DISPOSITIVOS d ON d.id_dispositivo = cd.id_dispositivo
        JOIN v_con_dom vcd ON vcd.id_conexion = cd.id_conexion
        LEFT JOIN tipo_estado_servicio ts ON ts.id_estado_servicio = vcd.Estado_Servicio
        WHERE cd.estado = 0
          AND d.tipo_dispositivo IN ('T', 'M', 'B')
          AND cd.cod_sucursal ${sucursalClause}
        GROUP BY cd.cod_sucursal, d.nombre_dispositivo, d.tipo_dispositivo, vcd.Estado_Servicio, ts.descripcion
        ORDER BY cd.cod_sucursal, cantidad DESC
      `),
      // Dispositivos en stock disponible (solo con MAC asignada)
      pool.request().query(`
        SELECT
          s.cod_sucursal,
          d.nombre_dispositivo AS modelo,
          d.tipo_dispositivo,
          COUNT(*) AS cantidad
        FROM stock s
        JOIN DISPOSITIVOS d ON d.id_dispositivo = s.id_dispositivo
        WHERE s.cantidad_actual = 1
          AND s.mac IS NOT NULL
          AND d.tipo_dispositivo IN ('T', 'M', 'B')
          AND s.cod_sucursal ${sucursalClause}
          AND NOT EXISTS (
            SELECT 1 FROM conexion_dispostivos cd
            WHERE cd.mac = s.mac AND cd.estado = 0
          )
        GROUP BY s.cod_sucursal, d.nombre_dispositivo, d.tipo_dispositivo
        ORDER BY s.cod_sucursal, cantidad DESC
      `),
    ]);

    return NextResponse.json({
      activos: activosRes.recordset,
      stock:   stockRes.recordset,
    });
  } catch (err: unknown) {
    console.error("[dispositivos]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
