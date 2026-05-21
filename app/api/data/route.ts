import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT servicio, organizacion, CONVERT(varchar, fecha, 23) AS fecha, stb, movil
      FROM dashboard_gotv_data
      ORDER BY fecha DESC, organizacion
    `);
    const rows = result.recordset;
    const header = "servicio,organizacion,fecha,stb,movil";
    const lines = rows.map((r: Record<string, unknown>) =>
      `${r.servicio},${r.organizacion},${r.fecha},${r.stb},${r.movil}`
    );
    return new NextResponse([header, ...lines].join("\n") + "\n", {
      headers: { "Content-Type": "text/csv" },
    });
  } catch {
    return new NextResponse("servicio,organizacion,fecha,stb,movil\n", {
      headers: { "Content-Type": "text/csv" },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { servicio = "GOTV", organizacion, fecha, stb, movil } = body;

    if (!organizacion || !fecha || stb === undefined || movil === undefined) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const pool = await getPool();
    await pool.request()
      .input("servicio", servicio)
      .input("organizacion", organizacion)
      .input("fecha", fecha)
      .input("stb", Number(stb))
      .input("movil", Number(movil))
      .query(`
        MERGE dashboard_gotv_data AS target
        USING (SELECT @servicio AS servicio, @organizacion AS organizacion, @fecha AS fecha) AS src
          ON target.servicio = src.servicio AND target.organizacion = src.organizacion AND target.fecha = src.fecha
        WHEN MATCHED THEN
          UPDATE SET stb = @stb, movil = @movil, fecha_carga = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (servicio, organizacion, fecha, stb, movil)
          VALUES (@servicio, @organizacion, @fecha, @stb, @movil);
      `);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { servicio, organizacion, fecha } = await req.json();
    const pool = await getPool();
    await pool.request()
      .input("servicio", servicio)
      .input("organizacion", organizacion)
      .input("fecha", fecha)
      .query(`
        DELETE FROM dashboard_gotv_data
        WHERE servicio = @servicio AND organizacion = @organizacion AND fecha = @fecha
      `);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
