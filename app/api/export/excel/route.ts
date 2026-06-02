import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import * as XLSX from "xlsx";

function distancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sucursal = parseInt(req.nextUrl.searchParams.get("sucursal") ?? "4", 10);
  if (isNaN(sucursal)) return NextResponse.json({ error: "Sucursal inválida" }, { status: 400 });

  const { sucursales } = session.user;
  if (sucursales !== null && !sucursales.includes(sucursal))
    return NextResponse.json({ error: "Sin acceso a esa sucursal" }, { status: 403 });

  try {
    const pool = await getPool();

    const [napsRaw, cntRes, conexRes] = await Promise.all([
      pool.request().query(`
        SELECT nap, latitud, longitud, fibra
        FROM geo_naps
        WHERE cod_sucursal = ${sucursal}
      `),
      pool.request().query(`
        SELECT 'N' + cr.nap_primer_nivel + '.' + cr.nap_segundo_nivel AS NAP,
               COUNT(*) AS Cantidad
        FROM v_con_dom vcd
        JOIN Conexiones_referencia cr ON cr.id_conexion = vcd.id_conexion
        WHERE vcd.Estado_Servicio IN (3, 6, 61, 62)
          AND vcd.cod_sucursal = ${sucursal}
          AND cr.nap_primer_nivel IS NOT NULL
        GROUP BY cr.nap_primer_nivel, cr.nap_segundo_nivel
      `).catch(() => ({ recordset: [] as Record<string, unknown>[] })),
      pool.request().query(`
        SELECT
          c.id_conexion,
          ts.descripcion AS estado,
          TRY_CAST(i2.latitud  AS FLOAT) AS latitud,
          TRY_CAST(i2.longitud AS FLOAT) AS longitud,
          'N' + cr.nap_primer_nivel + '.' + cr.nap_segundo_nivel AS nap
        FROM Clientes c
        LEFT JOIN v_con_dom vcd            ON vcd.id_conexion = c.id_conexion
        LEFT JOIN Conexiones c2            ON c2.id_conexion = c.id_conexion
        LEFT JOIN inmuebles i2             ON i2.id_inmueble = c2.id_inmueble
        LEFT JOIN tipo_estado_servicio ts  ON ts.id_estado_servicio = vcd.Estado_Servicio
        LEFT JOIN Conexiones_referencia cr ON cr.id_conexion = c.id_conexion
        WHERE vcd.cod_sucursal = ${sucursal}
          AND vcd.Estado_Servicio IN (3, 6, 61, 62)
          AND TRY_CAST(i2.latitud  AS FLOAT) IS NOT NULL
          AND TRY_CAST(i2.longitud AS FLOAT) IS NOT NULL
          AND TRY_CAST(i2.latitud  AS FLOAT) <> 0
          AND TRY_CAST(i2.longitud AS FLOAT) <> 0
          AND cr.nap_primer_nivel IS NOT NULL
      `),
    ]);

    const countMap = new Map<string, number>();
    for (const row of cntRes.recordset as Record<string, unknown>[]) {
      countMap.set(String(row.NAP), Number(row.Cantidad));
    }

    interface NapRow { nap: string; latitud: number; longitud: number; fibra: string; cantidad: number; }
    const naps: NapRow[] = (napsRaw.recordset as Record<string, unknown>[])
      .map((r) => ({
        nap:      String(r.nap),
        fibra:    String(r.fibra ?? ""),
        cantidad: countMap.get(String(r.nap)) ?? 0,
        latitud:  parseFloat(String(r.latitud).replace(",", ".")),
        longitud: parseFloat(String(r.longitud).replace(",", ".")),
      }))
      .filter((r) => !isNaN(r.latitud) && !isNaN(r.longitud) && r.latitud !== 0);

    const napMap = new Map(naps.map((n) => [n.nap, n]));

    // ── Hoja 1: Drops (una fila por conexión) ────────────────────────────
    interface ConexRow { id_conexion: number; estado: string; latitud: number; longitud: number; nap: string; }
    const drops = (conexRes.recordset as ConexRow[])
      .filter((c) => c.nap != null)
      .map((c) => {
        const nap = napMap.get(c.nap);
        const metros = nap ? distancia(nap.latitud, nap.longitud, c.latitud, c.longitud) : null;
        return {
          NAP:             c.nap,
          Fibra:           nap?.fibra ?? "",
          ID_Conexion:     c.id_conexion,
          Estado:          c.estado,
          Lat_Conexion:    c.latitud,
          Lng_Conexion:    c.longitud,
          Lat_NAP:         nap?.latitud ?? "",
          Lng_NAP:         nap?.longitud ?? "",
          Distancia_m:     metros !== null ? Math.round(metros) : "",
        };
      })
      .sort((a, b) => (a.NAP ?? "").localeCompare(b.NAP ?? ""));

    // ── Hoja 2: Resumen por NAP ──────────────────────────────────────────
    const resumenMap = new Map<string, { fibra: string; cantidad: number; distancias: number[] }>();
    for (const d of drops) {
      if (!resumenMap.has(d.NAP)) {
        resumenMap.set(d.NAP, { fibra: d.Fibra, cantidad: 0, distancias: [] });
      }
      const entry = resumenMap.get(d.NAP)!;
      entry.cantidad++;
      if (typeof d.Distancia_m === "number") entry.distancias.push(d.Distancia_m);
    }

    const resumen = Array.from(resumenMap.entries()).map(([nap, v]) => ({
      NAP:           nap,
      Fibra:         v.fibra,
      Conexiones:    v.cantidad,
      Drop_min_m:    v.distancias.length ? Math.min(...v.distancias) : "",
      Drop_max_m:    v.distancias.length ? Math.max(...v.distancias) : "",
      Drop_prom_m:   v.distancias.length ? Math.round(v.distancias.reduce((a, b) => a + b, 0) / v.distancias.length) : "",
    })).sort((a, b) => {
      if (typeof b.Drop_max_m === "number" && typeof a.Drop_max_m === "number") return b.Drop_max_m - a.Drop_max_m;
      return 0;
    });

    // ── Armar workbook ───────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen por NAP");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drops), "Drops detalle");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="drops-sucursal-${sucursal}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export/excel]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
