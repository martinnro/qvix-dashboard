import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const FILE = join(process.cwd(), "data", "pines_custom.json");

export interface PinCustom {
  id: string;
  titulo: string;
  cx?: string;
  abonado?: string;
  barrio?: string;
  lat: number;
  lng: number;
  color: string;
  sucursal: number;
  url_origen?: string;
}

function readData(): PinCustom[] {
  try { return JSON.parse(readFileSync(FILE, "utf-8")); }
  catch { return []; }
}

function writeData(data: PinCustom[]) {
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
  return NextResponse.json(readData());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = readData();
  const pin: PinCustom = { ...body, id: Date.now().toString() };
  data.push(pin);
  writeData(data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  writeData(readData().filter((p) => p.id !== id));
  return NextResponse.json({ ok: true });
}
