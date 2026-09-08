import { NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES_VALIDAS = [1, 4, 5, 6, 7, 8];

const WHERE_TV = `(
    fco.descripcion LIKE '%GO TV%'
    OR fco.descripcion LIKE '%SONO PACK%'
    OR fco.descripcion = 'CABLE TV'
  )
  AND fco.descripcion NOT LIKE '%DESC%'
  AND fco.descripcion NOT LIKE '%BONIF%'
  AND fco.descripcion NOT LIKE '%INSTAL%'
  AND fco.descripcion NOT LIKE '%PROMO%'
  AND fco.descripcion NOT LIKE '%FUTBOL%'
  AND fco.descripcion NOT LIKE '%DEPORTI%'
  AND fco.descripcion NOT LIKE '%HBO%'
  AND fco.descripcion NOT LIKE '%CINE%'
  AND fco.descripcion NOT LIKE '%UNIVERSAL%'
  AND fco.descripcion NOT LIKE '%SENSA%'`;

const WHERE_TV2 = WHERE_TV.replace(/fco\./g, "fco2.");

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: permitidas } = session.user;
  const sucursalesBase = (permitidas ?? SUCURSALES_VALIDAS).filter((s) =>
    SUCURSALES_VALIDAS.includes(s)
  );

  const pool = await getPool();
  try {
    const result = await pool.request().query(`
      WITH bajas_tv AS (
        SELECT
          fc.id_conexion,
          fc.cod_concepto,
          fco.descripcion,
          fc.fecha_carga,
          ROW_NUMBER() OVER (
            PARTITION BY fc.id_conexion
            ORDER BY fc.fecha_carga DESC
          ) AS rn
        FROM facturas_cuentas fc WITH (NOLOCK)
        INNER JOIN facturas_conceptos fco WITH (NOLOCK) ON fco.cod_concepto = fc.cod_concepto
        WHERE fc.estado = 9
          AND ${WHERE_TV}
          AND NOT EXISTS (
            SELECT 1 FROM facturas_cuentas fc2 WITH (NOLOCK)
            INNER JOIN facturas_conceptos fco2 WITH (NOLOCK) ON fco2.cod_concepto = fc2.cod_concepto
            WHERE fc2.id_conexion = fc.id_conexion AND fc2.estado = 0
              AND ${WHERE_TV2}
          )
      )
      SELECT
        b.id_conexion      AS conexion,
        ab.apellido_nombre AS nombre,
        con.cod_sucursal,
        b.descripcion      AS concepto_tv,
        CONVERT(VARCHAR, b.fecha_carga, 5) AS fecha_baja,
        CASE WHEN vtv.id_conexion IS NOT NULL THEN 1 ELSE 0 END AS tiene_cuenta_gotv,
        ISNULL(vtv.usuario, '') AS usuario_gotv
      FROM bajas_tv b
      INNER JOIN conexiones con WITH (NOLOCK) ON con.id_conexion = b.id_conexion
      INNER JOIN abonados ab WITH (NOLOCK) ON ab.id_abonado = con.id_abonado
      LEFT JOIN view_tv_qvix vtv WITH (NOLOCK) ON vtv.id_conexion = b.id_conexion
      WHERE b.rn = 1
        AND con.cod_sucursal IN (${sucursalesBase.join(",")})
      ORDER BY b.fecha_carga DESC
    `);

    return NextResponse.json({ rows: result.recordset, generado: new Date().toISOString() });
  } catch (err: unknown) {
    console.error("[tv-bajas-qvix]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
