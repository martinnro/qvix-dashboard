import { NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const sucursales = (session.user.sucursales ?? SUCURSALES_VALIDAS).filter((s) => SUCURSALES_VALIDAS.includes(s));
  return NextResponse.json({ sucursales });
}
