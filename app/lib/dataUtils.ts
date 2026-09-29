import type { DataRow, OrgStats, Summary, Totales } from "./types";

export function buildOrgStats(rows: DataRow[]): OrgStats[] {
  const map = new Map<string, DataRow[]>();
  for (const r of rows) {
    if (!map.has(r.organizacion)) map.set(r.organizacion, []);
    map.get(r.organizacion)!.push(r);
  }

  return Array.from(map.entries()).map(([org, data]) => {
    const sorted = [...data].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );
    const datos = sorted.map((d, i) => {
      const prev = sorted[i - 1];
      return {
        fecha: d.fecha,
        stb: d.stb,
        movil: d.movil,
        stbDiff: prev && prev.stb !== 0
          ? parseFloat((((d.stb - prev.stb) / prev.stb) * 100).toFixed(2))
          : undefined,
        movilDiff: prev && prev.movil !== 0
          ? parseFloat((((d.movil - prev.movil) / prev.movil) * 100).toFixed(2))
          : undefined,
      };
    });
    return { organizacion: org, datos };
  });
}

export function buildSummaries(orgStats: OrgStats[]): Summary[] {
  return orgStats.map((o) => {
    const last = o.datos[o.datos.length - 1];
    const first = o.datos[0];
    const trend = (cur: number, prev: number): "sube" | "baja" | "estable" =>
      cur > prev ? "sube" : cur < prev ? "baja" : "estable";

    return {
      organizacion: o.organizacion,
      ultimaFecha: last.fecha,
      stbActual: last.stb,
      movilActual: last.movil,
      stbTotal: last.stb - first.stb,
      movilTotal: last.movil - first.movil,
      stbTendencia: o.datos.length > 1
        ? trend(last.stb, o.datos[o.datos.length - 2].stb)
        : "estable",
      movilTendencia: o.datos.length > 1
        ? trend(last.movil, o.datos[o.datos.length - 2].movil)
        : "estable",
      stbDiffUltimo: last.stbDiff,
      movilDiffUltimo: last.movilDiff,
    };
  });
}

export function buildTotales(rows: DataRow[]): Totales[] {
  const map = new Map<string, { stb: number; movil: number }>();
  for (const r of rows) {
    const prev = map.get(r.fecha) ?? { stb: 0, movil: 0 };
    map.set(r.fecha, { stb: prev.stb + r.stb, movil: prev.movil + r.movil });
  }
  return Array.from(map.entries())
    .map(([fecha, v]) => ({ fecha, ...v }))
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
}

// Para los gráficos: todos los orgs en el mismo array keyed por fecha
export function buildChartData(rows: DataRow[], tipo: "stb" | "movil") {
  const fechas = [...new Set(rows.map((r) => r.fecha))].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const orgs = [...new Set(rows.map((r) => r.organizacion))];

  return fechas.map((fecha) => {
    const entry: Record<string, string | number> = { fecha };
    for (const org of orgs) {
      const row = rows.find((r) => r.organizacion === org && r.fecha === fecha);
      entry[org] = row ? (tipo === "stb" ? row.stb : row.movil) : 0;
    }
    return entry;
  });
}

export const ORG_COLORS: Record<string, string> = {
  VV: "#6366f1",
  Chumbicha: "#22c55e",
  Tinogasta: "#f59e0b",
  Fiambalá: "#ef4444",
  "El Rodeo": "#14b8a6",
  "La Puerta": "#a855f7",
  "La Rioja": "#0ea5e9",
  Chamical: "#06b6d4",
};

// Regresión lineal simple → proyecta el siguiente valor
export function projectNext(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  const xs = values.map((_, i) => i);
  const ys = values;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return Math.max(0, Math.round(intercept + slope * n));
}

export function getColor(org: string, index: number): string {
  const palette = [
    "#6366f1","#22c55e","#f59e0b","#ef4444","#14b8a6","#a855f7",
    "#f97316","#0ea5e9","#84cc16","#ec4899",
  ];
  return ORG_COLORS[org] ?? palette[index % palette.length];
}
