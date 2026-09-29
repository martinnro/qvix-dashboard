import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT TOP 50
        id,
        CONVERT(VARCHAR, fecha_cambio, 120) AS fecha_cambio,
        licencias_ant,
        licencias_new,
        usuario
      FROM dashboard_licencias_historial
      ORDER BY fecha_cambio DESC
    `);
    return NextResponse.json(result.recordset);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { licencias_ant, licencias_new } = await req.json();
    if (typeof licencias_ant !== "number" || typeof licencias_new !== "number")
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const pool = await getPool();
    await pool.request()
      .input("ant", licencias_ant)
      .input("nw", licencias_new)
      .input("usr", session.user.nombre ?? session.user.user)
      .query(`
        INSERT INTO dashboard_licencias_historial (licencias_ant, licencias_new, usuario)
        VALUES (@ant, @nw, @usr)
      `);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
