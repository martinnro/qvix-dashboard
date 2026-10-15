import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

interface AuthUser {
  user: string;
  pass: string;
  nombre: string;
  sucursales?: number[] | null;
  secciones?: string[] | null;
}

function getUsers(): AuthUser[] {
  try {
    return JSON.parse(process.env.AUTH_USERS ?? "[]");
  } catch (err) {
    // Si AUTH_USERS queda mal formado (comillas raras al pegar, truncado, etc.) nadie puede
    // loguearse y sin este log no queda rastro de por qué — se ve en los logs de Vercel.
    console.error("[auth/login] AUTH_USERS inválido:", err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  const { user, pass } = await req.json();

  const found = getUsers().find((u) => u.user === user && u.pass === pass);
  if (!found) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }

  const session = await getSession();
  session.user = {
    user: found.user,
    nombre: found.nombre,
    sucursales: found.sucursales ?? null,
    secciones: found.secciones ?? null,
  };
  await session.save();

  return NextResponse.json({ ok: true });
}
