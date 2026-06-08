import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

function normalizeMac(raw: string): string {
  return raw.replace(/[:\-.\s]/g, "").toUpperCase();
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const macRaw = req.nextUrl.searchParams.get("mac") ?? "";
  const mac = normalizeMac(macRaw);
  if (mac.length < 6) return NextResponse.json({ error: "MAC inválida" }, { status: 400 });

  try {
    const pool = await getPool();

    const [stockRes, conexRes] = await Promise.all([
      pool.request().input("mac", mac).query(`
        SELECT TOP 1
          s.cod_sucursal,
          s.cantidad_actual,
          s.fecha_carga,
          s.mac,
          d.nombre_dispositivo AS modelo,
          CASE d.tipo_dispositivo WHEN 'B' THEN 'ONT' ELSE 'Deco/STB' END AS tipo
        FROM stock s
        JOIN DISPOSITIVOS d ON d.id_dispositivo = s.id_dispositivo
        WHERE UPPER(REPLACE(REPLACE(REPLACE(s.mac, ':', ''), '-', ''), ' ', '')) = @mac
      `),
      pool.request().input("mac", mac).query(`
        SELECT
          cd.id_conexion,
          cd.estado        AS estado_asignacion,
          cd.fecha_carga   AS fecha_asignacion,
          cd.cod_sucursal,
          vcd.Estado_Servicio,
          ts.descripcion   AS estado_nombre
        FROM conexion_dispostivos cd
        JOIN v_con_dom vcd ON vcd.id_conexion = cd.id_conexion
        LEFT JOIN tipo_estado_servicio ts ON ts.id_estado_servicio = vcd.Estado_Servicio
        WHERE UPPER(REPLACE(REPLACE(REPLACE(cd.mac, ':', ''), '-', ''), ' ', '')) = @mac
        ORDER BY cd.fecha_carga DESC
      `),
    ]);

    const stock = stockRes.recordset[0] ?? null;
    const conexiones = conexRes.recordset;

    return NextResponse.json({
      mac,
      encontrado: stock !== null || conexiones.length > 0,
      stock,
      conexiones,
    });
  } catch (err: unknown) {
    console.error("[mac]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
