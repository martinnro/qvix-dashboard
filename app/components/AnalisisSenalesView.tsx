"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { X, Plus, Trash2, Pencil, Radio, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTheme } from "../lib/useTheme";

interface Senal {
  id: string;
  nombre: string;
  descripcion: string | null;
}

interface Entrada {
  id: string;
  senal_id: string;
  senal_nombre: string;
  fecha: string;
  cantidad: number;
}

interface Periodo {
  id: string;
  desde: string;
  hasta: string;
}

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-slate-600">—</span>;
  if (delta > 0)
    return (
      <span className="flex items-center justify-end gap-1 text-emerald-400 font-semibold">
        <TrendingUp className="w-3.5 h-3.5" />+{delta}%
      </span>
    );
  if (delta < 0)
    return (
      <span className="flex items-center justify-end gap-1 text-red-400 font-semibold">
        <TrendingDown className="w-3.5 h-3.5" />{delta}%
      </span>
    );
  return (
    <span className="flex items-center justify-end gap-1 text-slate-500">
      <Minus className="w-3.5 h-3.5" />0%
    </span>
  );
}

export default function AnalisisSenalesView({ onClose }: { onClose: () => void }) {
  const { chart } = useTheme();

  const [senales, setSenales] = useState<Senal[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);

  // Signal form
  const [showSenalForm, setShowSenalForm] = useState(false);
  const [editingSenal, setEditingSenal] = useState<Senal | null>(null);
  const [fNombre, setFNombre] = useState("");
  const [fDesc, setFDesc] = useState("");

  // Entry form
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entrada | null>(null);
  const [fSenalId, setFSenalId] = useState("");
  const [fFecha, setFFecha] = useState(new Date().toISOString().split("T")[0]);
  const [fCantidad, setFCantidad] = useState("");

  // Independent filters: chart vs records table
  const [chartFilter, setChartFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");

  // Períodos
  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  const tooltipContentStyle = {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
  };

  const loadSenales = () =>
    fetch("/api/tv-senales")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setSenales(d); });

  const loadEntradas = () =>
    fetch("/api/analisis-senales")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setEntradas(d); });

  useEffect(() => { loadSenales(); loadEntradas(); }, []);

  // Signal CRUD
  const openNewSenal = () => { setEditingSenal(null); setFNombre(""); setFDesc(""); setShowSenalForm(true); };
  const openEditSenal = (s: Senal) => { setEditingSenal(s); setFNombre(s.nombre); setFDesc(s.descripcion ?? ""); setShowSenalForm(true); };

  const saveSenal = async () => {
    if (!fNombre.trim()) return;
    const body = { nombre: fNombre.trim(), descripcion: fDesc.trim() || null };
    await fetch("/api/tv-senales", {
      method: editingSenal ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingSenal ? { id: editingSenal.id, ...body } : body),
    });
    setShowSenalForm(false);
    loadSenales();
    loadEntradas();
  };

  const deleteSenal = async (id: string) => {
    if (!confirm("¿Eliminar esta señal y todos sus registros?")) return;
    await fetch("/api/tv-senales", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadSenales();
    loadEntradas();
  };

  // Entry CRUD
  const openNewEntry = () => { setEditingEntry(null); setFSenalId(senales[0]?.id ?? ""); setFFecha(new Date().toISOString().split("T")[0]); setFCantidad(""); setShowEntryForm(true); };
  const openEditEntry = (e: Entrada) => { setEditingEntry(e); setFSenalId(e.senal_id); setFFecha(e.fecha.split("T")[0]); setFCantidad(String(e.cantidad)); setShowEntryForm(true); };

  const saveEntry = async () => {
    if (!fSenalId || !fFecha || !fCantidad) return;
    const body = { senal_id: fSenalId, fecha: fFecha, cantidad: parseInt(fCantidad, 10) };
    await fetch("/api/analisis-senales", {
      method: editingEntry ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingEntry ? { id: editingEntry.id, ...body } : body),
    });
    setShowEntryForm(false);
    loadEntradas();
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("¿Eliminar este registro?")) return;
    await fetch("/api/analisis-senales", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadEntradas();
  };

  // Chart data — uses chartFilter independently (never depends on tableFilter)
  const chartData = useMemo(() => {
    const src = chartFilter === "all" ? entradas : entradas.filter((e) => e.senal_id === chartFilter);
    const dates = [...new Set(src.map((e) => e.fecha.split("T")[0]))].sort();
    return dates.map((d) => {
      const row: Record<string, string | number> = { fecha: d };
      for (const s of senales) {
        if (chartFilter !== "all" && s.id !== chartFilter) continue;
        const entry = src.find((e) => e.senal_id === s.id && e.fecha.split("T")[0] === d);
        if (entry) row[s.nombre] = entry.cantidad;
      }
      return row;
    });
  }, [entradas, senales, chartFilter]);

  const visibleSenales = useMemo(
    () => (chartFilter === "all" ? senales : senales.filter((s) => s.id === chartFilter)),
    [senales, chartFilter]
  );

  // Records table — uses tableFilter independently
  const filtered = useMemo(
    () => (tableFilter === "all" ? entradas : entradas.filter((e) => e.senal_id === tableFilter)),
    [entradas, tableFilter]
  );

  // Top 3 días por señal (always from all entradas)
  const topDias = useMemo(
    () =>
      senales.map((s) => ({
        senal: s,
        dias: entradas.filter((e) => e.senal_id === s.id).sort((a, b) => b.cantidad - a.cantidad).slice(0, 3),
      })),
    [senales, entradas]
  );

  // Comparativa
  const addPeriodo = () => {
    const today = new Date().toISOString().split("T")[0];
    setPeriodos((prev) => [...prev, { id: Date.now().toString(), desde: today.slice(0, 8) + "01", hasta: today }]);
  };
  const removePeriodo = (id: string) => setPeriodos((prev) => prev.filter((p) => p.id !== id));
  const updatePeriodo = (id: string, field: "desde" | "hasta", value: string) =>
    setPeriodos((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));

  const periodoData = useMemo(
    () =>
      periodos.map((p) => {
        const totals: Record<string, number> = {};
        for (const s of senales) {
          totals[s.id] = entradas
            .filter((e) => { const f = e.fecha.split("T")[0]; return e.senal_id === s.id && f >= p.desde && f <= p.hasta; })
            .reduce((sum, e) => sum + e.cantidad, 0);
        }
        return { ...p, totals };
      }),
    [periodos, entradas, senales]
  );

  const calcDelta = (curr: number, prev: number | null) =>
    prev !== null && prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;

  const inputCls =
    "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-slate-500";

  const filterBtnCls = (active: boolean) =>
    `text-xs px-3 py-1 rounded-full transition-colors ${active ? "bg-purple-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-purple-400" />
            <h1 className="text-2xl font-bold text-white">Análisis de señales</h1>
          </div>
          <button onClick={onClose} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors">
            <X className="w-4 h-4" /> Volver
          </button>
        </div>

        {/* Señales */}
        <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-200">Señales</h2>
            <button onClick={openNewSenal} className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Nueva señal
            </button>
          </div>
          {senales.length === 0 ? (
            <p className="text-slate-500 text-sm">No hay señales. Creá una para empezar.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {senales.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 bg-slate-700/60 border border-slate-600/40 rounded-lg px-3 py-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-sm font-medium text-slate-200">{s.nombre}</span>
                  {s.descripcion && <span className="text-xs text-slate-500">{s.descripcion}</span>}
                  <button onClick={() => openEditSenal(s)} className="text-slate-400 hover:text-sky-400 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteSenal(s.id)} className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 3 días */}
        {topDias.some((t) => t.dias.length > 0) && (
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
            <h2 className="text-base font-semibold text-slate-200">Top 3 días con más visualizaciones</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {topDias.map(({ senal, dias }, si) =>
                dias.length === 0 ? null : (
                  <div key={senal.id} className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[si % COLORS.length] }} />
                      <span className="text-sm font-semibold text-slate-200">{senal.nombre}</span>
                    </div>
                    {dias.map((d, rank) => (
                      <div key={d.id} className="flex items-center gap-3 bg-slate-700/40 rounded-lg px-3 py-2.5">
                        <span className={`text-xs font-bold w-5 text-center shrink-0 ${rank === 0 ? "text-amber-400" : rank === 1 ? "text-slate-300" : "text-orange-700"}`}>
                          #{rank + 1}
                        </span>
                        <span className="text-sm text-slate-300 flex-1 tabular-nums">{d.fecha.split("T")[0]}</span>
                        <span className="text-sm font-bold text-white tabular-nums">{d.cantidad.toLocaleString("es-AR")}</span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Chart — always visible if there are entries; filter is independent */}
        {entradas.length > 0 && (
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold text-slate-200">Evolución de visualizaciones</h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setChartFilter("all")} className={filterBtnCls(chartFilter === "all")}>Todas</button>
                {senales.map((s) => (
                  <button key={s.id} onClick={() => setChartFilter(s.id)} className={filterBtnCls(chartFilter === s.id)}>{s.nombre}</button>
                ))}
              </div>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="fecha" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: chart.axis, fontSize: 11 }} width={45} />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={{ color: chart.tooltipLabel }}
                    itemStyle={{ color: chart.tooltipItem }}
                    formatter={(v) => (typeof v === "number" ? v.toLocaleString("es-AR") : v)}
                  />
                  {visibleSenales.length > 1 && <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />}
                  {visibleSenales.map((s) => (
                    <Bar key={s.id} dataKey={s.nombre} fill={COLORS[senales.indexOf(s) % COLORS.length]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-sm">Sin datos para el filtro seleccionado.</p>
            )}
          </div>
        )}

        {/* Comparativa de períodos */}
        {entradas.length > 0 && senales.length > 0 && (
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-200">Comparativa de períodos</h2>
              <button onClick={addPeriodo} className="flex items-center gap-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> Agregar período
              </button>
            </div>

            {periodos.length === 0 ? (
              <p className="text-slate-500 text-sm">Agregá períodos para comparar visualizaciones entre rangos de fechas.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  {periodos.map((p, idx) => (
                    <div key={p.id} className="flex items-center gap-2 bg-slate-700/50 border border-slate-600/40 rounded-lg px-3 py-2">
                      <span className="text-xs font-semibold text-slate-400 w-16 shrink-0">Período {idx + 1}</span>
                      <input type="date" value={p.desde} onChange={(e) => updatePeriodo(p.id, "desde", e.target.value)} className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
                      <span className="text-slate-500 text-xs">→</span>
                      <input type="date" value={p.hasta} onChange={(e) => updatePeriodo(p.id, "hasta", e.target.value)} className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
                      <button onClick={() => removePeriodo(p.id)} className="text-slate-500 hover:text-red-400 transition-colors ml-1"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
                        <th className="text-left pb-2.5 pr-6 font-medium">Señal</th>
                        {periodoData.flatMap((p, idx) => {
                          const cells = [
                            <th key={`h-${p.id}`} className="text-right pb-2.5 pr-3 font-medium">P{idx + 1}</th>,
                          ];
                          if (idx < periodoData.length - 1)
                            cells.push(<th key={`d-${p.id}`} className="text-right pb-2.5 pr-6 font-medium text-slate-500">Δ%</th>);
                          return cells;
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {senales.map((s, si) => (
                        <tr key={s.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="py-2.5 pr-6">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[si % COLORS.length] }} />
                              <span className="text-slate-200 font-medium">{s.nombre}</span>
                            </div>
                          </td>
                          {periodoData.flatMap((p, idx) => {
                            const curr = p.totals[s.id] ?? 0;
                            const prev = idx > 0 ? (periodoData[idx - 1].totals[s.id] ?? 0) : null;
                            const cells = [
                              <td key={`v-${p.id}`} className="py-2.5 pr-3 text-right text-white font-semibold tabular-nums">{curr.toLocaleString("es-AR")}</td>,
                            ];
                            if (idx < periodoData.length - 1)
                              cells.push(<td key={`d-${p.id}`} className="py-2.5 pr-6 text-right tabular-nums"><DeltaCell delta={calcDelta(curr, prev)} /></td>);
                            return cells;
                          })}
                        </tr>
                      ))}
                      <tr className="border-t border-slate-600 font-semibold">
                        <td className="py-2.5 pr-6 text-slate-300">Total</td>
                        {periodoData.flatMap((p, idx) => {
                          const curr = senales.reduce((sum, s) => sum + (p.totals[s.id] ?? 0), 0);
                          const prevP = idx > 0 ? periodoData[idx - 1] : null;
                          const prev = prevP ? senales.reduce((sum, s) => sum + (prevP.totals[s.id] ?? 0), 0) : null;
                          const cells = [
                            <td key={`tv-${p.id}`} className="py-2.5 pr-3 text-right text-white tabular-nums">{curr.toLocaleString("es-AR")}</td>,
                          ];
                          if (idx < periodoData.length - 1)
                            cells.push(<td key={`td-${p.id}`} className="py-2.5 pr-6 text-right tabular-nums"><DeltaCell delta={calcDelta(curr, prev)} /></td>);
                          return cells;
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* Registros diarios */}
        <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold text-slate-200">
              Registros diarios
              {filtered.length > 0 && <span className="ml-2 text-xs font-normal text-slate-500">{filtered.length} registros</span>}
            </h2>
            <div className="flex items-center gap-2">
              {senales.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setTableFilter("all")} className={filterBtnCls(tableFilter === "all")}>Todas</button>
                  {senales.map((s) => (
                    <button key={s.id} onClick={() => setTableFilter(s.id)} className={filterBtnCls(tableFilter === s.id)}>{s.nombre}</button>
                  ))}
                </div>
              )}
              <button onClick={openNewEntry} disabled={senales.length === 0} className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-slate-500 text-sm">
              {senales.length === 0 ? "Primero creá una señal." : "No hay registros para el filtro seleccionado."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
                    <th className="text-left pb-2.5 pr-4 font-medium">Fecha</th>
                    <th className="text-left pb-2.5 pr-4 font-medium">Señal</th>
                    <th className="text-right pb-2.5 pr-4 font-medium">Visualizaciones</th>
                    <th className="text-right pb-2.5 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="py-2.5 pr-4 text-slate-300 tabular-nums">{e.fecha.split("T")[0]}</td>
                      <td className="py-2.5 pr-4 text-slate-200 font-medium">{e.senal_nombre}</td>
                      <td className="py-2.5 pr-4 text-right text-white font-semibold tabular-nums">{e.cantidad.toLocaleString("es-AR")}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEditEntry(e)} className="text-slate-400 hover:text-sky-400 transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteEntry(e.id)} className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal: señal */}
      {showSenalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSenalForm(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white">{editingSenal ? "Editar señal" : "Nueva señal"}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveSenal()} className={inputCls} placeholder="Ej: ESPN, Canal 13..." autoFocus />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripción</label>
                <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} className={inputCls} placeholder="Opcional" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowSenalForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={saveSenal} className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: registro */}
      {showEntryForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEntryForm(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white">{editingEntry ? "Editar registro" : "Nuevo registro"}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Señal *</label>
                <select value={fSenalId} onChange={(e) => setFSenalId(e.target.value)} className={inputCls}>
                  {senales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fecha *</label>
                <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cantidad de visualizaciones *</label>
                <input type="number" min="0" value={fCantidad} onChange={(e) => setFCantidad(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEntry()} className={inputCls} placeholder="0" autoFocus={!editingEntry} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowEntryForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={saveEntry} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
