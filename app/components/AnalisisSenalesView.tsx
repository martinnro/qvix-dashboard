"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { X, Plus, Trash2, Pencil, Radio, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight, Calendar } from "lucide-react";
import { useTheme } from "../lib/useTheme";

interface Senal { id: string; nombre: string; descripcion: string | null; }
interface Entrada { id: string; senal_id: string; senal_nombre: string; fecha: string; cantidad: number; }
interface Periodo { id: string; desde: string; hasta: string; }

const COLORS = ["#f97316", "#10b981", "#6366f1", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6"];

const DAYS = [
  { label: "Lunes", dow: 1 },
  { label: "Martes", dow: 2 },
  { label: "Miércoles", dow: 3 },
  { label: "Jueves", dow: 4 },
  { label: "Viernes", dow: 5 },
  { label: "Sábado", dow: 6 },
  { label: "Domingo", dow: 0 },
];

function getDow(fechaStr: string) {
  const [y, m, d] = fechaStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DAY_NAMES_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function formatTopDate(fechaStr: string) {
  const [y, m, d] = fechaStr.split("T")[0].split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES_ES[date.getDay()]} ${String(d).padStart(2, "0")} - ${MONTH_NAMES[m - 1]}`;
}

function fmtDate(str: string) {
  const [, m, d] = str.split("-");
  return `${d}/${m}`;
}

function getWeekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  return dt.toISOString().split("T")[0];
}

function getWeekDays(weekStart: string): string[] {
  const [y, m, d] = weekStart.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return dt.toISOString().split("T")[0];
  });
}

function shiftWeek(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(y, m - 1, d + weeks * 7);
  return dt.toISOString().split("T")[0];
}

function getWeekPeriods(count: number, startOffset = 0): { id: string; desde: string; hasta: string; label: string }[] {
  const now = new Date();
  const dow = now.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const result = [];
  for (let i = count - 1; i >= 0; i--) {
    const weeksAgo = i + startOffset;
    const mon = new Date(now);
    mon.setDate(now.getDate() - daysToMon - weeksAgo * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const hasta = weeksAgo === 0 ? new Date(now) : sun;
    const label = weeksAgo === 0 ? "Esta semana" : weeksAgo === 1 ? "Sem. ant." : `Hace ${weeksAgo} sem.`;
    result.push({ id: `w${weeksAgo}`, desde: fmt(mon), hasta: fmt(hasta), label });
  }
  return result;
}

function calcDelta(curr: number, prev: number | null) {
  if (curr === 0) return null;
  return prev !== null && prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-slate-600">—</span>;
  if (delta > 0) return <span className="flex items-center justify-end gap-1 text-emerald-400 font-semibold"><TrendingUp className="w-3.5 h-3.5" />+{delta}%</span>;
  if (delta < 0) return <span className="flex items-center justify-end gap-1 text-red-400 font-semibold"><TrendingDown className="w-3.5 h-3.5" />{delta}%</span>;
  return <span className="flex items-center justify-end gap-1 text-slate-500"><Minus className="w-3.5 h-3.5" />0%</span>;
}

export default function AnalisisSenalesView({ onClose }: { onClose: () => void }) {
  const { chart } = useTheme();
  const [senales, setSenales] = useState<Senal[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);

  // Forms
  const [showSenalForm, setShowSenalForm] = useState(false);
  const [editingSenal, setEditingSenal] = useState<Senal | null>(null);
  const [fNombre, setFNombre] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entrada | null>(null);
  const [fSenalId, setFSenalId] = useState("");
  const [fFecha, setFFecha] = useState(new Date().toISOString().split("T")[0]);
  const [fCantidad, setFCantidad] = useState("");
  const [fWeekStart, setFWeekStart] = useState("");
  const [fSemana, setFSemana] = useState<Record<string, Record<string, string>>>({});

  // Filters (independent)
  const [chartFilter, setChartFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");

  // Comparativa modes
  const [comparativaMode, setComparativaMode] = useState<"semanas" | "rangos" | "dow">("semanas");
  const [semanasOffset, setSemanasOffset] = useState(0);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [selectedDow, setSelectedDow] = useState<number | null>(null);
  const [showDowButtons, setShowDowButtons] = useState(false);

  // Collapsed dates in records table
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [showRegistros, setShowRegistros] = useState(false);

  const tooltipContentStyle = { background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, fontSize: 12 };

  const loadSenales = () => fetch("/api/tv-senales").then(r => r.json()).then(d => { if (Array.isArray(d)) setSenales(d); });
  const loadEntradas = () => fetch("/api/analisis-senales").then(r => r.json()).then(d => { if (Array.isArray(d)) setEntradas(d); });
  useEffect(() => { loadSenales(); loadEntradas(); }, []);

  // Signal CRUD
  const openNewSenal = () => { setEditingSenal(null); setFNombre(""); setFDesc(""); setShowSenalForm(true); };
  const openEditSenal = (s: Senal) => { setEditingSenal(s); setFNombre(s.nombre); setFDesc(s.descripcion ?? ""); setShowSenalForm(true); };
  const saveSenal = async () => {
    if (!fNombre.trim()) return;
    const body = { nombre: fNombre.trim(), descripcion: fDesc.trim() || null };
    await fetch("/api/tv-senales", { method: editingSenal ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingSenal ? { id: editingSenal.id, ...body } : body) });
    setShowSenalForm(false); loadSenales(); loadEntradas();
  };
  const deleteSenal = async (id: string) => {
    if (!confirm("¿Eliminar esta señal y todos sus registros?")) return;
    await fetch("/api/tv-senales", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadSenales(); loadEntradas();
  };

  // Entry CRUD
  const prefillSemana = (ws: string) => {
    const days = getWeekDays(ws);
    const pre: Record<string, Record<string, string>> = {};
    for (const day of days) {
      pre[day] = {};
      for (const e of entradas) {
        if (e.fecha.split("T")[0] === day) pre[day][e.senal_id] = String(e.cantidad);
      }
    }
    return pre;
  };
  const openNewEntry = () => {
    setEditingEntry(null);
    const ws = getWeekStart(new Date().toISOString().split("T")[0]);
    setFWeekStart(ws);
    setFSemana(prefillSemana(ws));
    setShowEntryForm(true);
  };
  const changeWeek = (ws: string) => {
    setFWeekStart(ws);
    setFSemana(prefillSemana(ws));
  };
  const openEditEntry = (e: Entrada) => { setEditingEntry(e); setFSenalId(e.senal_id); setFFecha(e.fecha.split("T")[0]); setFCantidad(String(e.cantidad)); setShowEntryForm(true); };
  const saveEntry = async () => {
    if (!fSenalId || !fFecha || !fCantidad) return;
    const body = { senal_id: fSenalId, fecha: fFecha, cantidad: parseInt(fCantidad, 10) };
    await fetch("/api/analisis-senales", { method: editingEntry ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingEntry ? { id: editingEntry.id, ...body } : body) });
    setShowEntryForm(false); loadEntradas();
  };
  const saveMultiEntry = async () => {
    const ops: Promise<Response>[] = [];
    for (const [day, senalMap] of Object.entries(fSemana)) {
      for (const [senalId, val] of Object.entries(senalMap)) {
        const trimmed = val.trim();
        if (!trimmed) continue;
        const cantidad = parseInt(trimmed, 10);
        if (isNaN(cantidad) || cantidad < 0) continue;
        const existing = entradas.find(e => e.senal_id === senalId && e.fecha.split("T")[0] === day);
        const body = { senal_id: senalId, fecha: day, cantidad };
        ops.push(fetch("/api/analisis-senales", {
          method: existing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(existing ? { id: existing.id, ...body } : body),
        }));
      }
    }
    if (ops.length === 0) return;
    await Promise.all(ops);
    setShowEntryForm(false);
    loadEntradas();
  };
  const deleteEntry = async (id: string) => {
    if (!confirm("¿Eliminar este registro?")) return;
    await fetch("/api/analisis-senales", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadEntradas();
  };

  // Chart data (independent of table filter)
  const chartData = useMemo(() => {
    const src = chartFilter === "all" ? entradas : entradas.filter(e => e.senal_id === chartFilter);
    const dates = [...new Set(src.map(e => e.fecha.split("T")[0]))].sort();
    return dates.map(d => {
      const row: Record<string, string | number> = { fecha: d };
      for (const s of senales) {
        if (chartFilter !== "all" && s.id !== chartFilter) continue;
        const entry = src.find(e => e.senal_id === s.id && e.fecha.split("T")[0] === d);
        if (entry) row[s.nombre] = entry.cantidad;
      }
      return row;
    });
  }, [entradas, senales, chartFilter]);

  const visibleSenales = useMemo(
    () => (chartFilter === "all" ? senales : senales.filter(s => s.id === chartFilter)),
    [senales, chartFilter]
  );

  const saturdayTicks = useMemo(
    () => chartData.filter(row => getDow(String(row.fecha)) === 6).map(row => String(row.fecha)),
    [chartData]
  );

  // Records table filter (independent)
  const filtered = useMemo(
    () => (tableFilter === "all" ? entradas : entradas.filter(e => e.senal_id === tableFilter)),
    [entradas, tableFilter]
  );

  // Group records by date (for collapsed table)
  const groupedByDate = useMemo(() => {
    const groups: Record<string, Entrada[]> = {};
    for (const e of filtered) {
      const d = e.fecha.split("T")[0];
      if (!groups[d]) groups[d] = [];
      groups[d].push(e);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const toggleDate = (d: string) => setExpandedDates(prev => {
    const next = new Set(prev);
    next.has(d) ? next.delete(d) : next.add(d);
    return next;
  });

  // Top 3
  const topDias = useMemo(() =>
    senales.map(s => ({
      senal: s,
      dias: entradas.filter(e => e.senal_id === s.id).sort((a, b) => b.cantidad - a.cantidad).slice(0, 3),
    })),
    [senales, entradas]
  );

  // Comparativa - rangos
  const addPeriodo = () => {
    const today = new Date().toISOString().split("T")[0];
    setPeriodos(prev => [...prev, { id: Date.now().toString(), desde: today.slice(0, 8) + "01", hasta: today }]);
  };
  const removePeriodo = (id: string) => setPeriodos(prev => prev.filter(p => p.id !== id));
  const updatePeriodo = (id: string, field: "desde" | "hasta", value: string) =>
    setPeriodos(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));

  const periodoData = useMemo(() =>
    periodos.map(p => {
      const totals: Record<string, number> = {};
      for (const s of senales) {
        totals[s.id] = entradas
          .filter(e => { const f = e.fecha.split("T")[0]; return e.senal_id === s.id && f >= p.desde && f <= p.hasta; })
          .reduce((sum, e) => sum + e.cantidad, 0);
      }
      return { ...p, totals };
    }),
    [periodos, entradas, senales]
  );

  // Comparativa - semanas automáticas
  const semanaPeriodsData = useMemo(() =>
    getWeekPeriods(4, semanasOffset).map(w => {
      const totals: Record<string, number> = {};
      for (const s of senales) {
        totals[s.id] = entradas
          .filter(e => { const f = e.fecha.split("T")[0]; return e.senal_id === s.id && f >= w.desde && f <= w.hasta; })
          .reduce((sum, e) => sum + e.cantidad, 0);
      }
      return { ...w, totals };
    }),
  [entradas, senales, semanasOffset]);

  // Comparativa - día de semana
  const dowData = useMemo(() => {
    if (selectedDow === null) return [];
    const dates = [...new Set(
      entradas.filter(e => getDow(e.fecha) === selectedDow).map(e => e.fecha.split("T")[0])
    )].sort();
    return dates.map(d => {
      const totals: Record<string, number> = {};
      for (const s of senales) {
        totals[s.id] = entradas
          .filter(e => e.senal_id === s.id && e.fecha.split("T")[0] === d)
          .reduce((sum, e) => sum + e.cantidad, 0);
      }
      return { fecha: d, totals };
    });
  }, [selectedDow, entradas, senales]);

  // Resumen estadístico por señal (para tarjetas de resumen)
  const resumen = useMemo(() =>
    senales.flatMap((s, si) => {
      const vals = entradas.filter(e => e.senal_id === s.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (vals.length === 0) return [];
      const mean = Math.round(vals.reduce((a, e) => a + e.cantidad, 0) / vals.length);
      const best = vals.reduce((a, b) => b.cantidad > a.cantidad ? b : a);
      const worst = vals.reduce((a, b) => b.cantidad < a.cantidad ? b : a);
      const recent7 = vals.slice(-7);
      const prev7 = vals.slice(-14, -7);
      let tendencia: { pct: number; dir: "up" | "down" | "stable" } | null = null;
      if (recent7.length >= 5 && prev7.length >= 5) {
        const recentTotal = recent7.reduce((a, e) => a + e.cantidad, 0);
        const prevTotal = prev7.reduce((a, e) => a + e.cantidad, 0);
        const pct = Math.round(((recentTotal - prevTotal) / prevTotal) * 100);
        tendencia = { pct, dir: pct > 5 ? "up" : pct < -5 ? "down" : "stable" };
      }
      return [{ s, si, mean, best, worst, tendencia }];
    }),
    [senales, entradas]
  );

  // Puntos destacados — análisis concreto en lenguaje simple
  const insights = useMemo(() => {
    if (entradas.length === 0 || senales.length === 0) return [];
    type Item = { text: string; type: "good" | "bad" | "neutral" };
    const items: Item[] = [];

    const dateMap: Record<string, number> = {};
    for (const e of entradas) {
      const d = e.fecha.split("T")[0];
      dateMap[d] = (dateMap[d] ?? 0) + e.cantidad;
    }
    const sortedDates = Object.keys(dateMap).sort();

    // 1. Tendencia por señal — regresión lineal (vistas ganadas/perdidas por semana)
    for (const s of senales) {
      const vals = entradas
        .filter(e => e.senal_id === s.id)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map(e => e.cantidad);
      if (vals.length < 7) continue;
      const n = vals.length;
      const meanX = (n - 1) / 2;
      const meanY = vals.reduce((a, b) => a + b, 0) / n;
      const num = vals.reduce((acc, y, i) => acc + (i - meanX) * (y - meanY), 0);
      const den = vals.reduce((acc, _, i) => acc + Math.pow(i - meanX, 2), 0);
      const slope = num / den;
      const slopePerWeek = Math.round(Math.abs(slope) * 7 * 10) / 10;
      if (slopePerWeek >= 2) {
        if (slope > 0) items.push({ text: `${s.nombre} está en alza: sumó unas ${slopePerWeek} vistas más por semana a lo largo del período`, type: "good" });
        else items.push({ text: `${s.nombre} está a la baja: perdió unas ${slopePerWeek} vistas por semana a lo largo del período`, type: "bad" });
      } else {
        items.push({ text: `${s.nombre} se mantuvo estable durante el período — sin cambios importantes de semana en semana`, type: "neutral" });
      }
    }

    // 2. Semana reciente vs la anterior
    if (sortedDates.length >= 10) {
      const recent = sortedDates.slice(-7);
      const prev = sortedDates.slice(-14, -7);
      if (prev.length >= 5) {
        const recentTotal = recent.reduce((s, d) => s + dateMap[d], 0);
        const prevTotal = prev.reduce((s, d) => s + dateMap[d], 0);
        const pct = Math.round(((recentTotal - prevTotal) / prevTotal) * 100);
        if (pct > 5) items.push({ text: `Buena semana reciente: ${recentTotal.toLocaleString("es-AR")} vistas en los últimos 7 días, un ${pct}% más que los 7 anteriores (${prevTotal.toLocaleString("es-AR")})`, type: "good" });
        else if (pct < -5) items.push({ text: `Semana reciente floja: ${recentTotal.toLocaleString("es-AR")} vistas en los últimos 7 días, un ${Math.abs(pct)}% menos que los 7 anteriores (${prevTotal.toLocaleString("es-AR")})`, type: "bad" });
        else items.push({ text: `La semana reciente es similar a la anterior: ${recentTotal.toLocaleString("es-AR")} vs ${prevTotal.toLocaleString("es-AR")} vistas (${pct >= 0 ? "+" : ""}${pct}%)`, type: "neutral" });
      }
    }

    // 3. Mejor día de semana (con al menos 2 muestras por día para que sea real)
    const dowBuckets: Record<number, number[]> = {};
    for (let i = 0; i < 7; i++) dowBuckets[i] = [];
    for (const [d, total] of Object.entries(dateMap)) dowBuckets[getDow(d)].push(total);
    const dowAvg = Object.entries(dowBuckets)
      .filter(([, vals]) => vals.length >= 2)
      .map(([dow, vals]) => ({ dow: parseInt(dow), avg: vals.reduce((a, b) => a + b, 0) / vals.length }));
    if (dowAvg.length > 1) {
      const best = dowAvg.reduce((a, b) => b.avg > a.avg ? b : a);
      const worst = dowAvg.reduce((a, b) => b.avg < a.avg ? b : a);
      const diffPct = Math.round(((best.avg - worst.avg) / worst.avg) * 100);
      items.push({ text: `Los ${DAY_NAMES_ES[best.dow]}s son el mejor día de la semana: promedian ${Math.round(best.avg).toLocaleString("es-AR")} vistas — ${diffPct}% más que los ${DAY_NAMES_ES[worst.dow]}s (${Math.round(worst.avg).toLocaleString("es-AR")})`, type: "good" });
    }

    // 4. Fin de semana vs días de semana
    const weekdayDates = sortedDates.filter(d => { const dow = getDow(d); return dow >= 1 && dow <= 5; });
    const weekendDates = sortedDates.filter(d => { const dow = getDow(d); return dow === 0 || dow === 6; });
    if (weekdayDates.length > 0 && weekendDates.length > 0) {
      const wdAvg = weekdayDates.reduce((s, d) => s + dateMap[d], 0) / weekdayDates.length;
      const weAvg = weekendDates.reduce((s, d) => s + dateMap[d], 0) / weekendDates.length;
      const diffPct = Math.round((Math.abs(weAvg - wdAvg) / Math.min(wdAvg, weAvg)) * 100);
      if (weAvg > wdAvg) items.push({ text: `El fin de semana tiene más audiencia que los días de semana: ${Math.round(weAvg).toLocaleString("es-AR")} vs ${Math.round(wdAvg).toLocaleString("es-AR")} vistas promedio (+${diffPct}%)`, type: "neutral" });
      else items.push({ text: `Los días de semana tienen más audiencia que el fin de semana: ${Math.round(wdAvg).toLocaleString("es-AR")} vs ${Math.round(weAvg).toLocaleString("es-AR")} vistas promedio (+${diffPct}%)`, type: "neutral" });
    }

    // 5. Días inusuales por señal — picos que se salen de lo normal
    for (const s of senales) {
      const vals = entradas.filter(e => e.senal_id === s.id);
      if (vals.length < 5) continue;
      const quantities = vals.map(e => e.cantidad);
      const mean = quantities.reduce((a, b) => a + b, 0) / quantities.length;
      const stddev = Math.sqrt(quantities.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / quantities.length);
      if (stddev < 10) continue;
      const maxEntry = vals.reduce((a, b) => b.cantidad > a.cantidad ? b : a);
      const zMax = (maxEntry.cantidad - mean) / stddev;
      if (zMax > 1.8) {
        const ratio = Math.round((maxEntry.cantidad / mean) * 10) / 10;
        items.push({ text: `Pico inusual de ${s.nombre}: el ${formatTopDate(maxEntry.fecha)} tuvo ${maxEntry.cantidad.toLocaleString("es-AR")} vistas — ${ratio}x su promedio habitual (${Math.round(mean).toLocaleString("es-AR")}/día)`, type: "good" });
      }
    }

    // 6. Distribución del total entre señales
    if (senales.length > 1) {
      const totalAll = entradas.reduce((sum, e) => sum + e.cantidad, 0);
      const parts = senales.map(s => {
        const t = entradas.filter(e => e.senal_id === s.id).reduce((sum, e) => sum + e.cantidad, 0);
        return `${s.nombre} ${Math.round((t / totalAll) * 100)}% (${t.toLocaleString("es-AR")})`;
      }).join(" · ");
      items.push({ text: `Distribución del período: ${parts}`, type: "neutral" });
    }

    return items;
  }, [entradas, senales]);

  // Reusable comparison table (used for both periodoData and dowData)
  function ComparisonTable({
    cols,
    getLabel,
    getKey,
    getSubLabel,
    getDays,
  }: {
    cols: { totals: Record<string, number> }[];
    getLabel: (idx: number) => string;
    getKey: (idx: number) => string;
    getSubLabel?: (idx: number) => string;
    getDays?: (idx: number) => number;
  }) {
    return (
      <div className="overflow-x-auto">
        <table className="text-sm min-w-full">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
              <th className="text-left pb-2.5 pr-6 font-medium">Señal</th>
              {cols.flatMap((_, idx) => {
                const cells = [
                  <th key={`h-${getKey(idx)}`} className="text-right pb-2.5 pr-3 font-medium whitespace-nowrap">
                    <div>{getLabel(idx)}</div>
                    {getSubLabel && <div className="text-slate-500 font-normal normal-case tracking-normal text-xs">{getSubLabel(idx)}</div>}
                  </th>
                ];
                if (idx < cols.length - 1) cells.push(<th key={`d-${getKey(idx)}`} className="text-right pb-2.5 pr-6 font-medium text-slate-500">Δ%</th>);
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
                {cols.flatMap((col, idx) => {
                  const curr = col.totals[s.id] ?? 0;
                  const cells = [<td key={`v-${getKey(idx)}`} className="py-2.5 pr-3 text-right text-white font-semibold tabular-nums">{curr.toLocaleString("es-AR")}</td>];
                  if (idx < cols.length - 1) {
                    const nextVal = cols[idx + 1].totals[s.id] ?? 0;
                    cells.push(<td key={`d-${getKey(idx)}`} className="py-2.5 pr-6 text-right tabular-nums"><DeltaCell delta={calcDelta(nextVal, curr)} /></td>);
                  }
                  return cells;
                })}
              </tr>
            ))}
            <tr className="border-t border-slate-600 font-semibold">
              <td className="py-2.5 pr-6 text-slate-300">Total</td>
              {cols.flatMap((col, idx) => {
                const curr = senales.reduce((sum, s) => sum + (col.totals[s.id] ?? 0), 0);
                const cells = [<td key={`tv-${getKey(idx)}`} className="py-2.5 pr-3 text-right text-white tabular-nums">{curr.toLocaleString("es-AR")}</td>];
                if (idx < cols.length - 1) {
                  const nextTotal = senales.reduce((sum, s) => sum + (cols[idx + 1].totals[s.id] ?? 0), 0);
                  cells.push(<td key={`td-${getKey(idx)}`} className="py-2.5 pr-6 text-right tabular-nums"><DeltaCell delta={calcDelta(nextTotal, curr)} /></td>);
                }
                return cells;
              })}
            </tr>
            {getDays && (
              <tr className="border-t border-slate-800">
                <td className="py-1.5 pr-6 text-xs text-slate-500">Promedio / día</td>
                {cols.flatMap((col, idx) => {
                  const total = senales.reduce((sum, s) => sum + (col.totals[s.id] ?? 0), 0);
                  const avg = Math.round(total / Math.max(1, getDays(idx)));
                  const cells = [<td key={`avg-${getKey(idx)}`} className="py-1.5 pr-3 text-right text-slate-400 text-xs tabular-nums">{avg.toLocaleString("es-AR")}</td>];
                  if (idx < cols.length - 1) cells.push(<td key={`avgd-${getKey(idx)}`} className="pr-6" />);
                  return cells;
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const inputCls = "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-slate-500";
  const filterBtnCls = (active: boolean) => `text-xs px-3 py-1 rounded-full transition-colors ${active ? "bg-purple-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`;

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

        {/* Resumen por señal */}
        {resumen.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {resumen.map(({ s, si, mean, best, worst, tendencia }) => (
              <div key={s.id} className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-3" style={{ borderLeftColor: COLORS[si % COLORS.length], borderLeftWidth: 3 }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[si % COLORS.length] }} />
                  <span className="text-sm font-bold text-white">{s.nombre}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    {tendencia ? (
                      <>
                        <p className={`text-xl font-bold tabular-nums ${tendencia.dir === "up" ? "text-emerald-400" : tendencia.dir === "down" ? "text-red-400" : "text-slate-300"}`}>
                          {tendencia.dir === "up" ? "↑" : tendencia.dir === "down" ? "↓" : "→"} {tendencia.pct >= 0 ? "+" : ""}{tendencia.pct}%
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">vs semana anterior</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-slate-500">—</p>
                        <p className="text-xs text-slate-400 mt-0.5">vs semana anterior</p>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white tabular-nums">{mean.toLocaleString("es-AR")}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Promedio / día</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white tabular-nums">{best.cantidad.toLocaleString("es-AR")}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Mejor día</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-xs border-t border-slate-700/60 pt-2">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>Mejor: {formatTopDate(best.fecha)} — {best.cantidad.toLocaleString("es-AR")} vistas</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-red-400">
                    <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                    <span>Peor: {formatTopDate(worst.fecha)} — {worst.cantidad.toLocaleString("es-AR")} vistas</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Top 3 días */}
        {topDias.some(t => t.dias.length > 0) && (
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
                        <span className={`text-xs font-bold w-5 text-center shrink-0 ${rank === 0 ? "text-amber-400" : rank === 1 ? "text-slate-300" : "text-orange-700"}`}>#{rank + 1}</span>
                        <span className="text-sm text-slate-300 flex-1">{formatTopDate(d.fecha)}</span>
                        <span className="text-sm font-bold text-white tabular-nums">{d.cantidad.toLocaleString("es-AR")}</span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Gráfico */}
        {entradas.length > 0 && (
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold text-slate-200">Evolución de visualizaciones</h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setChartFilter("all")} className={filterBtnCls(chartFilter === "all")}>Todas</button>
                {senales.map(s => <button key={s.id} onClick={() => setChartFilter(s.id)} className={filterBtnCls(chartFilter === s.id)}>{s.nombre}</button>)}
              </div>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 24, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="fecha" ticks={saturdayTicks} tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={d => fmtDate(String(d))} />
                  <YAxis tick={{ fill: chart.axis, fontSize: 11 }} width={45} />
                  <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: chart.tooltipLabel }} itemStyle={{ color: chart.tooltipItem }} formatter={v => (typeof v === "number" ? v.toLocaleString("es-AR") : v)} />
                  {visibleSenales.length > 1 && <Legend wrapperStyle={{ color: chart.legend, fontSize: 12 }} />}
                  {visibleSenales.map(s => <Bar key={s.id} dataKey={s.nombre} fill={COLORS[senales.indexOf(s) % COLORS.length]} radius={[3, 3, 0, 0]} />)}
                  <ReferenceLine
                    x="2025-07-01"
                    stroke="#c084fc"
                    strokeDasharray="5 3"
                    strokeWidth={2}
                    label={{ value: "↑ Inicio programa", position: "insideTopLeft", fill: "#c084fc", fontSize: 10, fontWeight: 700 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-sm">Sin datos para el filtro seleccionado.</p>
            )}
          </div>
        )}

        {/* Comparativa */}
        {entradas.length > 0 && senales.length > 0 && (
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-4">
            {/* Header with mode toggle */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold text-slate-200">Comparativa</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Mode tabs */}
                <div className="flex bg-slate-700/60 rounded-lg p-0.5">
                  <button
                    onClick={() => setComparativaMode("semanas")}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${comparativaMode === "semanas" ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Semanas
                  </button>
                  <button
                    onClick={() => setComparativaMode("rangos")}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${comparativaMode === "rangos" ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Períodos
                  </button>
                  <button
                    onClick={() => { setComparativaMode("dow"); setShowDowButtons(true); }}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${comparativaMode === "dow" ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    <Calendar className="w-3.5 h-3.5" /> Días
                  </button>
                </div>
                {comparativaMode === "rangos" && (
                  <button onClick={addPeriodo} className="flex items-center gap-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Agregar período
                  </button>
                )}
              </div>
            </div>

            {/* Mode: semanas automáticas */}
            {comparativaMode === "semanas" && (
              entradas.length > 0 ? (
                <div className="space-y-3">
                  {/* Navegación de período */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSemanasOffset(o => o + 1)}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-slate-700/50"
                    >
                      <ChevronDown className="w-3.5 h-3.5 rotate-90" /> Semana anterior
                    </button>
                    {semanasOffset > 0 && (
                      <button
                        onClick={() => setSemanasOffset(o => Math.max(0, o - 1))}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-slate-700/50"
                      >
                        Semana siguiente <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                      </button>
                    )}
                  </div>
                  <ComparisonTable
                    cols={semanaPeriodsData}
                    getLabel={idx => semanaPeriodsData[idx].label}
                    getSubLabel={idx => {
                      const p = semanaPeriodsData[idx];
                      const isCurrentWeek = semanasOffset === 0 && idx === semanaPeriodsData.length - 1;
                      return `${fmtDate(p.desde)} → ${isCurrentWeek ? "hoy" : fmtDate(p.hasta)}`;
                    }}
                    getKey={idx => semanaPeriodsData[idx].id}
                    getDays={idx => {
                      const p = semanaPeriodsData[idx];
                      const [y1, m1, d1] = p.desde.split("-").map(Number);
                      const [y2, m2, d2] = p.hasta.split("-").map(Number);
                      return Math.max(1, Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000) + 1);
                    }}
                  />
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Sin registros para comparar.</p>
              )
            )}

            {/* Mode: rangos */}
            {comparativaMode === "rangos" && (
              <>
                {periodos.length === 0 ? (
                  <p className="text-slate-500 text-sm">Agregá períodos para comparar visualizaciones entre rangos de fechas.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3">
                      {periodos.map((p, idx) => (
                        <div key={p.id} className="flex items-center gap-2 bg-slate-700/50 border border-slate-600/40 rounded-lg px-3 py-2">
                          <span className="text-xs font-semibold text-slate-400 w-16 shrink-0">Período {idx + 1}</span>
                          <input type="date" value={p.desde} onChange={e => updatePeriodo(p.id, "desde", e.target.value)} className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
                          <span className="text-slate-500 text-xs">→</span>
                          <input type="date" value={p.hasta} onChange={e => updatePeriodo(p.id, "hasta", e.target.value)} className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
                          <button onClick={() => removePeriodo(p.id)} className="text-slate-500 hover:text-red-400 transition-colors ml-1"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                    <ComparisonTable
                      cols={periodoData}
                      getLabel={idx => `P${idx + 1}`}
                      getSubLabel={idx => `${periodoData[idx].desde.slice(5).replace("-","/")} → ${periodoData[idx].hasta.slice(5).replace("-","/")}`}
                      getKey={idx => periodoData[idx].id}
                      getDays={idx => {
                        const [y1, m1, d1] = periodoData[idx].desde.split("-").map(Number);
                        const [y2, m2, d2] = periodoData[idx].hasta.split("-").map(Number);
                        return Math.max(1, Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000) + 1);
                      }}
                    />
                  </>
                )}
              </>
            )}

            {/* Mode: día de semana */}
            {comparativaMode === "dow" && (
              <>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(({ label, dow }) => (
                    <button
                      key={dow}
                      onClick={() => setSelectedDow(dow)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${selectedDow === dow ? "bg-purple-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {selectedDow !== null && dowData.length === 0 && (
                  <p className="text-slate-500 text-sm">No hay datos para {DAYS.find(d => d.dow === selectedDow)?.label}.</p>
                )}

                {selectedDow !== null && dowData.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      {dowData.length} {DAYS.find(d => d.dow === selectedDow)?.label}s encontrados
                    </div>
                    <ComparisonTable
                      cols={dowData}
                      getLabel={idx => fmtDate(dowData[idx].fecha)}
                      getKey={idx => dowData[idx].fecha}
                      getDays={_ => 1}
                    />
                  </>
                )}

                {selectedDow === null && (
                  <p className="text-slate-500 text-sm">Seleccioná un día de la semana para ver la comparativa.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Puntos destacados */}
        {insights.length > 0 && (
          <div className="bg-slate-800/60 rounded-xl p-5 border border-slate-700/40 space-y-3">
            <h2 className="text-base font-semibold text-slate-200">Puntos destacados</h2>
            <div className="space-y-2">
              {insights.map((item, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm ${
                  item.type === "good" ? "bg-emerald-900/30 border border-emerald-700/30" :
                  item.type === "bad"  ? "bg-red-900/30 border border-red-700/30" :
                                        "bg-slate-700/40 border border-slate-600/30"
                }`}>
                  <span className={`mt-0.5 shrink-0 ${item.type === "good" ? "text-emerald-400" : item.type === "bad" ? "text-red-400" : "text-slate-400"}`}>
                    {item.type === "good" ? <TrendingUp className="w-4 h-4" /> : item.type === "bad" ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  </span>
                  <span className={item.type === "good" ? "text-emerald-200" : item.type === "bad" ? "text-red-200" : "text-slate-300"}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Registros diarios — colapsables */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/40">
          <div className="flex items-center justify-between flex-wrap gap-3 p-5">
            <button
              onClick={() => setShowRegistros(v => !v)}
              className="flex items-center gap-2 text-left"
            >
              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showRegistros ? "rotate-90" : ""}`} />
              <h2 className="text-base font-semibold text-slate-200">Registros diarios</h2>
              {filtered.length > 0 && <span className="text-xs font-normal text-slate-500">{groupedByDate.length} fechas · {filtered.length} registros</span>}
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              {showRegistros && senales.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setTableFilter("all")} className={filterBtnCls(tableFilter === "all")}>Todas</button>
                  {senales.map(s => <button key={s.id} onClick={() => setTableFilter(s.id)} className={filterBtnCls(tableFilter === s.id)}>{s.nombre}</button>)}
                </div>
              )}
              <button onClick={openNewEntry} disabled={senales.length === 0} className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          </div>

          {showRegistros && (groupedByDate.length === 0 ? (
            <p className="text-slate-500 text-sm px-5 pb-5">{senales.length === 0 ? "Primero creá una señal." : "No hay registros para el filtro seleccionado."}</p>
          ) : (
            <div className="divide-y divide-slate-800/60 px-5 pb-5">
              {groupedByDate.map(([date, entries]) => {
                const isExpanded = expandedDates.has(date);
                const total = entries.reduce((sum, e) => sum + e.cantidad, 0);
                const dayLabel = DAYS.find(d => d.dow === getDow(date))?.label ?? "";
                return (
                  <div key={date}>
                    {/* Date header — click to expand */}
                    <button
                      onClick={() => toggleDate(date)}
                      className="w-full flex items-center gap-3 py-3 px-2 hover:bg-slate-700/30 rounded-lg transition-colors text-left"
                    >
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      }
                      <span className="text-sm font-semibold text-slate-200 tabular-nums w-24 shrink-0">{date}</span>
                      <span className="text-xs text-slate-500 shrink-0">{dayLabel}</span>
                      <div className="flex gap-3 ml-2 flex-1 flex-wrap">
                        {entries.map(e => (
                          <span key={e.id} className="text-xs text-slate-400">
                            {e.senal_nombre}: <span className="text-slate-200 font-medium">{e.cantidad.toLocaleString("es-AR")}</span>
                          </span>
                        ))}
                      </div>
                      <span className="text-sm font-bold text-white tabular-nums shrink-0 ml-auto">{total.toLocaleString("es-AR")}</span>
                    </button>

                    {/* Expanded entries */}
                    {isExpanded && (
                      <div className="ml-7 mb-2 space-y-1">
                        {entries.map(e => (
                          <div key={e.id} className="flex items-center gap-3 py-2 px-3 bg-slate-700/20 rounded-lg">
                            <span className="text-sm text-slate-300 flex-1">{e.senal_nombre}</span>
                            <span className="text-sm font-bold text-white tabular-nums">{e.cantidad.toLocaleString("es-AR")}</span>
                            <button onClick={() => openEditEntry(e)} className="text-slate-400 hover:text-sky-400 transition-colors"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => deleteEntry(e.id)} className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Modal: señal */}
      {showSenalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSenalForm(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white">{editingSenal ? "Editar señal" : "Nueva señal"}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input value={fNombre} onChange={e => setFNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && saveSenal()} className={inputCls} placeholder="Ej: ESPN, Canal 13..." autoFocus />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripción</label>
                <input value={fDesc} onChange={e => setFDesc(e.target.value)} className={inputCls} placeholder="Opcional" />
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
          <div className={`bg-slate-800 border border-slate-700 rounded-xl p-6 w-full mx-4 space-y-4 ${editingEntry ? "max-w-md" : "max-w-lg"}`} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white">{editingEntry ? "Editar registro" : "Cargar registros"}</h3>

            {editingEntry ? (
              /* Edición individual */
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Señal *</label>
                  <select value={fSenalId} onChange={e => setFSenalId(e.target.value)} className={inputCls}>
                    {senales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha *</label>
                  <input type="date" value={fFecha} onChange={e => setFFecha(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Visualizaciones *</label>
                  <input type="number" min="0" value={fCantidad} onChange={e => setFCantidad(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEntry()} className={inputCls} placeholder="0" autoFocus />
                </div>
              </div>
            ) : (() => {
              /* Carga semanal: navegación + grilla día × señal */
              const weekDays = getWeekDays(fWeekStart);
              const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
              return (
                <div className="space-y-3">
                  {/* Navegación de semana */}
                  <div className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
                    <button onClick={() => changeWeek(shiftWeek(fWeekStart, -1))} className="text-slate-400 hover:text-white transition-colors p-1">
                      <ChevronDown className="w-4 h-4 rotate-90" />
                    </button>
                    <span className="text-sm font-semibold text-slate-200">
                      {fmtDate(weekDays[0])} — {fmtDate(weekDays[6])}
                    </span>
                    <button onClick={() => changeWeek(shiftWeek(fWeekStart, 1))} className="text-slate-400 hover:text-white transition-colors p-1">
                      <ChevronDown className="w-4 h-4 -rotate-90" />
                    </button>
                  </div>

                  {/* Grilla día × señal */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-700">
                          <th className="text-left pb-2 font-medium w-20">Día</th>
                          {senales.map((s, si) => (
                            <th key={s.id} className="text-right pb-2 pl-2 font-medium">
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[si % COLORS.length] }} />
                                <span className="truncate max-w-[90px]">{s.nombre}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {weekDays.map(day => {
                          const [dy, dm, dd] = day.split("-").map(Number);
                          const dow = new Date(dy, dm - 1, dd).getDay();
                          const isWeekend = dow === 0 || dow === 6;
                          return (
                            <tr key={day} className={`border-b border-slate-800/40 ${isWeekend ? "bg-slate-700/10" : ""}`}>
                              <td className="py-1.5 pr-3">
                                <span className={`font-semibold text-xs ${isWeekend ? "text-purple-400" : "text-slate-300"}`}>{DAY_SHORT[dow]}</span>
                                <span className="text-slate-500 text-xs ml-1">{fmtDate(day)}</span>
                              </td>
                              {senales.map(s => (
                                <td key={s.id} className="py-1 pl-2">
                                  <input
                                    type="number"
                                    min="0"
                                    value={fSemana[day]?.[s.id] ?? ""}
                                    onChange={e => setFSemana(prev => ({
                                      ...prev,
                                      [day]: { ...(prev[day] ?? {}), [s.id]: e.target.value },
                                    }))}
                                    className="w-full bg-slate-700 border border-slate-600/60 rounded px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-slate-600"
                                    placeholder="—"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowEntryForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={editingEntry ? saveEntry : saveMultiEntry} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
