"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { X, Plus, Trash2, Pencil, Radio } from "lucide-react";
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

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

export default function AnalisisSenalesView({ onClose }: { onClose: () => void }) {
  const { chart } = useTheme();

  const [senales, setSenales] = useState<Senal[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);

  // Signal form state
  const [showSenalForm, setShowSenalForm] = useState(false);
  const [editingSenal, setEditingSenal] = useState<Senal | null>(null);
  const [fNombre, setFNombre] = useState("");
  const [fDesc, setFDesc] = useState("");

  // Entry form state
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entrada | null>(null);
  const [fSenalId, setFSenalId] = useState("");
  const [fFecha, setFFecha] = useState(new Date().toISOString().split("T")[0]);
  const [fCantidad, setFCantidad] = useState("");

  // Filter
  const [filterSenal, setFilterSenal] = useState<string>("all");

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

  useEffect(() => {
    loadSenales();
    loadEntradas();
  }, []);

  // Signal CRUD
  const openNewSenal = () => {
    setEditingSenal(null);
    setFNombre("");
    setFDesc("");
    setShowSenalForm(true);
  };

  const openEditSenal = (s: Senal) => {
    setEditingSenal(s);
    setFNombre(s.nombre);
    setFDesc(s.descripcion ?? "");
    setShowSenalForm(true);
  };

  const saveSenal = async () => {
    if (!fNombre.trim()) return;
    const body = { nombre: fNombre.trim(), descripcion: fDesc.trim() || null };
    if (editingSenal) {
      await fetch("/api/tv-senales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingSenal.id, ...body }),
      });
    } else {
      await fetch("/api/tv-senales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowSenalForm(false);
    loadSenales();
    loadEntradas();
  };

  const deleteSenal = async (id: string) => {
    if (!confirm("¿Eliminar esta señal y todos sus registros?")) return;
    await fetch("/api/tv-senales", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadSenales();
    loadEntradas();
  };

  // Entry CRUD
  const openNewEntry = () => {
    setEditingEntry(null);
    setFSenalId(senales[0]?.id ?? "");
    setFFecha(new Date().toISOString().split("T")[0]);
    setFCantidad("");
    setShowEntryForm(true);
  };

  const openEditEntry = (e: Entrada) => {
    setEditingEntry(e);
    setFSenalId(e.senal_id);
    setFFecha(e.fecha.split("T")[0]);
    setFCantidad(String(e.cantidad));
    setShowEntryForm(true);
  };

  const saveEntry = async () => {
    if (!fSenalId || !fFecha || !fCantidad) return;
    const body = { senal_id: fSenalId, fecha: fFecha, cantidad: parseInt(fCantidad, 10) };
    if (editingEntry) {
      await fetch("/api/analisis-senales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingEntry.id, ...body }),
      });
    } else {
      await fetch("/api/analisis-senales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowEntryForm(false);
    loadEntradas();
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("¿Eliminar este registro?")) return;
    await fetch("/api/analisis-senales", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadEntradas();
  };

  const filtered = useMemo(
    () => (filterSenal === "all" ? entradas : entradas.filter((e) => e.senal_id === filterSenal)),
    [entradas, filterSenal]
  );

  // Chart: per date, one bar per signal
  const chartData = useMemo(() => {
    const dates = [...new Set(filtered.map((e) => e.fecha.split("T")[0]))].sort();
    return dates.map((d) => {
      const row: Record<string, string | number> = { fecha: d };
      for (const s of senales) {
        if (filterSenal !== "all" && s.id !== filterSenal) continue;
        const entry = filtered.find((e) => e.senal_id === s.id && e.fecha.split("T")[0] === d);
        if (entry) row[s.nombre] = entry.cantidad;
      }
      return row;
    });
  }, [filtered, senales, filterSenal]);

  const visibleSenales = useMemo(
    () => (filterSenal === "all" ? senales : senales.filter((s) => s.id === filterSenal)),
    [senales, filterSenal]
  );

  const inputCls =
    "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-slate-500";

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-purple-400" />
            <h1 className="text-2xl font-bold text-white">Análisis de señales</h1>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <X className="w-4 h-4" /> Volver
          </button>
        </div>

        {/* Signals management */}
        <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-200">Señales</h2>
            <button
              onClick={openNewSenal}
              className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Nueva señal
            </button>
          </div>
          {senales.length === 0 ? (
            <p className="text-slate-500 text-sm">No hay señales. Creá una para empezar.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {senales.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 bg-slate-700/60 border border-slate-600/40 rounded-lg px-3 py-1.5"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-sm font-medium text-slate-200">{s.nombre}</span>
                  {s.descripcion && (
                    <span className="text-xs text-slate-500">{s.descripcion}</span>
                  )}
                  <button
                    onClick={() => openEditSenal(s)}
                    className="text-slate-400 hover:text-sky-400 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteSenal(s.id)}
                    className="text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold text-slate-200">Evolución de visualizaciones</h2>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setFilterSenal("all")}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${
                    filterSenal === "all"
                      ? "bg-purple-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  Todas
                </button>
                {senales.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setFilterSenal(s.id)}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      filterSenal === s.id
                        ? "bg-purple-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    {s.nombre}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="fecha" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: chart.axis, fontSize: 11 }} width={45} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={{ color: chart.tooltipLabel }}
                  itemStyle={{ color: chart.tooltipItem }}
                  formatter={(v) => typeof v === "number" ? v.toLocaleString("es-AR") : v}
                />
                {visibleSenales.length > 1 && (
                  <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />
                )}
                {visibleSenales.map((s, i) => (
                  <Bar
                    key={s.id}
                    dataKey={s.nombre}
                    fill={COLORS[(senales.indexOf(s)) % COLORS.length]}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily records */}
        <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-200">
              Registros diarios
              {filtered.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {filtered.length} registros
                </span>
              )}
            </h2>
            <button
              onClick={openNewEntry}
              disabled={senales.length === 0}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar registro
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="text-slate-500 text-sm">
              {senales.length === 0
                ? "Primero creá una señal."
                : "No hay registros. Agregá uno con el botón de arriba."}
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
                      <td className="py-2.5 pr-4 text-slate-300 tabular-nums">
                        {e.fecha.split("T")[0]}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-200 font-medium">{e.senal_nombre}</td>
                      <td className="py-2.5 pr-4 text-right text-white font-semibold tabular-nums">
                        {e.cantidad.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEditEntry(e)}
                            className="text-slate-400 hover:text-sky-400 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteEntry(e.id)}
                            className="text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Modal: nueva/editar señal */}
      {showSenalForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSenalForm(false)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">
              {editingSenal ? "Editar señal" : "Nueva señal"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input
                  value={fNombre}
                  onChange={(e) => setFNombre(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveSenal()}
                  className={inputCls}
                  placeholder="Ej: ESPN, Canal 13, Fox Sports..."
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripción</label>
                <input
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  className={inputCls}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSenalForm(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveSenal}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: nuevo/editar registro */}
      {showEntryForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowEntryForm(false)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">
              {editingEntry ? "Editar registro" : "Nuevo registro"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Señal *</label>
                <select
                  value={fSenalId}
                  onChange={(e) => setFSenalId(e.target.value)}
                  className={inputCls}
                >
                  {senales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fecha *</label>
                <input
                  type="date"
                  value={fFecha}
                  onChange={(e) => setFFecha(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Cantidad de visualizaciones *
                </label>
                <input
                  type="number"
                  min="0"
                  value={fCantidad}
                  onChange={(e) => setFCantidad(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEntry()}
                  className={inputCls}
                  placeholder="0"
                  autoFocus={!editingEntry}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEntryForm(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveEntry}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
