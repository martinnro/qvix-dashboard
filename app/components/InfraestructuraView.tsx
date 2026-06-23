"use client";
import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, Cell, LabelList,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { X, Plus, Trash2, Activity, Pencil } from "lucide-react";
import { getColor } from "../lib/dataUtils";
import { useTheme } from "../lib/useTheme";

interface EventoRow {
  id: string;
  fecha: string;
  evento: string;
  sucursal: string;
  clientes_online: number;
  clientes_total: number;
  dispositivos_online: number;
  dispositivos_total: number;
}

interface DispositivoRow {
  id: string;
  fecha: string;
  evento: string;
  tipo: string;
  sucursal: string;
  cantidad: number;
}

interface SucursalForm {
  clientes_online: number;
  clientes_total: number;
  dispositivos_online: number;
  dispositivos_total: number;
}

const SUCURSALES = ["Valle Viejo", "Chumbicha", "Tinogasta", "El Rodeo", "La Puerta", "Fiambalá", "ViewTV"];
const SUCURSALES_DISP = SUCURSALES;
const TIPOS_DISPOSITIVO = ["App Android TV", "App Phone", "App Tablet"];
const DISP_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa", "#fb923c", "#34d399"];

const initSucForm = (): SucursalForm => ({
  clientes_online: 0, clientes_total: 0,
  dispositivos_online: 0, dispositivos_total: 0,
});

const initFormBase = () => ({ fecha: new Date().toISOString().slice(0, 10), evento: "" });
const initDispForm = () => ({ fecha: new Date().toISOString().slice(0, 16), evento: "", tipo: "" });
const initFormSucs = (): Record<string, SucursalForm | null> =>
  Object.fromEntries(SUCURSALES.map((s) => [s, null]));
const initDispFormSucs = (): Record<string, number | null> =>
  Object.fromEntries(SUCURSALES_DISP.map((s) => [s, null]));

function pct(online: number, total: number) {
  if (!total) return null;
  return Math.round((online / total) * 1000) / 10;
}

