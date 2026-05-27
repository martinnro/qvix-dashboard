import { NextRequest, NextResponse } from "next/server";

function extractCoords(url: string): { lat: number; lng: number } | null {
  // Patrón 1: /@lat,lng,zoom
  const m1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m1) return { lat: parseFloat(m1[1]), lng: parseFloat(m1[2]) };

  // Patrón 2: !3d<lat>!4d<lng>
  const m2 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m2) return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) };

  return null;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "URL requerida" }, { status: 400 });

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const finalUrl = res.url;
    const coords = extractCoords(decodeURIComponent(finalUrl));
    if (!coords) return NextResponse.json({ error: "No se pudieron extraer las coordenadas. Verificá el link." }, { status: 422 });
    return NextResponse.json({ ...coords, finalUrl });
  } catch {
    return NextResponse.json({ error: "No se pudo resolver la URL." }, { status: 500 });
  }
}
