import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, fecha, evento, tipo, sucursal, cantidad
      FROM dashboard_dispositivos_evento
      ORDER BY fecha DESC, evento
    `);
    return NextResponse.json(result.recordset);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fecha, evento, tipo, sucursal, cantidad } = body;
    const id = Date.now().toString();
    const pool = await getPool();
    await pool.request()
      .input("id", id)
      .input("fecha", fecha)
      .input("evento", evento)
      .input("tipo", tipo)
      .input("sucursal", sucursal)
      .input("cantidad", Number(cantidad ?? 0))
      .query(`
        INSERT INTO dashboard_dispositivos_evento
          (id, fecha, evento, tipo, sucursal, cantidad)
        VALUES
          (@id, @fecha, @evento, @tipo, @sucursal, @cantidad)
      `);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, fecha, evento, tipo, sucursal, cantidad } = body;
    const pool = await getPool();
    await pool.request()
      .input("id", id)
      .input("fecha", fecha)
      .input("evento", evento)
      .input("tipo", tipo)
      .input("sucursal", sucursal)
      .input("cantidad", Number(cantidad ?? 0))
      .query(`
        UPDATE dashboard_dispositivos_evento
        SET fecha = @fecha, evento = @evento, tipo = @tipo,
            sucursal = @sucursal, cantidad = @cantidad
        WHERE id = @id
      `);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[dispositivos-evento PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const pool = await getPool();
    await pool.request()
      .input("id", id)
      .query("DELETE FROM dashboard_dispositivos_evento WHERE id = @id");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
