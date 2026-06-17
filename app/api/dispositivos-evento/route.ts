import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const DATA_FILE = path.join(process.cwd(), "data", "dispositivos_evento.json");

interface DispositivoRow {
  id: string;
  fecha: string;
  evento: string;
  tipo: string;
  sucursal: string;
  cantidad: number;
}

function readData(): DispositivoRow[] {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeData(data: DispositivoRow[]) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(readData());
}

export async function POST(req: NextRequest) {
  try {
    const body: Omit<DispositivoRow, "id"> = await req.json();
    const data = readData();
    const newRow: DispositivoRow = { id: Date.now().toString(), ...body };
    writeData([...data, newRow]);
    return NextResponse.json(newRow);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id }: { id: string } = await req.json();
    writeData(readData().filter((r) => r.id !== id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
