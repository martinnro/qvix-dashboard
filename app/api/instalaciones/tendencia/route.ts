import { NextRequest, NextResponse } from "next/server";
import { getPool, resetPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const SUCURSALES: Record<number, string> = {
  0: "Central",
  1: "Chumbicha",
  3: "SonoVision",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};
const SUCURSALES_VALIDAS = Object.keys(SUCURSALES).map(Number);

const DIMENSIONES: Record<string, string> = {
  subtipo:   "tsi.descripcion",
  cuadrilla: "vods.cuadrilla",
  modelo:    "d.nombre_dispositivo",
  sucursal:  "v.cod_sucursal",
};

function validDate(s: string | null, fallback: string): string {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { sucursales: sucursalesPermitidas } = session.user;
  const sucursalParam = req.nextUrl.searchParams.get("sucursal");
  const sucursalN = sucursalParam ? parseInt(sucursalParam, 10) : null;

  if (sucursalN !== null && sucursalesPermitidas !== null && !sucursalesPermitidas.includes(sucursalN))
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const dimension = req.nextUrl.searchParams.get("dimension") ?? "";
  const columna = DIMENSIONES[dimension];
  if (!columna) return NextResponse.json({ error: "Dimensión inválida" }, { status: 400 });

  const sucursalesBase = sucursalesPermitidas ?? SUCURSALES_VALIDAS;
  const sucursalClause =
    sucursalN !== null && sucursalesBase.includes(sucursalN)
      ? `= ${sucursalN}`
      : `IN (${sucursalesBase.join(",")})`;

  const hoy = new Date().toISOString().slice(0, 10);
  const inicioAnio = `${new Date().getFullYear()}-01-01`;
  const desde = validDate(req.nextUrl.searchParams.get("desde"), inicioAnio);
  const hasta = validDate(req.nextUrl.searchParams.get("hasta"), hoy);

  const baseFrom = `
    FROM v_con_dom v
    INNER JOIN conexion_dispostivos cd ON cd.id_conexion = v.id_conexion
    INNER JOIN DISPOSITIVOS d ON d.id_dispositivo = cd.id_dispositivo AND d.tipo_dispositivo IN ('T','M','B')
    INNER JOIN tarifas t ON t.id_tarifa = v.tarifa
    INNER JOIN v_ordenes_servicios vods ON vods.id_Orden_Servicio = cd.id_orden_servicio
    INNER JOIN incidencias_header ih ON ih.id_incidencia = vods.id_incidencia
    INNER JOIN Tipo_incidencias ti ON ti.tipo_incidencia = ih.tipo_incidencia
    INNER JOIN tipo_subtipo_incidencias tsi ON tsi.subtipo_inicidencia = ih.subtipo_incidencia
      AND tsi.tipo_incidencia = ih.tipo_incidencia
    LEFT JOIN tipo_motivos_estado tme ON tme.id_motivo = ih.id_motivo
  `;
  // Otros filtros activos (de otras dimensiones) para que el desglose respete lo que ya está filtrado en el resto del dashboard.
  // Se excluye la propia dimensión: si no, la selección dentro de esa dimensión se auto-filtraría y no se podría ampliar.
  const FILTRABLES = ["subtipo", "cuadrilla", "modelo"] as const;
  const otrosFiltros = FILTRABLES
    .filter((f) => f !== dimension)
    .map((f) => ({
      columna: DIMENSIONES[f],
      vals: req.nextUrl.searchParams.getAll(`filtro_${f}`).filter((v) => v.trim() !== ""),
    }))
    .filter((f) => f.vals.length > 0);

  const filtroParams: { nombre: string; valor: string }[] = [];
  const filtroWhere = otrosFiltros
    .map((f, fi) => {
      const placeholders = f.vals.map((v, vi) => {
        const nombre = `f${fi}_${vi}`;
        filtroParams.push({ nombre, valor: v });
        return `@${nombre}`;
      });
      return `AND ${f.columna} IN (${placeholders.join(",")})`;
    })
    .join("\n      ");

  const baseWhere = `
    WHERE cd.estado = 0
      AND tme.id_motivo = 14
      AND CONVERT(date, vods.fecha_solucion) >= '${desde}'
      AND CONVERT(date, vods.fecha_solucion) <= '${hasta}'
      AND v.cod_sucursal ${sucursalClause}
      AND ${columna} IS NOT NULL
      ${filtroWhere}
  `;

  const incluyeTipo = dimension === "modelo";

  try {
    const pool = await getPool();
    const req_ = pool.request();
    filtroParams.forEach(({ nombre, valor }) => req_.input(nombre, valor));
    const res = await req_.query(`
      SET ARITHABORT ON;
      SELECT FORMAT(vods.fecha_solucion, 'yyyy-MM') AS mes, ${columna} AS categoria, COUNT(*) AS cantidad${incluyeTipo ? ", d.tipo_dispositivo AS tipo" : ""}
      ${baseFrom}
      ${baseWhere}
      GROUP BY FORMAT(vods.fecha_solucion, 'yyyy-MM'), ${columna}${incluyeTipo ? ", d.tipo_dispositivo" : ""}
      ORDER BY mes
    `);

    const rows = (res.recordset as Record<string, unknown>[]).map((r) => ({
      mes:       String(r.mes ?? ""),
      categoria: dimension === "sucursal" ? (SUCURSALES[Number(r.categoria)] ?? String(r.categoria)) : String(r.categoria ?? ""),
      cantidad:  Number(r.cantidad),
      ...(incluyeTipo ? { tipo: String(r.tipo ?? "") } : {}),
    }));

    return NextResponse.json({ rows });
  } catch (err: unknown) {
    console.error("[instalaciones/tendencia]", err);
    await resetPool();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}