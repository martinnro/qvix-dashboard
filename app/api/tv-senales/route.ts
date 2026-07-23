import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(
      `SELECT id, nombre, descripcion FROM analytics_tv_senales ORDER BY nombre`
    );
    return NextResponse.json(result.recordset);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nombre, descripcion } = await req.json();
    const id = Date.now().toString();
    const pool = await getPool();
    await pool
      .request()
      .input("id", id)
      .input("nombre", nombre)
      .input("descripcion", descripcion ?? null)
      .query(`INSERT INTO analytics_tv_senales (id, nombre, descripcion) VALUES (@id, @nombre, @descripcion)`);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, nombre, descripcion } = await req.json();
    const pool = await getPool();
    await pool
      .request()
      .input("id", id)
      .input("nombre", nombre)
      .input("descripcion", descripcion ?? null)
      .query(`UPDATE analytics_tv_senales SET nombre=@nombre, descripcion=@descripcion WHERE id=@id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const pool = await getPool();
    // Delete entries first (FK constraint)
    await pool.request().input("id", id).query(`DELETE FROM analytics_analisis_senales WHERE senal_id=@id`);
    await pool.request().input("id", id).query(`DELETE FROM analytics_tv_senales WHERE id=@id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
