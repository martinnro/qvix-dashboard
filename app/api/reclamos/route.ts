import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const DATA_FILE = path.join(process.cwd(), "data", "reclamos_limpio.csv");

export async function GET() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return new NextResponse(
        "id_incidencia,fecha_reclamo,problema_mini,fecha_solucion,ls_nombre_cuadrilla,nom_barrio,id_conexion,solucion,descripcion\n",
        { headers: { "Content-Type": "text/csv" } }
      );
    }
    const csv = fs.readFileSync(DATA_FILE, "utf-8");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv" } });
  } catch (err: unknown) {
    console.error("[reclamos GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
