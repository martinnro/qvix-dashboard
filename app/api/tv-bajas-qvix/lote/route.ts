import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const mes = req.nextUrl.searchParams.get("mes");
  if (!mes) return NextResponse.json({ error: "Falta parámetro mes" }, { status: 400 });

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("mes", mes)
      .query(`
        SELECT
          id_conexion AS conexion,
          nombre,
          cod_sucursal,
          concepto_tv,
          fecha_baja,
          guardado_por
        FROM analytics_bajasqvix
        WHERE lote_mes = @mes
        ORDER BY id_conexion
      `);
    return NextResponse.json(result.recordset);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const mes = req.nextUrl.searchParams.get("mes");
  if (!mes) return NextResponse.json({ error: "Falta parámetro mes" }, { status: 400 });

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input("mes", mes)
      .query(`DELETE FROM analytics_bajasqvix WHERE lote_mes = @mes`);
    return NextResponse.json({ ok: true, eliminados: r.rowsAffected[0] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