export default function InfraestructuraView({ onClose }: { onClose: () => void }) {
  const { chart } = useTheme();
  const [rows, setRows] = useState<EventoRow[]>([]);
  const [dispRows, setDispRows] = useState<DispositivoRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDispForm, setShowDispForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSucs, setSelectedSucs] = useState<string[]>([]);
  const [editingRow, setEditingRow] = useState<EventoRow | null>(null);
  const [editingDispRow, setEditingDispRow] = useState<DispositivoRow | null>(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  // Multi-sucursal event form
  const [formBase, setFormBase] = useState(initFormBase());
  const [formSucs, setFormSucs] = useState<Record<string, SucursalForm | null>>(initFormSucs());

  // Dispositivos form
  const [dispForm, setDispForm] = useState(initDispForm());
  const [dispFormSucs, setDispFormSucs] = useState<Record<string, number | null>>(initDispFormSucs());

  const load = () => {
    fetch("/api/infraestructura")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setRows(d); })
      .catch(() => {});
    fetch("/api/dispositivos-evento")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setDispRows(d); })
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const selected = SUCURSALES.filter((s) => formSucs[s] !== null);
    if (!formBase.evento.trim() || selected.length === 0) return;
    setSaving(true);
    await Promise.all(
      selected.map((suc) =>
        fetch("/api/infraestructura", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formBase, sucursal: suc, ...formSucs[suc] }),
        })
      )
    );
    setSaving(false);
    setShowForm(false);
    setFormBase(initFormBase());
    setFormSucs(initFormSucs());
    load();
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/infraestructura", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const handleUpdate = async () => {
    if (!editingRow) return;
    setSaving(true);
    await fetch("/api/infraestructura", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingRow),
    });
    setSaving(false);
    setEditingRow(null);
    load();
  };

  const handleSaveDisp = async () => {
    const selectedDisp = SUCURSALES_DISP.filter((s) => dispFormSucs[s] !== null);
    if (!dispForm.evento.trim() || !dispForm.tipo.trim() || selectedDisp.length === 0) return;
    setSaving(true);
    await Promise.all(
      selectedDisp.map((suc) =>
        fetch("/api/dispositivos-evento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...dispForm, sucursal: suc, cantidad: dispFormSucs[suc] }),
        })
      )
    );
    setSaving(false);
    setShowDispForm(false);
    setDispForm(initDispForm());
    setDispFormSucs(initDispFormSucs());
    load();
  };

  const handleDeleteDisp = async (id: string) => {
    await fetch("/api/dispositivos-evento", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const handleUpdateDisp = async () => {
    if (!editingDispRow) return;
    setSaving(true);
    await fetch("/api/dispositivos-evento", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingDispRow),
    });
    setSaving(false);
    setEditingDispRow(null);
    load();
  };

  const toggleSuc = (s: string) =>
    setSelectedSucs((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const filteredRows = selectedSucs.length > 0 ? rows.filter((r) => selectedSucs.includes(r.sucursal)) : rows;

  const eventos = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of filteredRows) {
      if (!map.has(r.evento) || r.fecha < map.get(r.evento)!) map.set(r.evento, r.fecha);
    }
    return [...map.entries()].sort(([, fa], [, fb]) => fa.localeCompare(fb)).map(([e]) => e);
  }, [filteredRows]);

  const sucursales = useMemo(() => [...new Set(rows.map((r) => r.sucursal))].sort(), [rows]);
  const visibleSucs = selectedSucs.length > 0 ? selectedSucs : sucursales;

  useEffect(() => {
    if (eventos.length >= 2) {
      setCompareA(eventos[eventos.length - 2]);
      setCompareB(eventos[eventos.length - 1]);
    } else if (eventos.length === 1) {
      setCompareA(eventos[0]);
      setCompareB("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos.join(",")]);

  const buildRanking = (
    field1: "clientes_online" | "dispositivos_online",
    field2: "clientes_total" | "dispositivos_total"
  ) =>
    visibleSucs
      .map((suc) => {
        const entry: Record<string, string | number> = { sucursal: suc };
        for (const ev of eventos) {
          const r = filteredRows.find((x) => x.evento === ev && x.sucursal === suc);
          const v = r ? pct(r[field1], r[field2]) : null;
          if (v !== null) entry[ev] = v;
        }
        return entry;
      })
      .filter((e) => Object.keys(e).length > 1)
      .sort((a, b) => {
        const latest = eventos.at(-1) ?? "";
        return ((b[latest] as number) ?? -1) - ((a[latest] as number) ?? -1);
      });

  const clientesRanking = useMemo(
    () => buildRanking("clientes_online", "clientes_total"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleSucs, filteredRows, eventos]
  );

  const dispositivosRanking = useMemo(
    () => buildRanking("dispositivos_online", "dispositivos_total"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleSucs, filteredRows, eventos]
  );

  // Dispositivos por tipo
  const filteredDispRows = selectedSucs.length > 0
    ? dispRows.filter((r) => selectedSucs.includes(r.sucursal))
    : dispRows;

  const tiposDisp = useMemo(() => [...new Set(filteredDispRows.map((r) => r.tipo))].sort(), [filteredDispRows]);

  const eventosDisp = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of filteredDispRows) {
      if (!map.has(r.evento) || r.fecha < map.get(r.evento)!) map.set(r.evento, r.fecha);
    }
    return [...map.entries()].sort(([, fa], [, fb]) => fa.localeCompare(fb)).map(([e]) => e);
  }, [filteredDispRows]);

  const dispChartData = useMemo(() =>
    eventosDisp.map((evento) => {
      const entry: Record<string, number | string> = { evento };
      for (const tipo of tiposDisp) {
        const total = filteredDispRows
          .filter((x) => x.evento === evento && x.tipo === tipo)
          .reduce((s, x) => s + x.cantidad, 0);
        if (total > 0) entry[tipo] = total;
      }
      return entry;
    }), [eventosDisp, filteredDispRows, tiposDisp]);

  const dispRanking = useMemo(() => {
    const sucs = [...new Set(filteredDispRows.map((r) => r.sucursal))].filter(Boolean);
    return sucs
      .map((suc) => {
        const entry: Record<string, string | number> = { sucursal: suc };
        for (const tipo of tiposDisp) {
          const total = filteredDispRows
            .filter((r) => r.sucursal === suc && r.tipo === tipo)
            .reduce((s, r) => s + r.cantidad, 0);
          if (total > 0) entry[tipo] = total;
        }
        return entry;
      })
      .sort((a, b) => {
        const ta = tiposDisp.reduce((s, t) => s + ((a[t] as number) ?? 0), 0);
        const tb = tiposDisp.reduce((s, t) => s + ((b[t] as number) ?? 0), 0);
        return tb - ta;
      });
  }, [filteredDispRows, tiposDisp]);

  const comparisonData = useMemo(() => {
    if (!compareA || !compareB || compareA === compareB) return [];
    return visibleSucs.map((suc) => {
      const rA = rows.find((r) => r.evento === compareA && r.sucursal === suc);
      const rB = rows.find((r) => r.evento === compareB && r.sucursal === suc);
      if (!rA && !rB) return null;
      const pctCliA = rA ? pct(rA.clientes_online, rA.clientes_total) : null;
      const pctCliB = rB ? pct(rB.clientes_online, rB.clientes_total) : null;
      const pctDispA = rA ? pct(rA.dispositivos_online, rA.dispositivos_total) : null;
      const pctDispB = rB ? pct(rB.dispositivos_online, rB.dispositivos_total) : null;
      return {
        sucursal: suc,
        pct_cli_a: pctCliA,
        pct_cli_b: pctCliB,
        delta_pct_cli: pctCliA !== null && pctCliB !== null ? Math.round((pctCliB - pctCliA) * 10) / 10 : null,
        cli_online_a: rA?.clientes_online ?? null,
        cli_online_b: rB?.clientes_online ?? null,
        delta_cli_online: rA && rB ? rB.clientes_online - rA.clientes_online : null,
        pct_disp_a: pctDispA,
        pct_disp_b: pctDispB,
        delta_pct_disp: pctDispA !== null && pctDispB !== null ? Math.round((pctDispB - pctDispA) * 10) / 10 : null,
        disp_online_a: rA?.dispositivos_online ?? null,
        disp_online_b: rB?.dispositivos_online ?? null,
        delta_disp_online: rA && rB ? rB.dispositivos_online - rA.dispositivos_online : null,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [compareA, compareB, visibleSucs, rows]);

  const comparisonSummary = useMemo(() => {
    if (!compareA || !compareB || compareA === compareB) return null;
    const rA = rows.filter((r) => r.evento === compareA);
    const rB = rows.filter((r) => r.evento === compareB);
    const cliOnlineA = rA.reduce((s, r) => s + r.clientes_online, 0);
    const cliOnlineB = rB.reduce((s, r) => s + r.clientes_online, 0);
    const dispOnlineA = rA.reduce((s, r) => s + r.dispositivos_online, 0);
    const dispOnlineB = rB.reduce((s, r) => s + r.dispositivos_online, 0);
    const withDelta = comparisonData.filter((d) => d.delta_pct_cli !== null);
    const best = withDelta.length ? withDelta.reduce((a, b) => (b.delta_pct_cli! > a.delta_pct_cli! ? b : a)) : null;
    const worst = withDelta.length ? withDelta.reduce((a, b) => (b.delta_pct_cli! < a.delta_pct_cli! ? b : a)) : null;
    return { cliOnlineA, cliOnlineB, deltaCliOnline: cliOnlineB - cliOnlineA, dispOnlineA, dispOnlineB, deltaDispOnline: dispOnlineB - dispOnlineA, best, worst };
  }, [compareA, compareB, rows, comparisonData]);

  const historicData = useMemo(() => {
    return eventos.map((ev) => {
      const entry: Record<string, string | number> = { evento: ev };
      for (const suc of visibleSucs) {
        const r = rows.find((x) => x.evento === ev && x.sucursal === suc);
        const v = r ? pct(r.clientes_online, r.clientes_total) : null;
        if (v !== null) entry[suc] = v;
      }
      return entry;
    });
  }, [eventos, visibleSucs, rows]);

  const ratioData = useMemo(() => {
    return visibleSucs.map((suc) => {
      const entry: Record<string, string | number> = { sucursal: suc };
      for (const ev of eventos) {
        const r = rows.find((x) => x.evento === ev && x.sucursal === suc);
        if (r && r.clientes_online > 0) {
          entry[ev] = Math.round((r.dispositivos_online / r.clientes_online) * 100) / 100;
        }
      }
      return entry;
    }).filter((e) => Object.keys(e).length > 1);
  }, [visibleSucs, eventos, rows]);

  const consistencyData = useMemo(() => {
    return visibleSucs.map((suc) => {
      const values = rows
        .filter((r) => r.sucursal === suc)
        .map((r) => pct(r.clientes_online, r.clientes_total))
        .filter((v): v is number => v !== null);
      if (values.length === 0) return null;
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
      const stddev = Math.sqrt(variance);
      return {
        sucursal: suc,
        avg: Math.round(avg * 10) / 10,
        stddev: Math.round(stddev * 10) / 10,
        count: values.length,
        min: Math.round(Math.min(...values) * 10) / 10,
        max: Math.round(Math.max(...values) * 10) / 10,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.avg - a.avg);
  }, [visibleSucs, rows]);

  const tooltipContentStyle = {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: 8,
  };

  const xAxisProps = {
    dataKey: "evento",
    tick: { fill: chart.axis, fontSize: 11 },
    angle: -40,
    textAnchor: "end" as const,
    interval: 0,
    height: 70,
    tickFormatter: (v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v,
  };

  const renderDelta = (val: number | null, suffix = "") => {
    if (val === null) return <span className="text-slate-600">—</span>;
    const sign = val > 0 ? "+" : "";
    const color = val > 0 ? "text-emerald-400" : val < 0 ? "text-red-400" : "text-slate-500";
    return <span className={`font-semibold ${color}`}>{sign}{val}{suffix}</span>;
  };

  const selectedSucsInForm = SUCURSALES.filter((s) => formSucs[s] !== null);
  const selectedDispSucsInForm = SUCURSALES_DISP.filter((s) => dispFormSucs[s] !== null);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Activity size={20} className="text-sky-400" /> Infraestructura
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Impacto de eventos en clientes y dispositivos online por sucursal
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowForm(true); setFormBase(initFormBase()); setFormSucs(initFormSucs()); }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={15} /> Cargar evento
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <X size={15} /> Volver
            </button>
          </div>
        </div>

        {/* Filtro sucursales */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider">Sucursal</h3>
            {selectedSucs.length > 0 && (
              <button onClick={() => setSelectedSucs([])} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Limpiar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {sucursales.map((s, i) => {
              const active = selectedSucs.includes(s);
              const color = getColor(s, i);
              return (
                <button key={s} onClick={() => toggleSuc(s)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                  style={active
                    ? { backgroundColor: color + "33", borderColor: color, color }
                    : { borderColor: "#334155", color: "#94a3b8" }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </section>

        {eventos.length === 0 && (
          <div className="text-center text-slate-500 py-16 text-sm">
            No hay eventos cargados. Usá "Cargar evento" para agregar datos.
          </div>
        )}

        {eventos.length > 0 && (
          <>
            {/* Gráfico % Clientes Online */}
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h3 className="text-slate-200 font-semibold mb-1">% Clientes Online</h3>
              <p className="text-xs text-slate-500 mb-4">Relación clientes online / total por evento y sucursal</p>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={clientesRanking} margin={{ top: 28, right: 24, left: 8, bottom: 8 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="sucursal" tick={{ fill: chart.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 105]} tickFormatter={(v) => `${v}%`} tick={{ fill: chart.axis, fontSize: 12 }} width={40} hide />
                  <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: chart.tooltipLabel }} itemStyle={{ color: chart.tooltipItem }} formatter={(v) => `${v}%`} />
                  {eventos.length > 1 && <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />}
                  <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "80%", fill: "#ef4444", fontSize: 11, position: "insideTopRight" }} />
                  {eventos.map((ev, ei) => (
                    <Bar key={ev} dataKey={ev} radius={[4, 4, 0, 0]} maxBarSize={64}
                      fill={DISP_COLORS[ei % DISP_COLORS.length]}>
                      {eventos.length === 1 && clientesRanking.map((_, si) => (
                        <Cell key={si} fill={getColor(clientesRanking[si].sucursal as string, si)} />
                      ))}
                      {ei === eventos.length - 1 && (
                        <LabelList dataKey={ev} position="top"
                          formatter={(v: unknown) => typeof v === "number" ? `${v}%` : ""}
                          style={{ fill: chart.axis, fontSize: 12, fontWeight: 700 }} />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* Gráfico % Dispositivos Online */}
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h3 className="text-slate-200 font-semibold mb-1">% Dispositivos Online</h3>
              <p className="text-xs text-slate-500 mb-4">Relación dispositivos online / total por evento y sucursal</p>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={dispositivosRanking} margin={{ top: 28, right: 24, left: 8, bottom: 8 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="sucursal" tick={{ fill: chart.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 105]} tickFormatter={(v) => `${v}%`} tick={{ fill: chart.axis, fontSize: 12 }} width={40} hide />
                  <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: chart.tooltipLabel }} itemStyle={{ color: chart.tooltipItem }} formatter={(v) => `${v}%`} />
                  {eventos.length > 1 && <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />}
                  <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "80%", fill: "#ef4444", fontSize: 11, position: "insideTopRight" }} />
                  {eventos.map((ev, ei) => (
                    <Bar key={ev} dataKey={ev} radius={[4, 4, 0, 0]} maxBarSize={64}
                      fill={DISP_COLORS[ei % DISP_COLORS.length]}>
                      {eventos.length === 1 && dispositivosRanking.map((_, si) => (
                        <Cell key={si} fill={getColor(dispositivosRanking[si].sucursal as string, si)} />
                      ))}
                      {ei === eventos.length - 1 && (
                        <LabelList dataKey={ev} position="top"
                          formatter={(v: unknown) => typeof v === "number" ? `${v}%` : ""}
                          style={{ fill: chart.axis, fontSize: 12, fontWeight: 700 }} />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* Tabla registros */}
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h3 className="text-slate-200 font-semibold mb-4">Registros cargados</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
                      {["Fecha", "Evento", "Sucursal", "Cli. Online", "Cli. Total", "% Cli.", "Disp. Online", "Disp. Total", "% Disp.", "", ""].map((h, i) => (
                        <th key={i} className="text-center py-2 px-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows
                      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.evento.localeCompare(b.evento))
                      .map((r) => (
                        <tr key={r.id} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap text-center">{new Date(r.fecha + "T00:00:00").toLocaleDateString("es-AR")}</td>
                          <td className="py-2 px-3 text-slate-200 font-medium text-center">{r.evento}</td>
                          <td className="py-2 px-3 text-slate-300 text-center">{r.sucursal}</td>
                          <td className="py-2 px-3 text-slate-300 text-center">{r.clientes_online.toLocaleString("es-AR")}</td>
                          <td className="py-2 px-3 text-slate-300 text-center">{r.clientes_total.toLocaleString("es-AR")}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`font-semibold ${(pct(r.clientes_online, r.clientes_total) ?? 0) >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                              {pct(r.clientes_online, r.clientes_total) ?? "—"}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-300 text-center">{r.dispositivos_online.toLocaleString("es-AR")}</td>
                          <td className="py-2 px-3 text-slate-300 text-center">{r.dispositivos_total.toLocaleString("es-AR")}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`font-semibold ${(pct(r.dispositivos_online, r.dispositivos_total) ?? 0) >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                              {pct(r.dispositivos_online, r.dispositivos_total) ?? "—"}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button onClick={() => setEditingRow({ ...r })} className="text-slate-600 hover:text-indigo-400 transition-colors">
                              <Pencil size={14} />
                            </button>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button onClick={() => handleDelete(r.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── COMPARATIVA ENTRE EVENTOS ── */}
            {eventos.length >= 2 && (
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-5">
                <div>
                  <h3 className="text-slate-200 font-semibold">Comparativa entre eventos</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Diferencias de métricas clave entre dos eventos seleccionados</p>
                </div>

                {/* Selectores */}
                <div className="flex items-center gap-3 flex-wrap">
                  <select value={compareA} onChange={(e) => setCompareA(e.target.value)}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 max-w-xs">
                    {eventos.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                  </select>
                  <span className="text-slate-500 text-sm font-medium">→</span>
                  <select value={compareB} onChange={(e) => setCompareB(e.target.value)}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 max-w-xs">
                    {eventos.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                  </select>
                </div>

                {compareA === compareB ? (
                  <p className="text-slate-500 text-sm">Seleccioná dos eventos distintos para comparar.</p>
                ) : (
                  <>
                    {/* Resumen global */}
                    {comparisonSummary && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          {
                            label: "Clientes online",
                            a: comparisonSummary.cliOnlineA,
                            b: comparisonSummary.cliOnlineB,
                            delta: comparisonSummary.deltaCliOnline,
                            suffix: "",
                          },
                          {
                            label: "Dispositivos online",
                            a: comparisonSummary.dispOnlineA,
                            b: comparisonSummary.dispOnlineB,
                            delta: comparisonSummary.deltaDispOnline,
                            suffix: "",
                          },
                        ].map(({ label, a, b, delta, suffix }) => (
                          <div key={label} className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
                            <p className="text-xs text-slate-500 mb-2">{label} (total)</p>
                            <div className="flex items-end gap-2">
                              <div>
                                <p className="text-slate-500 text-xs">{compareA.length > 14 ? compareA.slice(0,13)+"…" : compareA}</p>
                                <p className="text-slate-300 font-semibold text-sm">{a.toLocaleString("es-AR")}{suffix}</p>
                              </div>
                              <span className="text-slate-600 text-xs mb-0.5">→</span>
                              <div>
                                <p className="text-slate-500 text-xs">{compareB.length > 14 ? compareB.slice(0,13)+"…" : compareB}</p>
                                <p className="text-slate-300 font-semibold text-sm">{b.toLocaleString("es-AR")}{suffix}</p>
                              </div>
                            </div>
                            <div className="mt-1.5">{renderDelta(delta, suffix)}</div>
                          </div>
                        ))}
                        {comparisonSummary.best && (
                          <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-3">
                            <p className="text-xs text-slate-500 mb-1">Mejor % clientes</p>
                            <p className="text-emerald-400 font-semibold text-sm">{comparisonSummary.best.sucursal}</p>
                            <p className="text-xs text-emerald-500 mt-0.5">{renderDelta(comparisonSummary.best.delta_pct_cli, "%")}</p>
                          </div>
                        )}
                        {comparisonSummary.worst && comparisonSummary.worst.sucursal !== comparisonSummary.best?.sucursal && (
                          <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3">
                            <p className="text-xs text-slate-500 mb-1">Peor % clientes</p>
                            <p className="text-red-400 font-semibold text-sm">{comparisonSummary.worst.sucursal}</p>
                            <p className="text-xs text-red-500 mt-0.5">{renderDelta(comparisonSummary.worst.delta_pct_cli, "%")}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tabla por sucursal */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-700">
                            <th className="text-left py-2 px-3">Sucursal</th>
                            <th className="text-center py-2 px-2 text-indigo-400/70">% Cli A</th>
                            <th className="text-center py-2 px-2 text-indigo-400/70">% Cli B</th>
                            <th className="text-center py-2 px-2">Δ Cli %</th>
                            <th className="text-center py-2 px-2">Δ Online Cli</th>
                            <th className="text-center py-2 px-2 text-sky-400/70">% Disp A</th>
                            <th className="text-center py-2 px-2 text-sky-400/70">% Disp B</th>
                            <th className="text-center py-2 px-2">Δ Disp %</th>
                            <th className="text-center py-2 px-2">Δ Online Disp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonData
                            .sort((a, b) => (b.delta_pct_cli ?? -999) - (a.delta_pct_cli ?? -999))
                            .map((d) => (
                              <tr key={d.sucursal} className="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                                <td className="py-2 px-3 text-slate-200 font-medium">{d.sucursal}</td>
                                <td className="py-2 px-2 text-center text-slate-400">{d.pct_cli_a !== null ? `${d.pct_cli_a}%` : "—"}</td>
                                <td className="py-2 px-2 text-center text-slate-300">{d.pct_cli_b !== null ? `${d.pct_cli_b}%` : "—"}</td>
                                <td className="py-2 px-2 text-center">{renderDelta(d.delta_pct_cli, "%")}</td>
                                <td className="py-2 px-2 text-center">{renderDelta(d.delta_cli_online)}</td>
                                <td className="py-2 px-2 text-center text-slate-400">{d.pct_disp_a !== null ? `${d.pct_disp_a}%` : "—"}</td>
                                <td className="py-2 px-2 text-center text-slate-300">{d.pct_disp_b !== null ? `${d.pct_disp_b}%` : "—"}</td>
                                <td className="py-2 px-2 text-center">{renderDelta(d.delta_pct_disp, "%")}</td>
                                <td className="py-2 px-2 text-center">{renderDelta(d.delta_disp_online)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-600">
                      A = {compareA} &nbsp;|&nbsp; B = {compareB} &nbsp;·&nbsp; Positivo indica mejora en B respecto a A
                    </p>
                  </>
                )}
              </section>
            )}

            {/* ── EVOLUCIÓN HISTÓRICA ── */}
            {eventos.length >= 2 && (
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h3 className="text-slate-200 font-semibold mb-1">Evolución histórica — % Clientes Online</h3>
                <p className="text-xs text-slate-500 mb-4">Tendencia por sucursal a lo largo de todos los eventos registrados</p>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={historicData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis {...xAxisProps} />
                    <YAxis domain={[0, 105]} tickFormatter={(v) => `${v}%`} tick={{ fill: chart.axis, fontSize: 12 }} width={40} hide />
                    <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: chart.tooltipLabel }} itemStyle={{ color: chart.tooltipItem }} formatter={(v) => `${v}%`} />
                    <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />
                    <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "80%", fill: "#ef4444", fontSize: 11, position: "insideTopRight" }} />
                    {visibleSucs.map((suc, i) => (
                      <Line key={suc} type="monotone" dataKey={suc} stroke={getColor(suc, i)} strokeWidth={2} dot={{ r: 3 }} connectNulls activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </section>
            )}

            {/* ── RATIO DISPOSITIVOS / CLIENTES ── */}
            {ratioData.length > 0 && (
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h3 className="text-slate-200 font-semibold mb-1">Ratio dispositivos / clientes online</h3>
                <p className="text-xs text-slate-500 mb-4">Dispositivos conectados por cliente online en cada evento · Valores &gt; 1 indican clientes con múltiples pantallas</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ratioData} margin={{ top: 28, right: 24, left: 8, bottom: 8 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="sucursal" tick={{ fill: chart.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: chart.tooltipLabel }} itemStyle={{ color: chart.tooltipItem }} formatter={(v) => `${v}x`} />
                    {eventos.length > 1 && <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />}
                    <ReferenceLine y={1} stroke="#64748b" strokeDasharray="4 4" label={{ value: "1x", fill: "#64748b", fontSize: 11, position: "insideTopRight" }} />
                    {eventos.map((ev, ei) => (
                      <Bar key={ev} dataKey={ev} radius={[4, 4, 0, 0]} maxBarSize={64} fill={DISP_COLORS[ei % DISP_COLORS.length]}>
                        {eventos.length === 1 && ratioData.map((_, si) => (
                          <Cell key={si} fill={getColor(ratioData[si].sucursal as string, si)} />
                        ))}
                        {ei === eventos.length - 1 && (
                          <LabelList dataKey={ev} position="top"
                            formatter={(v: unknown) => typeof v === "number" ? `${v}x` : ""}
                            style={{ fill: chart.axis, fontSize: 12, fontWeight: 700 }} />
                        )}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </section>
            )}

            {/* ── RANKING CONSISTENCIA ── */}
            {consistencyData.length > 0 && (
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h3 className="text-slate-200 font-semibold mb-1">Ranking de consistencia</h3>
                <p className="text-xs text-slate-500 mb-4">Promedio y estabilidad del % clientes online a lo largo de todos los eventos · Menor desvío = más estable</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-700">
                        <th className="text-left py-2 px-3">Sucursal</th>
                        <th className="text-center py-2 px-3">Promedio</th>
                        <th className="text-center py-2 px-3">Desvío</th>
                        <th className="text-center py-2 px-3">Mín</th>
                        <th className="text-center py-2 px-3">Máx</th>
                        <th className="text-center py-2 px-3">Eventos</th>
                        <th className="text-center py-2 px-3">Estabilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consistencyData.map((d, i) => {
                        const stability = d.stddev < 3
                          ? { label: "Estable", cls: "text-emerald-400 bg-emerald-900/30 border-emerald-800/40" }
                          : d.stddev < 7
                          ? { label: "Moderada", cls: "text-amber-400 bg-amber-900/30 border-amber-800/40" }
                          : { label: "Inestable", cls: "text-red-400 bg-red-900/30 border-red-800/40" };
                        return (
                          <tr key={d.sucursal} className="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                            <td className="py-2 px-3 text-slate-200 font-medium">
                              <span className="inline-block w-5 text-xs text-slate-600">{i + 1}.</span>
                              {d.sucursal}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`font-semibold ${d.avg >= 80 ? "text-emerald-400" : d.avg >= 65 ? "text-amber-400" : "text-red-400"}`}>
                                {d.avg}%
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center text-slate-300">±{d.stddev}%</td>
                            <td className="py-2 px-3 text-center text-slate-400">{d.min}%</td>
                            <td className="py-2 px-3 text-center text-slate-400">{d.max}%</td>
                            <td className="py-2 px-3 text-center text-slate-500">{d.count}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${stability.cls}`}>
                                {stability.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-600 mt-3">Desvío &lt;3%: Estable · 3–7%: Moderada · &gt;7%: Inestable</p>
              </section>
            )}
          </>
        )}

        {/* ── SECCIÓN DISPOSITIVOS POR TIPO ── */}
        <div className="border-t border-slate-700 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Dispositivos conectados</h2>
              <p className="text-xs text-slate-400 mt-0.5">Cantidad de dispositivos por tipo y sucursal en cada evento</p>
            </div>
            <button
              onClick={() => { setShowDispForm(true); setDispForm(initDispForm()); setDispFormSucs(initDispFormSucs()); }}
              className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={15} /> Cargar dispositivos
            </button>
          </div>


          {dispRows.length === 0 ? (
            <div className="text-center text-slate-500 py-10 text-sm">
              No hay datos de dispositivos. Usá "Cargar dispositivos" para agregar.
            </div>
          ) : (
            <>
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
                <h3 className="text-slate-200 font-semibold mb-1">Dispositivos por sucursal</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Ranking de uso por tipo de dispositivo{selectedSucs.length > 0 ? ` — ${selectedSucs.join(", ")}` : ""}
                </p>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={dispRanking} margin={{ top: 28, right: 24, left: 8, bottom: 8 }} barCategoryGap="28%" barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="sucursal" tick={{ fill: chart.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={{ color: chart.tooltipLabel }}
                      itemStyle={{ color: chart.tooltipItem }}
                      formatter={(v: unknown, name) => [Number(v).toLocaleString("es-AR"), String(name ?? "")]}
                    />
                    <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />
                    {tiposDisp.map((tipo, i) => (
                      <Bar key={tipo} dataKey={tipo} fill={DISP_COLORS[i % DISP_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={56}>
                        <LabelList
                          dataKey={tipo}
                          position="top"
                          formatter={(v: unknown) => typeof v === "number" && v > 0 ? v.toLocaleString("es-AR") : ""}
                          style={{ fill: chart.axis, fontSize: 11, fontWeight: 600 }}
                        />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </section>

              <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h3 className="text-slate-200 font-semibold mb-4">Registros de dispositivos</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
                        {["Fecha", "Evento", "Sucursal", "Tipo", "Cantidad", "", ""].map((h, i) => (
                          <th key={i} className="text-left py-2 px-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDispRows
                        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.evento.localeCompare(b.evento) || (a.sucursal ?? "").localeCompare(b.sucursal ?? ""))
                        .map((r) => (
                          <tr key={r.id} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                            <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                              {r.fecha.length > 10
                                ? new Date(r.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                                : new Date(r.fecha + "T00:00:00").toLocaleDateString("es-AR")}
                            </td>
                            <td className="py-2 px-3 text-slate-200 font-medium">{r.evento}</td>
                            <td className="py-2 px-3 text-slate-300">{r.sucursal ?? "—"}</td>
                            <td className="py-2 px-3">
                              <span className="bg-sky-900/50 text-sky-300 border border-sky-700/50 text-xs font-medium px-2 py-0.5 rounded-full">
                                {r.tipo}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-200 font-semibold">{r.cantidad.toLocaleString("es-AR")}</td>
                            <td className="py-2 px-3">
                              <button onClick={() => setEditingDispRow({ ...r })} className="text-slate-600 hover:text-sky-400 transition-colors">
                                <Pencil size={14} />
                              </button>
                            </td>
                            <td className="py-2 px-3">
                              <button onClick={() => handleDeleteDisp(r.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* Modal: cargar evento (multi-sucursal) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-100 font-semibold">Cargar evento</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Fecha</label>
                  <input type="date" value={formBase.fecha}
                    onChange={(e) => setFormBase((f) => ({ ...f, fecha: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Evento</label>
                  <input type="text" value={formBase.evento} placeholder="ej: Argentina vs Brasil"
                    onChange={(e) => setFormBase((f) => ({ ...f, evento: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600" />
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-3">Seleccioná las sucursales y completá los datos para cada una</p>
                <div className="overflow-x-auto rounded-lg border border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 bg-slate-900/50 border-b border-slate-700">
                        <th className="py-2 px-3 w-8"></th>
                        <th className="text-left py-2 px-3">Sucursal</th>
                        <th className="text-center py-2 px-2">Cli. Online</th>
                        <th className="text-center py-2 px-2">Cli. Total</th>
                        <th className="text-center py-2 px-2">Disp. Online</th>
                        <th className="text-center py-2 px-2">Disp. Total</th>
                        <th className="text-center py-2 px-2">% Cli.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SUCURSALES.map((suc) => {
                        const data = formSucs[suc];
                        const enabled = data !== null;
                        return (
                          <tr key={suc} className={`border-b border-slate-700/50 transition-colors ${enabled ? "bg-indigo-900/10" : ""}`}>
                            <td className="py-2 px-3">
                              <input type="checkbox" checked={enabled}
                                onChange={(e) =>
                                  setFormSucs((f) => ({ ...f, [suc]: e.target.checked ? initSucForm() : null }))
                                }
                                className="w-4 h-4 rounded accent-indigo-500 cursor-pointer" />
                            </td>
                            <td className="py-2 px-3 text-slate-300 font-medium whitespace-nowrap">{suc}</td>
                            {enabled ? (
                              <>
                                {(["clientes_online", "clientes_total", "dispositivos_online", "dispositivos_total"] as const).map((key) => (
                                  <td key={key} className="py-1 px-1">
                                    <input type="number" min={0} value={data[key]}
                                      onChange={(e) =>
                                        setFormSucs((f) => ({ ...f, [suc]: { ...f[suc]!, [key]: Number(e.target.value) } }))
                                      }
                                      className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 text-center" />
                                  </td>
                                ))}
                                <td className="py-2 px-3 text-center">
                                  {data.clientes_total > 0 ? (
                                    <span className={`font-semibold text-xs ${(pct(data.clientes_online, data.clientes_total) ?? 0) >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                                      {pct(data.clientes_online, data.clientes_total)}%
                                    </span>
                                  ) : <span className="text-slate-600">—</span>}
                                </td>
                              </>
                            ) : (
                              <td colSpan={5} className="py-2 px-3 text-slate-700 text-center italic text-xs">no incluida</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {selectedSucsInForm.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    {selectedSucsInForm.length} sucursal{selectedSucsInForm.length !== 1 ? "es" : ""} seleccionada{selectedSucsInForm.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
              <button
                onClick={handleSave}
                disabled={saving || !formBase.evento.trim() || selectedSucsInForm.length === 0}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {saving ? "Guardando..." : `Guardar (${selectedSucsInForm.length} sucursal${selectedSucsInForm.length !== 1 ? "es" : ""})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar registro infraestructura */}
      {editingRow && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingRow(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-100 font-semibold">Editar registro</h3>
              <button onClick={() => setEditingRow(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Fecha</label>
                  <input type="date" value={editingRow.fecha}
                    onChange={(e) => setEditingRow((r) => r ? { ...r, fecha: e.target.value } : r)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Evento</label>
                  <input type="text" value={editingRow.evento}
                    onChange={(e) => setEditingRow((r) => r ? { ...r, evento: e.target.value } : r)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Sucursal</label>
                <input type="text" value={editingRow.sucursal} readOnly
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 cursor-not-allowed" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {([
                  ["clientes_online", "Cli. Online"],
                  ["clientes_total", "Cli. Total"],
                  ["dispositivos_online", "Disp. Online"],
                  ["dispositivos_total", "Disp. Total"],
                ] as [keyof EventoRow, string][]).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
                    <input type="number" min={0} value={editingRow[key] as number}
                      onChange={(e) => setEditingRow((r) => r ? { ...r, [key]: Number(e.target.value) } : r)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 text-center" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditingRow(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
              <button onClick={handleUpdate} disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors">
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar registro dispositivos */}
      {editingDispRow && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingDispRow(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-100 font-semibold">Editar dispositivo</h3>
              <button onClick={() => setEditingDispRow(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Fecha y hora</label>
                <input type="datetime-local" value={editingDispRow.fecha.length > 10 ? editingDispRow.fecha.slice(0, 16) : editingDispRow.fecha + "T00:00"}
                  onChange={(e) => setEditingDispRow((r) => r ? { ...r, fecha: e.target.value } : r)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Evento</label>
                <input type="text" value={editingDispRow.evento}
                  onChange={(e) => setEditingDispRow((r) => r ? { ...r, evento: e.target.value } : r)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Sucursal</label>
                <input type="text" value={editingDispRow.sucursal ?? ""} readOnly
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Tipo</label>
                <input type="text" value={editingDispRow.tipo} list="edit-tipos-disp-list"
                  onChange={(e) => setEditingDispRow((r) => r ? { ...r, tipo: e.target.value } : r)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500" />
                <datalist id="edit-tipos-disp-list">
                  {TIPOS_DISPOSITIVO.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Cantidad</label>
                <input type="number" min={0} value={editingDispRow.cantidad}
                  onChange={(e) => setEditingDispRow((r) => r ? { ...r, cantidad: Number(e.target.value) } : r)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500 text-center" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditingDispRow(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
              <button onClick={handleUpdateDisp} disabled={saving}
                className="px-4 py-2 text-sm bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cargar dispositivos */}
      {showDispForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowDispForm(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-100 font-semibold">Cargar dispositivos</h3>
              <button onClick={() => setShowDispForm(false)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Fecha y hora</label>
                  <input type="datetime-local" value={dispForm.fecha}
                    onChange={(e) => setDispForm((f) => ({ ...f, fecha: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Tipo</label>
                  <input type="text" value={dispForm.tipo} list="tipos-disp-list"
                    onChange={(e) => setDispForm((f) => ({ ...f, tipo: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500 placeholder:text-slate-600"
                    placeholder="Seleccioná o escribí un tipo" />
                  <datalist id="tipos-disp-list">
                    {TIPOS_DISPOSITIVO.map((t) => <option key={t} value={t} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Evento</label>
                <input type="text" value={dispForm.evento} placeholder="ej: Argentina vs Brasil"
                  onChange={(e) => setDispForm((f) => ({ ...f, evento: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500 placeholder:text-slate-600"
                  list="eventos-disp-list" />
                <datalist id="eventos-disp-list">
                  {[...new Set(rows.map((r) => r.evento))].map((e) => <option key={e} value={e} />)}
                </datalist>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-3">Seleccioná las sucursales e ingresá la cantidad por cada una</p>
                <div className="overflow-x-auto rounded-lg border border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 bg-slate-900/50 border-b border-slate-700">
                        <th className="py-2 px-3 w-8"></th>
                        <th className="text-left py-2 px-3">Sucursal</th>
                        <th className="text-center py-2 px-3">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SUCURSALES_DISP.map((suc) => {
                        const val = dispFormSucs[suc];
                        const enabled = val !== null;
                        return (
                          <tr key={suc} className={`border-b border-slate-700/50 transition-colors ${enabled ? "bg-sky-900/10" : ""}`}>
                            <td className="py-2 px-3">
                              <input type="checkbox" checked={enabled}
                                onChange={(e) =>
                                  setDispFormSucs((f) => ({ ...f, [suc]: e.target.checked ? 0 : null }))
                                }
                                className="w-4 h-4 rounded accent-sky-500 cursor-pointer" />
                            </td>
                            <td className="py-2 px-3 text-slate-300 font-medium">{suc}</td>
                            {enabled ? (
                              <td className="py-1 px-3">
                                <input type="number" min={0} value={val ?? 0}
                                  onChange={(e) =>
                                    setDispFormSucs((f) => ({ ...f, [suc]: Number(e.target.value) }))
                                  }
                                  className="w-28 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 text-center" />
                              </td>
                            ) : (
                              <td className="py-2 px-3 text-slate-700 text-center italic">no incluida</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {selectedDispSucsInForm.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    {selectedDispSucsInForm.length} sucursal{selectedDispSucsInForm.length !== 1 ? "es" : ""} seleccionada{selectedDispSucsInForm.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowDispForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
              <button
                onClick={handleSaveDisp}
                disabled={saving || !dispForm.evento.trim() || !dispForm.tipo.trim() || selectedDispSucsInForm.length === 0}
                className="px-4 py-2 text-sm bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {saving ? "Guardando..." : `Guardar (${selectedDispSucsInForm.length} sucursal${selectedDispSucsInForm.length !== 1 ? "es" : ""})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
