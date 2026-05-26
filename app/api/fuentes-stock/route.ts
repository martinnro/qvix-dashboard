import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const FILE = join(process.cwd(), "data", "fuentes_stock.json");

interface FuentaRow {
  id: string;
  fecha: string;
  ingreso: number;
  egreso_salon: number;
  cuadrillas: Record<string, number>;
  observacion: string;
}

function readData(): FuentaRow[] {
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeData(data: FuentaRow[]) {
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
  return NextResponse.json(readData());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = readData();
  const row: FuentaRow = { ...body, id: Date.now().toString() };
  data.push(row);
  writeData(data);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const data = readData().map((r) => (r.id === body.id ? { ...body } : r));
  writeData(data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const data = readData().filter((r) => r.id !== id);
  writeData(data);
  return NextResponse.json({ ok: true });
}
