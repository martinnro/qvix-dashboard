import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import sql from "mssql";

interface FuentaRow {
  id: string;
  fecha: string;
  ingreso: number;
  egreso_salon: number;
  cuadrillas: Record<string, number>;
  observacion: string;
}

export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, CONVERT(VARCHAR(10), fecha, 120) AS fecha,
             ingreso, egreso_salon, cuadrillas, observacion
      FROM fuentes_stock
      ORDER BY fecha DESC, id DESC
    `);
    const rows: FuentaRow[] = result.recordset.map((r) => ({
      ...r,
      cuadrillas: JSON.parse(r.cuadrillas ?? "{}"),
    }));
    return NextResponse.json(rows);
  } catch (err: unknown) {
    console.error("[fuentes-stock GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: Omit<FuentaRow, "id"> = await req.json();
    const id = Date.now().toString();
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.VarChar(50), id)
      .input("fecha", sql.Date, body.fecha)
      .input("ingreso", sql.Int, body.ingreso ?? 0)
      .input("egreso_salon", sql.Int, body.egreso_salon ?? 0)
      .input("cuadrillas", sql.NVarChar(sql.MAX), JSON.stringify(body.cuadrillas ?? {}))
      .input("observacion", sql.NVarChar(500), body.observacion ?? "")
      .query(`
        INSERT INTO fuentes_stock (id, fecha, ingreso, egreso_salon, cuadrillas, observacion)
        VALUES (@id, @fecha, @ingreso, @egreso_salon, @cuadrillas, @observacion)
      `);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[fuentes-stock POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body: FuentaRow = await req.json();
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.VarChar(50), body.id)
      .input("fecha", sql.Date, body.fecha)
      .input("ingreso", sql.Int, body.ingreso ?? 0)
      .input("egreso_salon", sql.Int, body.egreso_salon ?? 0)
      .input("cuadrillas", sql.NVarChar(sql.MAX), JSON.stringify(body.cuadrillas ?? {}))
      .input("observacion", sql.NVarChar(500), body.observacion ?? "")
      .query(`
        UPDATE fuentes_stock
        SET fecha        = @fecha,
            ingreso      = @ingreso,
            egreso_salon = @egreso_salon,
            cuadrillas   = @cuadrillas,
            observacion  = @observacion
        WHERE id = @id
      `);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[fuentes-stock PUT]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id }: { id: string } = await req.json();
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.VarChar(50), id)
      .query(`DELETE FROM fuentes_stock WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[fuentes-stock DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
