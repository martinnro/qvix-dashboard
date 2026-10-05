import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const TABLA = "analytics_planes_conexion";
const TIPOS = ["internet", "doble_play", "tv"] as const;
export type TipoPlan = (typeof TIPOS)[number];

// Set fijo de íconos que puede elegir el panel — se mapean a componentes de lucide-react
// tanto en el panel de administración como en el formulario público.
export const ICONOS_ITEM = ["film", "box", "monitor", "instalacion"] as const;
export type IconoItem = (typeof ICONOS_ITEM)[number];

export interface PlanItem {
  icono: IconoItem;
  titulo: string;
  texto: string;
}

export interface PlanConexion {
  id: number;
  nombre: string;
  precio: number;
  precio_lista: number | null;
  orden: number;
  tipo: TipoPlan;
  incluye: PlanItem[];
  condiciones: string | null;
}

function parseNombre(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().slice(0, 30);
  return trimmed || null;
}

function parsePrecio(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Texto libre de condiciones, una condición por línea. Vacío se guarda como NULL.
function parseCondiciones(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().slice(0, 2000);
  return trimmed || null;
}

// Precio de lista (tachado) es opcional: vacío o inválido se guarda como NULL.
function parsePrecioLista(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  return parsePrecio(v);
}

function parseTipo(v: unknown): TipoPlan | null {
  return (TIPOS as readonly string[]).includes(v as string) ? (v as TipoPlan) : null;
}

// Valida y normaliza la lista de items "qué incluye" que manda el panel — se descarta
// cualquier item sin título o con un ícono fuera del set permitido.
function parseIncluye(v: unknown): PlanItem[] {
  if (!Array.isArray(v)) return [];
  const items: PlanItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const icono = (ICONOS_ITEM as readonly string[]).includes(r.icono as string) ? (r.icono as IconoItem) : ICONOS_ITEM[0];
    const titulo = typeof r.titulo === "string" ? r.titulo.trim().slice(0, 40) : "";
    const texto = typeof r.texto === "string" ? r.texto.trim().slice(0, 150) : "";
    if (!titulo) continue;
    items.push({ icono, titulo, texto });
  }
  return items.slice(0, 8);
}

function parseIncluyeColumna(raw: string | null): PlanItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parseIncluye(parsed);
  } catch {
    return [];
  }
}

// Público: el formulario de /solicitud necesita leer los planes sin estar logueado.
export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, nombre, precio, precio_lista, orden, tipo, incluye, condiciones FROM ${TABLA} ORDER BY tipo ASC, orden ASC, precio ASC, id ASC
    `);
    const planes = result.recordset.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      precio: r.precio,
      precio_lista: r.precio_lista,
      orden: r.orden,
      tipo: r.tipo,
      incluye: parseIncluyeColumna(r.incluye),
      condiciones: r.condiciones,
    })) as PlanConexion[];
    return NextResponse.json({ planes });
  } catch (err: unknown) {
    console.error("[planes-conexion GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Crear, modificar y eliminar sí requieren sesión — solo el panel interno gestiona planes.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const nombre = parseNombre(body.nombre);
  const precio = parsePrecio(body.precio);
  const precioLista = parsePrecioLista(body.precio_lista);
  const condiciones = parseCondiciones(body.condiciones);
  const orden = Number.isFinite(Number(body.orden)) ? Number(body.orden) : 0;
  const tipo = parseTipo(body.tipo);
  const incluye = parseIncluye(body.incluye);

  if (!nombre) return NextResponse.json({ error: "Falta el nombre del plan" }, { status: 400 });
  if (precio === null) return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
  if (!tipo) return NextResponse.json({ error: "Tipo de plan inválido" }, { status: 400 });

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("nombre", sql.NVarChar(30), nombre)
      .input("precio", sql.Decimal(10, 2), precio)
      .input("precio_lista", sql.Decimal(10, 2), precioLista)
      .input("orden", sql.Int, orden)
      .input("tipo", sql.VarChar(20), tipo)
      .input("incluye", sql.NVarChar(sql.MAX), JSON.stringify(incluye))
      .input("condiciones", sql.NVarChar(sql.MAX), condiciones)
      .query(`
        INSERT INTO ${TABLA} (nombre, precio, precio_lista, orden, tipo, incluye, condiciones)
        OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.precio, INSERTED.precio_lista, INSERTED.orden, INSERTED.tipo, INSERTED.incluye, INSERTED.condiciones
        VALUES (@nombre, @precio, @precio_lista, @orden, @tipo, @incluye, @condiciones)
      `);
    const row = result.recordset[0];
    return NextResponse.json({ plan: { ...row, incluye: parseIncluyeColumna(row.incluye) } });
  } catch (err: unknown) {
    console.error("[planes-conexion POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const id = Number(body.id);
  const nombre = parseNombre(body.nombre);
  const precio = parsePrecio(body.precio);
  const precioLista = parsePrecioLista(body.precio_lista);
  const condiciones = parseCondiciones(body.condiciones);
  const orden = Number.isFinite(Number(body.orden)) ? Number(body.orden) : 0;
  const tipo = parseTipo(body.tipo);
  const incluye = parseIncluye(body.incluye);

  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del plan" }, { status: 400 });
  if (precio === null) return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
  if (!tipo) return NextResponse.json({ error: "Tipo de plan inválido" }, { status: 400 });

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.Int, id)
      .input("nombre", sql.NVarChar(30), nombre)
      .input("precio", sql.Decimal(10, 2), precio)
      .input("precio_lista", sql.Decimal(10, 2), precioLista)
      .input("orden", sql.Int, orden)
      .input("tipo", sql.VarChar(20), tipo)
      .input("incluye", sql.NVarChar(sql.MAX), JSON.stringify(incluye))
      .input("condiciones", sql.NVarChar(sql.MAX), condiciones)
      .query(`UPDATE ${TABLA} SET nombre = @nombre, precio = @precio, precio_lista = @precio_lista, orden = @orden, tipo = @tipo, incluye = @incluye, condiciones = @condiciones WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[planes-conexion PUT]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await req.json();
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    const pool = await getPool();
    await pool.request().input("id", sql.Int, idNum).query(`DELETE FROM ${TABLA} WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[planes-conexion DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
