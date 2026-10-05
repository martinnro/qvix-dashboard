import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

export const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};
export const SUCURSALES_VALIDAS = Object.keys(SUCURSALES).map(Number);

export const TIPOS_DOCUMENTO = ["DNI", "LC", "LE"] as const;
export const VELOCIDADES = ["50MB", "100MB", "200MB", "300MB"] as const;
export const AMBITOS = ["Público", "Privado"] as const;

export const TABLA = "analytics_solicitudes_conexion";

type Pool = Awaited<ReturnType<typeof getPool>>;

// Formulario digital de "Solicitud de conexión" (preventa sin intercambio monetario), reemplaza
// la planilla en papel. Lo puede completar un vendedor logueado (origen='vendedor', se guarda
// quién fue) o cualquier persona desde el QR pegado en la sucursal (origen='qr', anónimo).
//
// Todos los campos de texto libre usan NVARCHAR (no VARCHAR): el driver mssql no transcodifica
// VARCHAR al codepage de la columna, así que cualquier tilde o "ñ" quedaba guardada como basura
// (ej. "Fútbol" -> "F�tbol"). NVARCHAR viaja como UTF-16 y evita el problema por completo.
export async function ensureTable(pool: Pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '${TABLA}')
    CREATE TABLE ${TABLA} (
      id                       INT IDENTITY(1,1) PRIMARY KEY,
      origen                   VARCHAR(20)   NOT NULL,
      vendedor_usuario         NVARCHAR(100) NULL,
      vendedor_nombre          NVARCHAR(150) NULL,
      cod_sucursal             INT           NOT NULL,
      fecha_solicitud          DATETIME      NOT NULL DEFAULT GETDATE(),
      doble_play               BIT           NOT NULL DEFAULT 0,
      velocidad                NVARCHAR(30)  NULL,
      go_tv                    BIT           NOT NULL DEFAULT 0,
      inm_barrio               NVARCHAR(150) NULL,
      inm_localidad            NVARCHAR(100) NULL,
      inm_provincia            NVARCHAR(100) NULL,
      inm_calle                NVARCHAR(150) NULL,
      inm_numero               NVARCHAR(20)  NULL,
      inm_piso                 NVARCHAR(10)  NULL,
      inm_dpto                 NVARCHAR(10)  NULL,
      inm_telefono             NVARCHAR(30)  NULL,
      inm_lat                  FLOAT         NULL,
      inm_lng                  FLOAT         NULL,
      referencia               NVARCHAR(300) NULL,
      titular_apellido_nombre  NVARCHAR(200) NOT NULL,
      titular_tipo_documento   NVARCHAR(5)   NOT NULL,
      titular_numero_documento NVARCHAR(20)  NOT NULL,
      titular_barrio           NVARCHAR(150) NULL,
      titular_localidad        NVARCHAR(100) NULL,
      titular_provincia        NVARCHAR(100) NULL,
      titular_calle            NVARCHAR(150) NULL,
      titular_numero           NVARCHAR(20)  NULL,
      titular_piso             NVARCHAR(10)  NULL,
      titular_dpto             NVARCHAR(10)  NULL,
      titular_telefono         NVARCHAR(30)  NOT NULL,
      titular_email            NVARCHAR(150) NULL,
      lugar_trabajo            NVARCHAR(150) NULL,
      ocupacion                NVARCHAR(100) NULL,
      ambito                   NVARCHAR(15)  NULL,
      precio                   DECIMAL(10,2) NULL,
      cliente_existente        BIT           NOT NULL DEFAULT 0
    )
  `);
}

interface SolicitudInput {
  cod_sucursal: number;
  cliente_existente?: boolean;
  doble_play: boolean;
  velocidad: string | null;
  go_tv: boolean;
  inm_barrio?: string; inm_localidad?: string; inm_provincia?: string;
  inm_calle?: string; inm_numero?: string; inm_piso?: string; inm_dpto?: string; inm_telefono?: string;
  inm_lat?: number | null; inm_lng?: number | null;
  referencia?: string;
  titular_apellido_nombre: string;
  titular_tipo_documento: string;
  titular_numero_documento: string;
  titular_barrio?: string; titular_localidad?: string; titular_provincia?: string;
  titular_calle?: string; titular_numero?: string; titular_piso?: string; titular_dpto?: string;
  titular_telefono: string;
  titular_email?: string;
  lugar_trabajo?: string;
  ocupacion?: string;
  ambito?: string;
  precio?: number | null;
}

function s(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  let body: SolicitudInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const cod_sucursal = Number(body.cod_sucursal);
  if (!SUCURSALES_VALIDAS.includes(cod_sucursal))
    return NextResponse.json({ error: "Sucursal inválida" }, { status: 400 });

  const titular_apellido_nombre = s(body.titular_apellido_nombre, 200);
  const titular_tipo_documento = s(body.titular_tipo_documento, 5);
  const titular_numero_documento = s(body.titular_numero_documento, 20);
  const titular_telefono = s(body.titular_telefono, 30);

  if (!titular_apellido_nombre || !titular_tipo_documento || !titular_numero_documento || !titular_telefono)
    return NextResponse.json({ error: "Faltan datos del titular (nombre, documento y teléfono son obligatorios)" }, { status: 400 });
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(titular_tipo_documento))
    return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });

  const doble_play = body.doble_play === true;
  const go_tv = body.go_tv === true;
  // Cliente que ya tiene internet y solo pide TV: no elige plan ni dirección, se marca aparte.
  const clienteExistente = body.cliente_existente === true;
  const velocidad = s(body.velocidad, 30);
  if (!velocidad && !go_tv)
    return NextResponse.json({ error: "Elegí al menos un servicio (velocidad de internet o GO TV)" }, { status: 400 });

  const inm_lat = typeof body.inm_lat === "number" && Number.isFinite(body.inm_lat) && Math.abs(body.inm_lat) <= 90 ? body.inm_lat : null;
  const inm_lng = typeof body.inm_lng === "number" && Number.isFinite(body.inm_lng) && Math.abs(body.inm_lng) <= 180 ? body.inm_lng : null;
  // Precio del plan elegido al momento de la solicitud — se guarda como "foto" de ese instante,
  // para que no cambie retroactivamente si después se edita el precio del plan.
  const precio = typeof body.precio === "number" && Number.isFinite(body.precio) && body.precio >= 0 ? body.precio : null;

  // Si hay una sesión de vendedor activa, la solicitud queda atribuida a esa persona;
  // si no, se asume que la completó el propio cliente desde el QR.
  const session = await getSession();
  const origen = session.user ? "vendedor" : "qr";
  const vendedor_usuario = session.user?.user ?? null;
  const vendedor_nombre = session.user?.nombre ?? null;

  try {
    const pool = await getPool();
    await ensureTable(pool);

    await pool.request()
      .input("origen", sql.VarChar(20), origen)
      .input("vendedor_usuario", sql.NVarChar(100), vendedor_usuario)
      .input("vendedor_nombre", sql.NVarChar(150), vendedor_nombre)
      .input("cod_sucursal", sql.Int, cod_sucursal)
      .input("doble_play", sql.Bit, doble_play)
      .input("velocidad", sql.NVarChar(30), velocidad)
      .input("go_tv", sql.Bit, go_tv)
      .input("inm_barrio", sql.NVarChar(150), s(body.inm_barrio, 150))
      .input("inm_localidad", sql.NVarChar(100), s(body.inm_localidad, 100))
      .input("inm_provincia", sql.NVarChar(100), s(body.inm_provincia, 100))
      .input("inm_calle", sql.NVarChar(150), s(body.inm_calle, 150))
      .input("inm_numero", sql.NVarChar(20), s(body.inm_numero, 20))
      .input("inm_piso", sql.NVarChar(10), s(body.inm_piso, 10))
      .input("inm_dpto", sql.NVarChar(10), s(body.inm_dpto, 10))
      .input("inm_telefono", sql.NVarChar(30), s(body.inm_telefono, 30))
      .input("inm_lat", sql.Float, inm_lat)
      .input("inm_lng", sql.Float, inm_lng)
      .input("referencia", sql.NVarChar(300), s(body.referencia, 300))
      .input("titular_apellido_nombre", sql.NVarChar(200), titular_apellido_nombre)
      .input("titular_tipo_documento", sql.NVarChar(5), titular_tipo_documento)
      .input("titular_numero_documento", sql.NVarChar(20), titular_numero_documento)
      .input("titular_barrio", sql.NVarChar(150), s(body.titular_barrio, 150))
      .input("titular_localidad", sql.NVarChar(100), s(body.titular_localidad, 100))
      .input("titular_provincia", sql.NVarChar(100), s(body.titular_provincia, 100))
      .input("titular_calle", sql.NVarChar(150), s(body.titular_calle, 150))
      .input("titular_numero", sql.NVarChar(20), s(body.titular_numero, 20))
      .input("titular_piso", sql.NVarChar(10), s(body.titular_piso, 10))
      .input("titular_dpto", sql.NVarChar(10), s(body.titular_dpto, 10))
      .input("titular_telefono", sql.NVarChar(30), titular_telefono)
      .input("titular_email", sql.NVarChar(150), s(body.titular_email, 150))
      .input("lugar_trabajo", sql.NVarChar(150), s(body.lugar_trabajo, 150))
      .input("ocupacion", sql.NVarChar(100), s(body.ocupacion, 100))
      .input("ambito", sql.NVarChar(15), s(body.ambito, 15))
      .input("precio", sql.Decimal(10, 2), precio)
      .input("cliente_existente", sql.Bit, clienteExistente)
      .query(`
        INSERT INTO ${TABLA} (
          origen, vendedor_usuario, vendedor_nombre, cod_sucursal,
          doble_play, velocidad, go_tv,
          inm_barrio, inm_localidad, inm_provincia, inm_calle, inm_numero, inm_piso, inm_dpto, inm_telefono, inm_lat, inm_lng,
          referencia,
          titular_apellido_nombre, titular_tipo_documento, titular_numero_documento,
          titular_barrio, titular_localidad, titular_provincia, titular_calle, titular_numero, titular_piso, titular_dpto,
          titular_telefono, titular_email, lugar_trabajo, ocupacion, ambito, precio, cliente_existente
        ) VALUES (
          @origen, @vendedor_usuario, @vendedor_nombre, @cod_sucursal,
          @doble_play, @velocidad, @go_tv,
          @inm_barrio, @inm_localidad, @inm_provincia, @inm_calle, @inm_numero, @inm_piso, @inm_dpto, @inm_telefono, @inm_lat, @inm_lng,
          @referencia,
          @titular_apellido_nombre, @titular_tipo_documento, @titular_numero_documento,
          @titular_barrio, @titular_localidad, @titular_provincia, @titular_calle, @titular_numero, @titular_piso, @titular_dpto,
          @titular_telefono, @titular_email, @lugar_trabajo, @ocupacion, @ambito, @precio, @cliente_existente
        )
      `);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[solicitudes-conexion/public POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
