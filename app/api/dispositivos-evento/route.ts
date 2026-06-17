import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

const ENSURE_TABLE = `
  IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='dashboard_dispositivos_evento' AND xtype='U')
  CREATE TABLE dashboard_dispositivos_evento (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    fecha NVARCHAR(20) NOT NULL,
    evento NVARCHAR(200) NOT NULL,
    tipo NVARCHAR(100) NOT NULL,
    sucursal NVARCHAR(100) NOT NULL,
    cantidad INT NOT NULL DEFAULT 0,
    fecha_carga DATETIME NOT NULL DEFAULT GETDATE()
  )
`;

export async function GET() {
  try {
    const pool = await getPool();
    await pool.request().query(ENSURE_TABLE);
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
    await pool.request().query(ENSURE_TABLE);
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
