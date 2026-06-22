import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, fecha, evento, sucursal,
             clientes_online, clientes_total,
             dispositivos_online, dispositivos_total
      FROM dashboard_infraestructura
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
    const { fecha, evento, sucursal, clientes_online, clientes_total, dispositivos_online, dispositivos_total } = body;
    const id = Date.now().toString();
    const pool = await getPool();
    await pool.request()
      .input("id", id)
      .input("fecha", fecha)
      .input("evento", evento)
      .input("sucursal", sucursal)
      .input("clientes_online", Number(clientes_online ?? 0))
      .input("clientes_total", Number(clientes_total ?? 0))
      .input("dispositivos_online", Number(dispositivos_online ?? 0))
      .input("dispositivos_total", Number(dispositivos_total ?? 0))
      .query(`
        INSERT INTO dashboard_infraestructura
          (id, fecha, evento, sucursal, clientes_online, clientes_total, dispositivos_online, dispositivos_total)
        VALUES
          (@id, @fecha, @evento, @sucursal, @clientes_online, @clientes_total, @dispositivos_online, @dispositivos_total)
      `);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, fecha, evento, sucursal, clientes_online, clientes_total, dispositivos_online, dispositivos_total } = body;
    const pool = await getPool();
    await pool.request()
      .input("id", id)
      .input("fecha", fecha)
      .input("evento", evento)
      .input("sucursal", sucursal)
      .input("clientes_online", Number(clientes_online ?? 0))
      .input("clientes_total", Number(clientes_total ?? 0))
      .input("dispositivos_online", Number(dispositivos_online ?? 0))
      .input("dispositivos_total", Number(dispositivos_total ?? 0))
      .query(`
        UPDATE dashboard_infraestructura
        SET fecha = @fecha, evento = @evento, sucursal = @sucursal,
            clientes_online = @clientes_online, clientes_total = @clientes_total,
            dispositivos_online = @dispositivos_online, dispositivos_total = @dispositivos_total
        WHERE id = @id
      `);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const pool = await getPool();
    await pool.request()
      .input("id", id)
      .query("DELETE FROM dashboard_infraestructura WHERE id = @id");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
