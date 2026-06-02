import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

// Haversine distance in meters
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

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
        vcd.Estado_Servicio,
        ts.descripcion AS estado_nombre,
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
    `),
  ]);

  interface NapRow { nap: string; latitud: number; longitud: number; fibra: string; cantidad: number; }
  interface ConexRow { id_conexion: number; Estado_Servicio: number; estado_nombre: string; latitud: number; longitud: number; nap: string | null; }

  const countMap = new Map<string, number>();
  for (const row of cntRes.recordset as Record<string, unknown>[]) {
    countMap.set(String(row.NAP), Number(row.Cantidad));
  }

  const naps: NapRow[] = (napsRaw.recordset as Record<string, unknown>[])
    .map((r) => ({
      nap:      String(r.nap),
      fibra:    String(r.fibra ?? ""),
      cantidad: countMap.get(String(r.nap)) ?? 0,
      latitud:  parseFloat(String(r.latitud).replace(",", ".")),
      longitud: parseFloat(String(r.longitud).replace(",", ".")),
    }))
    .filter((r) => !isNaN(r.latitud) && !isNaN(r.longitud) && r.latitud !== 0);

  const conexs: ConexRow[] = conexRes.recordset;
  const napMap = new Map(naps.map((n) => [n.nap, n]));

  const lines: string[] = [];

  // ── Estilos ──────────────────────────────────────────────────────────────
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>NAPs y Conexiones - Sucursal ${sucursal}</name>

  <Style id="nap"><IconStyle><color>ff00aaff</color><scale>1.1</scale>
    <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
  </IconStyle></Style>
  <Style id="conexion"><IconStyle><color>ff00ff55</color><scale>0.6</scale>
    <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
  </IconStyle></Style>
  <Style id="drop"><LineStyle><color>99ffffff</color><width>1.5</width></LineStyle></Style>`);

  // ── Carpeta NAPs ─────────────────────────────────────────────────────────
  lines.push(`  <Folder><name>NAPs</name>`);
  for (const n of naps) {
    lines.push(`    <Placemark>
      <name>${esc(n.nap)}</name>
      <description>Fibra: ${esc(n.fibra ?? "")} | Conexiones activas: ${n.cantidad}</description>
      <styleUrl>#nap</styleUrl>
      <Point><coordinates>${n.longitud},${n.latitud},0</coordinates></Point>
    </Placemark>`);
  }
  lines.push(`  </Folder>`);

  // ── Carpeta Conexiones ───────────────────────────────────────────────────
  lines.push(`  <Folder><name>Conexiones</name>`);
  for (const c of conexs) {
    lines.push(`    <Placemark>
      <name>CX ${c.id_conexion}</name>
      <description>Estado: ${esc(c.estado_nombre)} | NAP: ${esc(c.nap ?? "-")}</description>
      <styleUrl>#conexion</styleUrl>
      <Point><coordinates>${c.longitud},${c.latitud},0</coordinates></Point>
    </Placemark>`);
  }
  lines.push(`  </Folder>`);

  // ── Carpeta Drops (líneas NAP → conexión) ────────────────────────────────
  lines.push(`  <Folder><name>Drops</name>`);
  for (const c of conexs) {
    if (!c.nap) continue;
    const nap = napMap.get(c.nap);
    if (!nap) continue;
    const metros = distancia(nap.latitud, nap.longitud, c.latitud, c.longitud);
    lines.push(`    <Placemark>
      <name>${esc(c.nap)} → CX ${c.id_conexion}</name>
      <description>Distancia estimada: ${metros.toFixed(0)} m</description>
      <styleUrl>#drop</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${nap.longitud},${nap.latitud},0 ${c.longitud},${c.latitud},0</coordinates>
      </LineString>
    </Placemark>`);
  }
  lines.push(`  </Folder>`);

  lines.push(`</Document>\n</kml>`);

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml",
      "Content-Disposition": `attachment; filename="naps-sucursal-${sucursal}.kml"`,
    },
  });
  } catch (err: unknown) {
    console.error("[export/kml]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
