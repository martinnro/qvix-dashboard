import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT a.id, a.senal_id, s.nombre AS senal_nombre, a.fecha, a.cantidad
      FROM analytics_analisis_senales a
      JOIN analytics_tv_senales s ON a.senal_id = s.id
      ORDER BY a.fecha DESC, s.nombre
    `);
    return NextResponse.json(result.recordset);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { senal_id, fecha, cantidad } = await req.json();
    const id = Date.now().toString();
    const pool = await getPool();
    await pool
      .request()
      .input("id", id)
      .input("senal_id", senal_id)
      .input("fecha", fecha)
      .input("cantidad", cantidad)
      .query(`INSERT INTO analytics_analisis_senales (id, senal_id, fecha, cantidad) VALUES (@id, @senal_id, @fecha, @cantidad)`);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, senal_id, fecha, cantidad } = await req.json();
    const pool = await getPool();
    await pool
      .request()
      .input("id", id)
      .input("senal_id", senal_id)
      .input("fecha", fecha)
      .input("cantidad", cantidad)
      .query(`UPDATE analytics_analisis_senales SET senal_id=@senal_id, fecha=@fecha, cantidad=@cantidad WHERE id=@id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const pool = await getPool();
    await pool.request().input("id", id).query(`DELETE FROM analytics_analisis_senales WHERE id=@id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
