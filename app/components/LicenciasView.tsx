"use client";
import { useState, useEffect, useMemo } from "react";
import { X, Monitor, Smartphone, Key, AlertTriangle, TrendingUp, Clock } from "lucide-react";

interface Props {
  gotvStb: number;
  gotvMovil: number;
  viewtvStb: number;
  viewtvMovil: number;
  onClose: () => void;
}

interface Snapshot {
  fecha: string; // YYYY-MM-DD
  stb: number;
  movil: number;
}

const STORAGE_KEY = "qvix_total_licencias";
const HISTORY_KEY = "qvix_licencias_historial";
const DEFAULT_LICENCIAS = 25000;

const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function fmtProjectionDate(date: Date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function getUsageColor(pct: number) {
  if (pct < 60) return {
    text: "text-emerald-400",
    bar: "bg-emerald-500",
    badge: "bg-emerald-900/40 border border-emerald-700 text-emerald-400",
    label: "Margen seguro",
  };
  if (pct < 85) return {
    text: "text-amber-400",
    bar: "bg-amber-400",
    badge: "bg-amber-900/40 border border-amber-700 text-amber-400",
    label: "Atención",
  };
  return {
    text: "text-red-400",
    bar: "bg-red-500",
    badge: "bg-red-900/40 border border-red-700 text-red-400",
    label: pct >= 100 ? "Límite superado" : "Crítico",
  };
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const colors = getUsageColor(max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
      <div
        className={`h-3 rounded-full transition-all duration-500 ${colors.bar}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function calcProjection(snapshots: Snapshot[], field: "stb" | "movil", limit: number) {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const [fy, fm, fd] = first.fecha.split("-").map(Number);
  const [ly, lm, ld] = last.fecha.split("-").map(Number);
  const daysDiff = Math.max(1, (new Date(ly, lm - 1, ld).getTime() - new Date(fy, fm - 1, fd).getTime()) / 86400000);
  const totalGrowth = last[field] - first[field];
  const growthPerDay = totalGrowth / daysDiff;
  const growthPerMonth = Math.round(growthPerDay * 30);
  if (growthPerDay <= 0) return { growthPerMonth, daysToLimit: null as number | null, limitDate: null as Date | null };
  const remaining = limit - last[field];
  const daysToLimit = Math.ceil(remaining / growthPerDay);
  const limitDate = new Date(ly, lm - 1, ld);
  limitDate.setDate(limitDate.getDate() + daysToLimit);
  return { growthPerMonth, daysToLimit, limitDate };
}

export default function LicenciasView({ gotvStb, gotvMovil, viewtvStb, viewtvMovil, onClose }: Props) {
  const [totalLicencias, setTotalLicencias] = useState(DEFAULT_LICENCIAS);
  const [inputValue, setInputValue] = useState(String(DEFAULT_LICENCIAS));
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);

  const totalStb = gotvStb + viewtvStb;
  const totalMovil = gotvMovil + viewtvMovil;

  // Load stored license count
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n > 0) { setTotalLicencias(n); setInputValue(String(n)); }
    }
  }, []);

  // Save one snapshot per month to history
  useEffect(() => {
    if (totalStb === 0 && totalMovil === 0) return;
    const today = new Date().toISOString().split("T")[0];
    const thisMonth = today.slice(0, 7); // YYYY-MM
    let stored: Snapshot[] = [];
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch { /* ignore */ }
    const withoutThisMonth = stored.filter(h => h.fecha.slice(0, 7) !== thisMonth);
    withoutThisMonth.push({ fecha: today, stb: totalStb, movil: totalMovil });
    const trimmed = withoutThisMonth.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-24);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    setHistory(trimmed);
  }, [totalStb, totalMovil]);

  const applyLicencias = () => {
    const n = parseInt(inputValue.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > 0) {
      setTotalLicencias(n);
      localStorage.setItem(STORAGE_KEY, String(n));
    } else {
      setInputValue(String(totalLicencias));
    }
    setEditing(false);
  };

  const stbPct = totalLicencias > 0 ? (totalStb / totalLicencias) * 100 : 0;
  const movilPct = totalLicencias > 0 ? (totalMovil / totalLicencias) * 100 : 0;
  const maxPct = Math.max(stbPct, movilPct);

  const stbColors = getUsageColor(stbPct);
  const movilColors = getUsageColor(movilPct);

  const stbProjection = useMemo(() => calcProjection(history, "stb", totalLicencias), [history, totalLicencias]);
  const movilProjection = useMemo(() => calcProjection(history, "movil", totalLicencias), [history, totalLicencias]);

  function ProjectionCard({ label, icon, color, proj, pct, current }: {
    label: string;
    icon: React.ReactNode;
    color: string;
    proj: ReturnType<typeof calcProjection>;
    pct: number;
    current: number;
  }) {
    const colors = getUsageColor(pct);
    return (
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-semibold text-slate-200">{label}</span>
          </div>
          <span className={`text-xs px-2.5 py-0.5 rounded-full ${colors.badge}`}>{colors.label}</span>
        </div>

        {proj === null ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
            <Clock size={15} />
            Volvé mañana — se necesitan al menos 2 días para calcular la tendencia.
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold font-mono ${proj.growthPerMonth > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {proj.growthPerMonth > 0 ? "+" : ""}{proj.growthPerMonth.toLocaleString()}
              </span>
              <span className="text-slate-400 text-sm">dispositivos por mes en promedio</span>
            </div>

            <div className="text-sm space-y-1">
              {proj.growthPerMonth <= 0 ? (
                <p className="text-emerald-400">Sin crecimiento detectado en el período — el límite no está en riesgo.</p>
              ) : proj.daysToLimit !== null && proj.limitDate !== null ? (
                proj.daysToLimit <= 30 ? (
                  <p className="text-red-400 font-semibold">Llegaría al límite en menos de un mes — atención inmediata.</p>
                ) : proj.daysToLimit <= 365 ? (
                  <p className="text-amber-300">
                    A este ritmo llegaría al límite en <span className="font-semibold">~{Math.ceil(proj.daysToLimit / 30)} meses</span> — aproximadamente <span className="font-semibold">{fmtProjectionDate(proj.limitDate)}</span>.
                  </p>
                ) : (
                  <p className="text-slate-300">
                    No llegaría al límite en el próximo año — proyección estimada: <span className="font-semibold">{fmtProjectionDate(proj.limitDate)}</span>.
                  </p>
                )
              ) : null}
            </div>

            <div className="border-t border-slate-700/60 pt-3 flex items-center justify-between text-xs text-slate-500">
              <span>Actualmente: <span className={`font-semibold ${color}`}>{current.toLocaleString()}</span> / {totalLicencias.toLocaleString()} ({pct.toFixed(1)}%)</span>
              <span>{history.length} {history.length === 1 ? "medición" : "mediciones"}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Key size={20} className="text-indigo-400" />
              Control de Licencias
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Uso de licencias de plataforma — GOTV + ViewTV combinados
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <X size={15} /> Volver al dashboard
          </button>
        </div>

        {/* Config de licencias */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex items-center gap-4 flex-wrap">
          <Key size={18} className="text-slate-500" />
          <span className="text-slate-300 text-sm font-medium">Total de licencias disponibles:</span>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyLicencias(); if (e.key === "Escape") { setEditing(false); setInputValue(String(totalLicencias)); } }}
                autoFocus
                className="bg-slate-900 border border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none w-32 font-mono text-center"
              />
              <button onClick={applyLicencias} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">Guardar</button>
              <button onClick={() => { setEditing(false); setInputValue(String(totalLicencias)); }} className="text-slate-500 hover:text-slate-300 text-sm px-2 py-1.5 transition-colors">Cancelar</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-indigo-400 font-bold text-lg font-mono">{totalLicencias.toLocaleString()}</span>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-indigo-400 border border-slate-600 hover:border-indigo-500 px-2 py-0.5 rounded transition-colors">Editar</button>
            </div>
          )}
          <p className="text-xs text-slate-500 ml-auto">
            STB y Móvil tienen cupos independientes — el tope se alcanza cuando cualquiera llega al límite
          </p>
        </div>

        {/* Alerta si supera el tope */}
        {maxPct >= 100 && (
          <div className="flex items-center gap-2 text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-sm">
            <AlertTriangle size={16} />
            Se superó el límite de licencias — revisá el plan de expansión.
          </div>
        )}

        {/* Cards STB y Móvil */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* STB Card */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor size={18} className="text-indigo-400" />
                <h3 className="text-slate-200 font-semibold">STB (Decos)</h3>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full ${stbColors.badge}`}>{stbColors.label}</span>
            </div>
            <div>
              <div className="flex items-end justify-between mb-2">
                <span className={`text-4xl font-bold font-mono ${stbColors.text}`}>{totalStb.toLocaleString()}</span>
                <div className="text-right">
                  <div className={`text-2xl font-bold font-mono ${stbColors.text}`}>{stbPct.toFixed(1)}%</div>
                  <div className="text-xs text-slate-500">de {totalLicencias.toLocaleString()}</div>
                </div>
              </div>
              <ProgressBar value={totalStb} max={totalLicencias} />
              <div className="text-xs text-slate-500 mt-1">Disponibles: {Math.max(0, totalLicencias - totalStb).toLocaleString()} licencias</div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700">
              <div className="bg-slate-900/60 rounded-xl p-3">
                <div className="text-xs text-slate-500 mb-1">GOTV</div>
                <div className="text-xl font-bold text-purple-400 font-mono">{gotvStb.toLocaleString()}</div>
                <div className="text-xs text-slate-600 mt-0.5">{totalStb > 0 ? Math.round((gotvStb / totalStb) * 100) : 0}% del total STB</div>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-3">
                <div className="text-xs text-slate-500 mb-1">ViewTV</div>
                <div className="text-xl font-bold text-cyan-400 font-mono">{viewtvStb.toLocaleString()}</div>
                <div className="text-xs text-slate-600 mt-0.5">{totalStb > 0 ? Math.round((viewtvStb / totalStb) * 100) : 0}% del total STB</div>
              </div>
            </div>
          </div>

          {/* Móvil Card */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone size={18} className="text-emerald-400" />
                <h3 className="text-slate-200 font-semibold">Móvil (App)</h3>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full ${movilColors.badge}`}>{movilColors.label}</span>
            </div>
            <div>
              <div className="flex items-end justify-between mb-2">
                <span className={`text-4xl font-bold font-mono ${movilColors.text}`}>{totalMovil.toLocaleString()}</span>
                <div className="text-right">
                  <div className={`text-2xl font-bold font-mono ${movilColors.text}`}>{movilPct.toFixed(1)}%</div>
                  <div className="text-xs text-slate-500">de {totalLicencias.toLocaleString()}</div>
                </div>
              </div>
              <ProgressBar value={totalMovil} max={totalLicencias} />
              <div className="text-xs text-slate-500 mt-1">Disponibles: {Math.max(0, totalLicencias - totalMovil).toLocaleString()} licencias</div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700">
              <div className="bg-slate-900/60 rounded-xl p-3">
                <div className="text-xs text-slate-500 mb-1">GOTV</div>
                <div className="text-xl font-bold text-purple-400 font-mono">{gotvMovil.toLocaleString()}</div>
                <div className="text-xs text-slate-600 mt-0.5">{totalMovil > 0 ? Math.round((gotvMovil / totalMovil) * 100) : 0}% del total Móvil</div>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-3">
                <div className="text-xs text-slate-500 mb-1">ViewTV</div>
                <div className="text-xl font-bold text-cyan-400 font-mono">{viewtvMovil.toLocaleString()}</div>
                <div className="text-xs text-slate-600 mt-0.5">{totalMovil > 0 ? Math.round((viewtvMovil / totalMovil) * 100) : 0}% del total Móvil</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tendencia y proyección */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-400" />
            <h3 className="text-slate-300 font-semibold text-sm uppercase tracking-wider">Tendencia y proyección</h3>
            {history.length >= 2 && (
              <span className="ml-auto text-xs text-slate-500">
                Desde {history[0].fecha} · {history.length} {history.length === 1 ? "mes" : "meses"}
              </span>
            )}
          </div>

          {history.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-500">
              <Clock size={28} className="opacity-40" />
              <p className="text-sm text-center">
                Se necesitan al menos 2 meses de datos para calcular la tendencia y la proyección.<br />
                <span className="text-slate-600">El valor de este mes ya quedó guardado — volvé el mes que viene.</span>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProjectionCard
                label="STB (Decos)"
                icon={<Monitor size={16} className="text-indigo-400" />}
                color="text-indigo-400"
                proj={stbProjection}
                pct={stbPct}
                current={totalStb}
              />
              <ProjectionCard
                label="Móvil (App)"
                icon={<Smartphone size={16} className="text-emerald-400" />}
                color="text-emerald-400"
                proj={movilProjection}
                pct={movilPct}
                current={totalMovil}
              />
            </div>
          )}

          <p className="text-xs text-slate-600">
            La proyección se calcula con el crecimiento promedio entre meses. Guarda un valor por mes — con más meses acumulados la estimación es más precisa.
          </p>
        </div>

      </div>
    </div>
  );
}
