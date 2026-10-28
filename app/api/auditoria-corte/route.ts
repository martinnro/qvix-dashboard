import { NextRequest, NextResponse } from "next/server";
import { getPool, resetPool } from "@/app/lib/db";
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

const ESTADO_INCIDENCIA: Record<number, string> = { 1: "Pendiente", 2: "Asignada", 3: "Cerrada" };
const ESTADO_ODS: Record<number, string> = { 1: "Pendiente", 2: "Impresa", 4: "Cerrada" };

export interface AuditoriaCorteRow {
  id_conexion: number;
  cod_sucursal: number;
  estado_servicio: string;
  id_orden_servicio: number | null;
  estado_incidencia: number | null;
  estado_ods: number | null;
  fecha_reclamo: string | null;
  fecha_asignacion: string | null;
  fecha_solucion: string | null;
  motivo: string | null;
  nap_primer_nivel: string | null;
  nap_segundo_nivel: string | null;
  dias: number | null;
  dias_desde_vencimiento: number;
  ont: number;
  iptv: number;
  ott: number;
  antena: number;
  total_dispositivos: number;
}

// Auditoría de Gestión de Corte: de todos los suspendidos en Gestión de Corte (Estado_Servicio
// 61/62), cuáles tienen una ODS de Retiro de Equipo abierta/cerrada reciente y cuáles no —
// reemplaza el cruce manual de dos queries + Excel que se venía haciendo antes.
export function buildQuery(sucursalClause: string): string {
  return `
    WITH ods_retiro AS (
      SELECT id_conexion, MAX(id_Orden_Servicio) AS max_id_Orden_Servicio
      FROM v_ordenes_servicios
      WHERE subtipo_inicidencia = 5   -- Retiro de Equipo
        AND tipo_incidencia = 1
        AND estado_ods IN (4,1,2)     -- 4:Cerrada 1:Pendiente 2:Impresa
        AND estado_incidencia IN (3,2,1) -- 3:Cerrada 2:Asignada 1:Pendiente
      GROUP BY id_conexion
    ),
    dsp_conteo AS (
      -- Nombre distinto de "DISPOSITIVOS" a propósito: con collation case-insensitive, SQL
      -- Server confunde un CTE llamado igual (solo con minúsculas) con la tabla real y lo
      -- interpreta como una referencia recursiva.
      -- ONT = tipo 'B' (Cable Modems, el equipo de fibra del cliente). IPTV/OTT = deco TV
      -- (tipo 'T'/'M') segun la cuenta con la que esta dado de alta (CUBIWARE/QVIX). ANTENA =
      -- tipo 'W' (radios Ubiquiti airMAX — LiteBeam/NanoBeam —, usados sobre todo en Chumbicha).
      -- El total cuenta todo lo activo en la conexion, no solo estos cuatro tipos.
      SELECT
        cd.id_conexion,
        SUM(CASE WHEN d.tipo_dispositivo = 'B' THEN 1 ELSE 0 END) AS ont,
        SUM(CASE WHEN d.tipo_dispositivo IN ('T','M') AND d.tipo_cuenta_usuario = 'CUBIWARE' THEN 1 ELSE 0 END) AS iptv,
        SUM(CASE WHEN d.tipo_dispositivo IN ('T','M') AND d.tipo_cuenta_usuario = 'QVIX' THEN 1 ELSE 0 END) AS ott,
        SUM(CASE WHEN d.tipo_dispositivo = 'W' THEN 1 ELSE 0 END) AS antena,
        COUNT(*) AS total_dispositivos
      FROM conexion_dispostivos cd
      JOIN DISPOSITIVOS d ON d.id_dispositivo = cd.id_dispositivo
      WHERE cd.estado = 0
      GROUP BY cd.id_conexion
    ),
    ultima_factura_impaga AS (
      -- Para los "Sin ODS" no hay fecha_reclamo de dónde sacar los días: se usa el vencimiento
      -- de la última factura impaga como proxy de desde cuándo está en este estado, igual que
      -- se hacía a mano. Sin filtro de sucursal porque facturas no la tiene — igual solo se
      -- termina usando para las conexiones de ultima_factura_impaga que ya pasaron el WHERE de abajo.
      SELECT f.ID_CONEXION, MAX(f.FACTURA_NRO) AS factura_nro
      FROM facturas f
      WHERE f.FECHA_PAGO IS NULL
        AND f.FACTURA_ESTADO NOT IN ('FAC90','FAC40','FAC00')
      GROUP BY f.ID_CONEXION
    )
    SELECT
      vcd.id_conexion,
      vcd.cod_sucursal,
      tes.descripcion AS estado_servicio,
      vos.id_Orden_Servicio AS id_orden_servicio,
      vos.estado_incidencia,
      vos.estado_ods,
      vos.fecha_reclamo,
      vos.fecha_asignacion,
      vos.fecha_solucion,
      tme.descripcion AS motivo,
      cr.nap_primer_nivel,
      cr.nap_segundo_nivel,
      CASE
        WHEN vos.id_Orden_Servicio IS NOT NULL THEN DATEDIFF(DAY, vos.fecha_reclamo, GETDATE())
        ELSE DATEDIFF(DAY, fac.FECHA_VENCIMIENTO_1, GETDATE())
      END AS dias,
      CASE WHEN vos.id_Orden_Servicio IS NULL AND fac.FECHA_VENCIMIENTO_1 IS NOT NULL THEN 1 ELSE 0 END AS dias_desde_vencimiento,
      ISNULL(dsp.ont, 0)                AS ont,
      ISNULL(dsp.iptv, 0)               AS iptv,
      ISNULL(dsp.ott, 0)                AS ott,
      ISNULL(dsp.antena, 0)             AS antena,
      ISNULL(dsp.total_dispositivos, 0) AS total_dispositivos
    FROM v_con_dom vcd
    LEFT JOIN ods_retiro orr        ON orr.id_conexion = vcd.id_conexion
    LEFT JOIN v_ordenes_servicios vos ON vos.id_Orden_Servicio = orr.max_id_Orden_Servicio
    LEFT JOIN incidencias_header ih  ON ih.id_incidencia = vos.id_incidencia
    LEFT JOIN tipo_estado_servicio tes ON tes.id_estado_servicio = vcd.Estado_Servicio
    LEFT JOIN tipo_motivos_estado tme  ON tme.id_motivo = ih.id_motivo
    LEFT JOIN Conexiones_referencia cr ON cr.id_conexion = vcd.id_conexion
    LEFT JOIN dsp_conteo dsp           ON dsp.id_conexion = vcd.id_conexion
    LEFT JOIN ultima_factura_impaga ufi ON ufi.ID_CONEXION = vcd.id_conexion
    LEFT JOIN facturas fac              ON fac.ID_CONEXION = ufi.ID_CONEXION AND fac.FACTURA_NRO = ufi.factura_nro
    WHERE vcd.Estado_Servicio IN (61, 62)
      AND vcd.cod_sucursal ${sucursalClause}
    ORDER BY (CASE WHEN vos.id_Orden_Servicio IS NULL THEN 0 ELSE 1 END), vcd.id_conexion DESC
  `;
}

