"use client";
import { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { X, AlertTriangle, Loader2, Wrench, ChevronLeft } from "lucide-react";
import { getColor } from "../lib/dataUtils";
import { useTheme } from "../lib/useTheme";

interface ReclamoRow {
  id_incidencia: string;
  fecha_reclamo: string;
  problema_mini: string;
  fecha_solucion: string;
  ls_nombre_cuadrilla: string;
  nom_barrio: string;
  id_conexion: string;
  solucion: string;
  descripcion: string;
}

interface Conexion {
  id_conexion: string;
  cantidad: number;
  organizacion: string;
  barrio: string;
  reclamos: ReclamoRow[];
}

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmtMes(mes: string) {
  const [y, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
}

export default function ReclamosCambioDrop({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const { chart } = useTheme();
  const [rows, setRows] = useState<ReclamoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedConexion, setSelectedConexion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reclamos")
      .then((r) => r.text())
      .then((text) => {
        const result = Papa.parse<ReclamoRow>(text, { header: true, skipEmptyLines: true });
        setRows(result.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const orgs = useMemo(() => [...new Set(rows.map((r) => r.descripcion))].sort(), [rows]);

  const meses = useMemo(
    () => [...new Set(rows.map((r) => r.fecha_reclamo?.slice(0, 7)).filter(Boolean))].sort(),
    [rows]
  );

  const filteredRows = rows.filter(
    (r) =>
      (selectedOrgs.length === 0 || selectedOrgs.includes(r.descripcion)) &&
      (selectedMonths.length === 0 || selectedMonths.includes(r.fecha_reclamo?.slice(0, 7)))
  );

  const timelineData = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of filteredRows) {
      const mes = r.fecha_reclamo?.slice(0, 7);
      if (!mes) continue;
      if (!map.has(mes)) map.set(mes, {});
      const entry = map.get(mes)!;
      entry[r.descripcion] = (entry[r.descripcion] ?? 0) + 1;
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, counts]) => ({ mes: fmtMes(mes), ...counts }));
  }, [filteredRows]);

  const solucionStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      const sol = r.solucion?.trim() || "Sin especificar";
      map.set(sol, (map.get(sol) ?? 0) + 1);
    }
    const total = filteredRows.length;
    return [...map.entries()]
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredRows]);

  const conexiones = useMemo(() => {
    const map = new Map<string, ReclamoRow[]>();
    for (const r of filteredRows) {
      if (!r.id_conexion) continue;
      if (!map.has(r.id_conexion)) map.set(r.id_conexion, []);
      map.get(r.id_conexion)!.push(r);
    }
    const list: Conexion[] = [];
    for (const [id_conexion, reclamos] of map) {
      if (reclamos.length < 2) continue;
      const ordenados = [...reclamos].sort((a, b) => (a.fecha_reclamo < b.fecha_reclamo ? 1 : -1));
      list.push({
        id_conexion,
        cantidad: reclamos.length,
        organizacion: ordenados[0].descripcion,
        barrio: ordenados[0].nom_barrio,
        reclamos: ordenados,
      });
    }
    return list.sort((a, b) => b.cantidad - a.cantidad);
  }, [filteredRows]);

  const toggleOrg = (org: string) =>
    setSelectedOrgs((prev) => (prev.includes(org) ? prev.filter((o) => o !== org) : [...prev, org]));

  const toggleMonth = (mes: string) =>
    setSelectedMonths((prev) => (prev.includes(mes) ? prev.filter((m) => m !== mes) : [...prev, mes]));

  const selectedDetail = selectedConexion ? conexiones.find((c) => c.id_conexion === selectedConexion) : null;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-xs mb-2 transition-colors"
            >
              <ChevronLeft size={14} /> Reclamos
            </button>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <AlertTriangle size={20} className="text-rose-400" /> Cambio de Drop
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {rows.length.toLocaleString("es-AR")} reclamos registrados — {orgs.length} organizaciones
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <X size={15} /> Cerrar
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Cargando reclamos...
          </div>
        )}

        {!loading && (
          <>
            {/* Filtro de organizaciones */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider">Organización</h3>
                {selectedOrgs.length > 0 && (
                  <button onClick={() => setSelectedOrgs([])} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                    Limpiar selección
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {orgs.map((org, i) => {
                  const active = selectedOrgs.includes(org);
                  const color = getColor(org, i);
                  return (
                    <button
                      key={org}
                      onClick={() => toggleOrg(org)}
                      className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                      style={
                        active
                          ? { backgroundColor: color + "33", borderColor: color, color }
                          : { borderColor: "#334155", color: "#94a3b8" }
                      }
                    >
                      {org}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Filtro de mes */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider">Mes</h3>
                {selectedMonths.length > 0 && (
                  <button onClick={() => setSelectedMonths([])} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                    Limpiar selección
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {meses.map((mes) => {
                  const active = selectedMonths.includes(mes);
                  return (
                    <button
                      key={mes}
                      onClick={() => toggleMonth(mes)}
                      className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                      style={
                        active
                          ? { backgroundColor: "#6366f133", borderColor: "#6366f1", color: "#a5b4fc" }
                          : { borderColor: "#334155", color: "#94a3b8" }
                      }
                    >
                      {fmtMes(mes)}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Asistencia — dato principal */}
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h3 className="text-slate-200 font-semibold mb-1 flex items-center gap-2">
                <Wrench size={16} className="text-rose-400" /> Reclamos por asistencia
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Tipo de solución aplicada — {filteredRows.length.toLocaleString("es-AR")} reclamos
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={solucionStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ percent }) => `${(((percent as number) ?? 0) * 100).toFixed(1)}%`}
                      labelLine={false}
                    >
                      {solucionStats.map((entry, i) => (
                        <Cell key={entry.name} fill={getColor(entry.name, i)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8 }}
                      labelStyle={{ color: chart.tooltipLabel }}
                      itemStyle={{ color: chart.tooltipItem }}
                      formatter={(value, name) => [`${Number(value).toLocaleString("es-AR")} reclamos`, String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {solucionStats.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(s.name, i) }} />
                      <span className="text-sm text-slate-300 flex-1">{s.name}</span>
                      <span className="text-sm font-semibold text-slate-100">{s.value.toLocaleString("es-AR")}</span>
                      <span className="text-xs text-slate-500 w-14 text-right">{s.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Timeline mensual */}
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h3 className="text-slate-200 font-semibold mb-4">Reclamos por mes</h3>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={timelineData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis dataKey="mes" tick={{ fill: chart.axis, fontSize: 12 }} />
                  <YAxis tick={{ fill: chart.axis, fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8 }}
                    labelStyle={{ color: chart.tooltipLabel }}
                    itemStyle={{ color: chart.tooltipItem }}
                  />
                  <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />
                  {orgs.map((org, i) => (
                    <Line
                      key={org}
                      type="monotone"
                      dataKey={org}
                      stroke={getColor(org, i)}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </section>

            {/* Conexiones con reclamos repetidos */}
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h3 className="text-slate-200 font-semibold mb-1">Conexiones con más de un reclamo</h3>
              <p className="text-xs text-slate-500 mb-4">
                {conexiones.length} conexiones con reclamos repetidos — hacé click en una fila para ver el detalle
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
                      <th className="text-left py-2 px-3">ID Conexión</th>
                      <th className="text-left py-2 px-3">Organización</th>
                      <th className="text-left py-2 px-3">Barrio</th>
                      <th className="text-right py-2 px-3">Reclamos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conexiones.slice(0, 50).map((c) => (
                      <tr
                        key={c.id_conexion}
                        onClick={() => setSelectedConexion(c.id_conexion)}
                        className="border-b border-slate-800 hover:bg-slate-700/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-3 text-slate-200 font-medium">{c.id_conexion}</td>
                        <td className="py-2 px-3 text-slate-300">{c.organizacion}</td>
                        <td className="py-2 px-3 text-slate-400">{c.barrio}</td>
                        <td className="py-2 px-3 text-right">
                          <span className="inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-semibold text-xs">
                            {c.cantidad}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* Modal de detalle */}
        {selectedDetail && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedConexion(null)}
          >
            <div
              className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-100 font-semibold">
                  Conexión {selectedDetail.id_conexion} — {selectedDetail.cantidad} reclamos
                </h3>
                <button onClick={() => setSelectedConexion(null)} className="text-slate-400 hover:text-slate-200">
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                {selectedDetail.organizacion} · {selectedDetail.barrio}
              </p>
              <div className="space-y-3">
                {selectedDetail.reclamos.map((r) => (
                  <div key={r.id_incidencia} className="border border-slate-700 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-200 font-medium">{r.problema_mini}</span>
                      <span className="text-xs text-slate-500">#{r.id_incidencia}</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Reclamo: {r.fecha_reclamo} → Solución: {r.fecha_solucion || "—"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Cuadrilla: {r.ls_nombre_cuadrilla || "—"} · Solución aplicada: {r.solucion || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
