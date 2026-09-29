import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/app/lib/session";

const sessionOptions = {
  password: process.env.SESSION_SECRET ?? "fallback_secret_minimo_32_caracteres_xx",
  cookieName: "qvix_session",
  cookieOptions: { secure: process.env.NODE_ENV === "production" },
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /solicitud: formulario público de preventa (QR en vidriera, sin login).
  // /api/solicitudes-conexion/public: el POST que ese formulario usa para guardar.
  // El listado en /api/solicitudes-conexion (sin /public) sigue protegido.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/solicitud") ||
    pathname.startsWith("/api/solicitudes-conexion/public")
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.webp|.*\\.ico).*)"],
};
