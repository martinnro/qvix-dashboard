import { NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";

// Lista maestra de estados de servicio (tabla chica, ~18 filas) — vive en su propia ruta para
// no depender de /api/clientes-tv, que corre agregaciones pesadas sobre todas las conexiones y
// sucursales y podía tardar tanto que el fetch nunca resolvía, dejando el mapa solo con el
// fallback de Conectado/Suspendido.
export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id_estado_servicio AS id, descripcion AS nombre
      FROM tipo_estado_servicio
      ORDER BY id_estado_servicio
    `);
    return NextResponse.json(result.recordset);
  } catch (err: unknown) {
    console.error("[estados-servicio]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
