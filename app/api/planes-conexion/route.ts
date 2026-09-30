import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const TABLA = "analytics_planes_conexion";
const TIPOS = ["internet", "doble_play"] as const;
export type TipoPlan = (typeof TIPOS)[number];

export interface PlanConexion {
  id: number;
  nombre: string;
  precio: number;
  orden: number;
  tipo: TipoPlan;
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

function parseTipo(v: unknown): TipoPlan | null {
  return (TIPOS as readonly string[]).includes(v as string) ? (v as TipoPlan) : null;
}

// Público: el formulario de /solicitud necesita leer los planes sin estar logueado.
export async function GET() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, nombre, precio, orden, tipo FROM ${TABLA} ORDER BY tipo ASC, orden ASC, precio ASC, id ASC
    `);
    return NextResponse.json({ planes: result.recordset as PlanConexion[] });
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
  const orden = Number.isFinite(Number(body.orden)) ? Number(body.orden) : 0;
  const tipo = parseTipo(body.tipo);

  if (!nombre) return NextResponse.json({ error: "Falta el nombre del plan" }, { status: 400 });
  if (precio === null) return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
  if (!tipo) return NextResponse.json({ error: "Tipo de plan inválido" }, { status: 400 });

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("nombre", sql.VarChar(30), nombre)
      .input("precio", sql.Decimal(10, 2), precio)
      .input("orden", sql.Int, orden)
      .input("tipo", sql.VarChar(20), tipo)
      .query(`
        INSERT INTO ${TABLA} (nombre, precio, orden, tipo)
        OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.precio, INSERTED.orden, INSERTED.tipo
        VALUES (@nombre, @precio, @orden, @tipo)
      `);
    return NextResponse.json({ plan: result.recordset[0] });
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
  const orden = Number.isFinite(Number(body.orden)) ? Number(body.orden) : 0;
  const tipo = parseTipo(body.tipo);

  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del plan" }, { status: 400 });
  if (precio === null) return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
  if (!tipo) return NextResponse.json({ error: "Tipo de plan inválido" }, { status: 400 });

  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(30), nombre)
      .input("precio", sql.Decimal(10, 2), precio)
      .input("orden", sql.Int, orden)
      .input("tipo", sql.VarChar(20), tipo)
      .query(`UPDATE ${TABLA} SET nombre = @nombre, precio = @precio, orden = @orden, tipo = @tipo WHERE id = @id`);
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
