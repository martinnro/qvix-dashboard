import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Formularios de contacto del sitio institucional (repo ultranet-web: index, que-ver, contacto y
// empresas). Ese sitio es estático, así que manda los datos acá y esta ruta los reenvía por mail.
//
// Variables de entorno (en Vercel):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  cuenta que envía (ej. contacto@ultranet.com.ar)
//   CONTACTO_DESTINO   a quién llega; por defecto contacto@ultranet.com.ar (acepta varias, con coma)
//   CONTACTO_ORIGENES  sitios que pueden usar el formulario, separados por coma

const DESTINO = process.env.CONTACTO_DESTINO ?? "contacto@ultranet.com.ar";
const ORIGENES = (process.env.CONTACTO_ORIGENES ?? "https://www.ultranet.com.ar,https://ultranet.com.ar,http://localhost:8000")
  .split(",").map((o) => o.trim()).filter(Boolean);

// Límite anti-spam por IP. Vive en memoria de cada instancia, así que es aproximado; junto con el
// campo trampa alcanza para frenar los envíos automáticos más comunes.
const MAX_POR_HORA = 5;
const enviosPorIp = new Map<string, number[]>();

function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return ORIGENES.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" }
    : {};
}

function responder(req: NextRequest, body: { ok: boolean; error?: string }, status = 200) {
  return NextResponse.json(body, { status, headers: cors(req) });
}

// Texto de una sola línea: sin saltos (evita inyectar cabeceras) y con largo máximo.
function campo(datos: FormData, nombre: string, max = 200): string {
  const v = datos.get(nombre);
  return typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "";
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  if (!cors(req)["Access-Control-Allow-Origin"]) return responder(req, { ok: false, error: "Origen no permitido" }, 403);

  let datos: FormData;
  try {
    datos = await req.formData();
  } catch {
    return responder(req, { ok: false, error: "Datos inválidos" }, 400);
  }

  // Campo trampa: las personas no lo ven, los robots lo completan
  if (campo(datos, "web")) return responder(req, { ok: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  const ahora = Date.now();
  const envios = (enviosPorIp.get(ip) ?? []).filter((t) => t > ahora - 3600_000);
  if (envios.length >= MAX_POR_HORA)
    return responder(req, { ok: false, error: "Hiciste muchos envíos seguidos. Probá más tarde o llamanos." }, 429);

  const nombre = campo(datos, "nombre", 100);
  const empresa = campo(datos, "empresa", 100);
  const cp = campo(datos, "cp", 10);
  const telefono = campo(datos, "telefono", 30);
  const email = campo(datos, "email", 120);
  const motivo = campo(datos, "motivo", 60);
  const cliente = campo(datos, "cliente", 30);
  const sucursal = campo(datos, "sucursal", 40);
  const horario = campo(datos, "horario", 40);
  const esCliente = Boolean(campo(datos, "es_cliente"));
  const consulta = (typeof datos.get("consulta") === "string" ? (datos.get("consulta") as string) : "").trim().slice(0, 3000);
  const pagina = campo(datos, "pagina", 60);

  if (!nombre || !cp || !telefono || !motivo || !sucursal)
    return responder(req, { ok: false, error: "Completá los campos obligatorios." }, 422);
  if (!/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(email))
    return responder(req, { ok: false, error: "El email no es válido." }, 422);
  if (!/^[0-9+()\s-]{6,30}$/.test(telefono))
    return responder(req, { ok: false, error: "El teléfono no es válido." }, 422);
  if (!campo(datos, "consentimiento"))
    return responder(req, { ok: false, error: "Falta aceptar el tratamiento de datos." }, 422);

  const lineas: [string, string][] = [
    ["Motivo", motivo],
    ["Nombre", nombre],
    ["Empresa", empresa],
    ["Teléfono", telefono],
    ["Email", email],
    ["Código postal", cp],
    ["Sucursal", sucursal],
    ["Horario", horario],
    ["Ya es cliente", esCliente ? "Sí" : "No"],
    ["N.º cliente / DNI", cliente],
  ];
  const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Catamarca" });
  const texto =
    lineas.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nConsulta:\n${consulta || "(sin texto)"}\n` +
    `\n--\nEnviado desde la web (${pagina}) el ${fecha} · IP ${ip}\n`;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error("[contacto-web] Faltan las variables SMTP_HOST, SMTP_USER o SMTP_PASS");
    return responder(req, { ok: false, error: "No pudimos enviar tu consulta. Probá de nuevo o llamanos." }, 500);
  }

  try {
    const puerto = Number(SMTP_PORT ?? 465);
    const transporte = nodemailer.createTransport({
      host: SMTP_HOST,
      port: puerto,
      secure: puerto === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporte.sendMail({
      from: { name: "ULTRANET Web", address: SMTP_USER },
      to: DESTINO,
      replyTo: { name: nombre, address: email },
      subject: `[Web] ${motivo} – ${nombre}`,
      text: texto,
    });
  } catch (err: unknown) {
    console.error("[contacto-web POST]", err);
    return responder(req, { ok: false, error: "No pudimos enviar tu consulta. Probá de nuevo o llamanos." }, 500);
  }

  enviosPorIp.set(ip, [...envios, ahora]);
  return responder(req, { ok: true });
}