// Para el resumen "Distribución por Dispositivo": cuenta por modelo (nombre_dispositivo),
// no por conexión — misma clasificación ONT/IPTV/OTT que dsp_conteo pero sin agrupar por conexión.
// Incluye tiene_ods (misma lógica que ods_retiro en buildQuery) para que el panel pueda refiltrar
// este gráfico cuando el usuario elige "Con ODS" / "Sin ODS" sin pegarle de nuevo a la base.
function buildModeloQuery(sucursalClause: string): string {
  return `
    WITH ods_retiro AS (
      SELECT id_conexion
      FROM v_ordenes_servicios
      WHERE subtipo_inicidencia = 5
        AND tipo_incidencia = 1
        AND estado_ods IN (4,1,2)
        AND estado_incidencia IN (3,2,1)
      GROUP BY id_conexion
    )
    SELECT
      CASE
        WHEN d.tipo_dispositivo = 'B' THEN 'ONT'
        WHEN d.tipo_dispositivo IN ('T','M') AND d.tipo_cuenta_usuario = 'CUBIWARE' THEN 'IPTV'
        WHEN d.tipo_dispositivo IN ('T','M') AND d.tipo_cuenta_usuario = 'QVIX' THEN 'OTT'
        WHEN d.tipo_dispositivo = 'W' THEN 'ANTENA'
      END AS tipo,
      d.nombre_dispositivo,
      CASE WHEN orr.id_conexion IS NOT NULL THEN 1 ELSE 0 END AS tiene_ods,
      COUNT(*) AS cantidad
    FROM v_con_dom vcd
    LEFT JOIN ods_retiro orr      ON orr.id_conexion = vcd.id_conexion
    JOIN conexion_dispostivos cd ON cd.id_conexion = vcd.id_conexion AND cd.estado = 0
    JOIN DISPOSITIVOS d           ON d.id_dispositivo = cd.id_dispositivo
    WHERE vcd.Estado_Servicio IN (61, 62)
      AND vcd.cod_sucursal ${sucursalClause}
      AND (
        d.tipo_dispositivo IN ('B','W')
        OR (d.tipo_dispositivo IN ('T','M') AND d.tipo_cuenta_usuario IN ('CUBIWARE','QVIX'))
      )
    GROUP BY
      CASE
        WHEN d.tipo_dispositivo = 'B' THEN 'ONT'
        WHEN d.tipo_dispositivo IN ('T','M') AND d.tipo_cuenta_usuario = 'CUBIWARE' THEN 'IPTV'
        WHEN d.tipo_dispositivo IN ('T','M') AND d.tipo_cuenta_usuario = 'QVIX' THEN 'OTT'
        WHEN d.tipo_dispositivo = 'W' THEN 'ANTENA'
      END,
      d.nombre_dispositivo,
      CASE WHEN orr.id_conexion IS NOT NULL THEN 1 ELSE 0 END
  `;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursalParam = req.nextUrl.searchParams.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;
  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const sucursalesBase = sucursalesPermitidas ?? SUCURSALES_VALIDAS;
  const sucursalClause =
    sucursalN !== null && sucursalesBase.includes(sucursalN)
      ? `= ${sucursalN}`
      : `IN (${sucursalesBase.join(",") || "-1"})`;

  try {
    const pool = await getPool();
    const result = await pool.request().query(buildQuery(sucursalClause));
    const recordset = result.recordset as AuditoriaCorteRow[];

    const detalle = recordset.map((r) => ({
      id_conexion: r.id_conexion,
      cod_sucursal: r.cod_sucursal,
      sucursal: SUCURSALES[r.cod_sucursal] ?? `Suc. ${r.cod_sucursal}`,
      estado_servicio: r.estado_servicio,
      tiene_ods: r.id_orden_servicio !== null,
      id_orden_servicio: r.id_orden_servicio,
      estado_incidencia: r.estado_incidencia !== null ? (ESTADO_INCIDENCIA[r.estado_incidencia] ?? String(r.estado_incidencia)) : null,
      estado_ods: r.estado_ods !== null ? (ESTADO_ODS[r.estado_ods] ?? String(r.estado_ods)) : null,
      fecha_reclamo: r.fecha_reclamo,
      fecha_asignacion: r.fecha_asignacion,
      fecha_solucion: r.fecha_solucion,
      motivo: r.motivo,
      nap_primer_nivel: r.nap_primer_nivel,
      nap_segundo_nivel: r.nap_segundo_nivel,
      dias: r.dias,
      dias_desde_vencimiento: r.dias_desde_vencimiento === 1,
      ont: r.ont,
      iptv: r.iptv,
      ott: r.ott,
      antena: r.antena,
      total_dispositivos: r.total_dispositivos,
    }));

    const total = detalle.length;
    const conOds = detalle.filter((d) => d.tiene_ods).length;
    const sinOds = total - conOds;

    const porSucursalMap = new Map<number, { total: number; conOds: number; sinOds: number }>();
    for (const d of detalle) {
      const actual = porSucursalMap.get(d.cod_sucursal) ?? { total: 0, conOds: 0, sinOds: 0 };
      actual.total += 1;
      if (d.tiene_ods) actual.conOds += 1; else actual.sinOds += 1;
      porSucursalMap.set(d.cod_sucursal, actual);
    }
    const porSucursal = [...porSucursalMap.entries()]
      .map(([cod, v]) => ({ cod_sucursal: cod, nombre: SUCURSALES[cod] ?? `Suc. ${cod}`, ...v }))
      .sort((a, b) => b.total - a.total);

    // "Motivo de Cierre" y "Dispositivos por Tipo" se recalculan en el cliente a partir de
    // `detalle` para poder refiltrar junto con las tarjetas Con ODS / Sin ODS sin otro viaje
    // a la base. La distribución por modelo sí requiere esta query aparte (no por conexión);
    // viaja con tiene_ods para que el cliente pueda refiltrarla también.
    const modeloResult = await pool.request().query(buildModeloQuery(sucursalClause));
    const modeloRows = modeloResult.recordset as { tipo: "ONT" | "IPTV" | "OTT" | "ANTENA"; nombre_dispositivo: string; tiene_ods: number; cantidad: number }[];
    const mapModelo = (tipo: "ONT" | "IPTV" | "OTT" | "ANTENA") =>
      modeloRows
        .filter((r) => r.tipo === tipo)
        .map(({ nombre_dispositivo, tiene_ods, cantidad }) => ({ nombre_dispositivo, tiene_ods: tiene_ods === 1, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);
    const porModeloDispositivo = { ONT: mapModelo("ONT"), IPTV: mapModelo("IPTV"), OTT: mapModelo("OTT"), ANTENA: mapModelo("ANTENA") };

    return NextResponse.json({
      total, conOds, sinOds, porSucursal, detalle,
      resumen: { porModeloDispositivo },
    });
  } catch (err: unknown) {
    console.error("[auditoria-corte]", err);
    await resetPool();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
