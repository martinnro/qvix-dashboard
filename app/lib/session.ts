import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  user?: {
    user: string;
    nombre: string;
    sucursales: number[] | null;
    secciones: string[] | null;
  };
}

const sessionOptions = {
  password: process.env.SESSION_SECRET ?? "fallback_secret_minimo_32_caracteres_xx",
  cookieName: "qvix_session",
  cookieOptions: { secure: process.env.NODE_ENV === "production" },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
