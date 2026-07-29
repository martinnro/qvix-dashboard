"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ChevronLeft, Loader2, AlertCircle, X,
  Clock, Users, Wifi, AlertTriangle, CheckCircle2,
  RefreshCw, Maximize2, Minimize2, TrendingUp, TrendingDown,
  Bell,
} from "lucide-react";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha", 4: "Valle Viejo",
  5: "Tinogasta", 6: "Rodeo", 7: "La Puerta", 8: "Fiambalá",
};

interface Row {
  conexion: string;
  cod_sucursal: number;
  estado_incidencia: number;
  nap: string | null;
  fecha: string;
  dias: number;
  dias_hasta_asignacion: number | null;
  problema: string | null;
  cuadrilla: string | null;
}

interface SemanaData {
  cerradosEstaSemana: number;
  cerradosSemanaAnterior: number;
  promedioCierreGlobal: number | null;
  nuevosEstaSemana: number;
  nuevosSemanaAnterior: number;
  problemaFrecuente: { problema: string; cantidad: number } | null;
  cuadrillaPromedios: Record<string, number>;
}

interface Counts { total: number; asignados: number; pendientes: number; urgentes: number }

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function diasBadge(dias: number, small = false) {
  const sz = small ? "text-[11px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  if (dias >= 7) return <span className={`${sz} rounded font-bold bg-red-500/25 text-red-400`}>{dias}d</span>;
  if (dias >= 3) return <span className={`${sz} rounded font-bold bg-amber-500/25 text-amber-400`}>{dias}d</span>;
  return <span className={`${sz} rounded font-bold bg-emerald-500/25 text-emerald-400`}>{dias}d</span>;
}

const COLORES_PROBLEMA = [
  "#f43f5e","#f97316","#eab308","#6366f1","#10b981","#06b6d4","#a855f7","#ec4899","#64748b",
];

function HBar({ label, n, max, color = "#6366f1" }: { label: string; n: number; max: number; color?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-200 truncate">{label}</span>
        <span className="text-sm font-bold flex-shrink-0" style={{ color }}>{n}</span>
      </div>
      <div className="w-full h-3 bg-slate-700/60 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct(n, max)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// inverse=true: subir es malo (Total, Pendientes, Urgentes)
// inverse=false: subir es bueno (Asignados)
function Delta({ prev, curr, inverse = false }: { prev: number; curr: number; inverse?: boolean }) {
  const diff = curr - prev;
  if (diff === 0) return null;
  const bad = inverse ? diff > 0 : diff < 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${bad ? "text-red-400" : "text-emerald-400"}`}>
      {diff > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {diff > 0 ? `+${diff}` : diff}
    </span>
  );
}

function CuadrillaCard({ nombre, total, problemas, totalGeneral, promedioDias }: {
  nombre: string;
  total: number;
  problemas: { problema: string; cantidad: number }[];
  totalGeneral: number;
  promedioDias?: number | null;
}) {
  return (
    <div className="bg-slate-900/70 border border-slate-600 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-slate-100 leading-tight truncate">{nombre}</p>
          {promedioDias != null && (
            <span className="text-[11px] text-slate-500 flex-shrink-0">{promedioDias}d prom.</span>
          )}
        </div>
        <span className="text-xl font-bold text-cyan-400 flex-shrink-0">{total}</span>
      </div>
      <div className="w-full h-3 bg-slate-700/60 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-cyan-500/80 transition-all" style={{ width: `${pct(total, totalGeneral)}%` }} />
      </div>
      <div className="flex flex-wrap gap-1">
        {problemas.map((p) => (
          <span key={p.problema} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700 text-[11px]">
            <span className="font-bold text-slate-200">{p.cantidad}</span>
            <span className="text-slate-400 max-w-[120px] truncate">{p.problema}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const REFRESH_INTERVAL = 2 * 60 * 1000;

// ── MODO TV ──────────────────────────────────────────────────────────────────
function TVMode({
  nombre, rows, semana, isRefreshing, onExit, onRefresh, lastUpdate,
}: {
  nombre: string;
  rows: Row[];
  semana: SemanaData | null;
  isRefreshing: boolean;
  onExit: () => void;
  onRefresh: () => void;
  lastUpdate: Date | null;
}) {
  const now = useNow();
  const total     = rows.length;
  const asignados = rows.filter((r) => r.estado_incidencia === 2).length;
  const pendientes= rows.filter((r) => r.estado_incidencia === 1).length;
  const urgentes  = rows.filter((r) => r.dias >= 7).length;

  const porProblema = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) { const k = r.problema ?? "Sin clasificar"; map.set(k, (map.get(k) ?? 0) + 1); }
    return [...map.entries()].map(([n, c]) => ({ nombre: n, cantidad: c })).sort((a, b) => b.cantidad - a.cantidad);
  }, [rows]);
  const maxP = Math.max(...porProblema.map((p) => p.cantidad), 1);

  const porCuadrilla = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) { if (r.cuadrilla) map.set(r.cuadrilla, (map.get(r.cuadrilla) ?? 0) + 1); }
    return [...map.entries()].map(([n, c]) => ({ nombre: n, cantidad: c })).sort((a, b) => b.cantidad - a.cantidad);
  }, [rows]);

  const urgentesRows = useMemo(() => rows.filter((r) => r.dias >= 7).sort((a, b) => b.dias - a.dias), [rows]);

  const porNap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.nap || r.nap === "N.") continue;
      if (!r.problema?.toLowerCase().includes("sin servicio")) continue;
      map.set(r.nap, (map.get(r.nap) ?? 0) + 1);
    }
    return [...map.entries()].filter(([, c]) => c >= 2).map(([nap, cantidad]) => ({ nap, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }, [rows]);


  const hora  = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const fecha = now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-8 py-4 border-b border-slate-800 flex-shrink-0">
        <p className="text-slate-600 text-xs capitalize">{fecha}</p>
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">Sucursal {nombre}</h1>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className={`text-3xl font-mono font-bold text-slate-300 ${isRefreshing ? "opacity-50" : ""}`}>{hora}</p>
            {isRefreshing && <p className="text-[10px] text-slate-600 animate-pulse">Actualizando…</p>}
            {!isRefreshing && lastUpdate && (
              <p className="text-[10px] text-slate-600">
                {lastUpdate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <button onClick={onRefresh} disabled={isRefreshing} className="p-2 text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-30">
            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <button onClick={onExit} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-xs rounded-lg transition-colors">
            <Minimize2 size={13} /> Salir
          </button>
        </div>
      </div>

      <div className="flex-1 px-8 py-6 flex flex-col gap-5 overflow-hidden">
        {urgentes > 0 && (
          <div className="bg-red-950/60 border border-red-700 rounded-2xl px-5 py-3 flex-shrink-0">
            <p className="text-base font-bold text-red-300 flex items-center gap-2 mb-2">
              <AlertTriangle size={18} />
              {urgentes} reclamo{urgentes > 1 ? "s" : ""} con 7+ días sin resolver
            </p>
            <div className="flex flex-wrap gap-2">
              {urgentesRows.map((r, i) => (
                <span key={i} className="flex items-center gap-1.5 bg-red-900/40 border border-red-800/40 rounded-lg px-2.5 py-1 text-xs">
                  <span className="font-mono font-semibold text-slate-200">{r.conexion}</span>
                  <span className="text-slate-500 max-w-[150px] truncate">{r.problema ?? "—"}</span>
                  {diasBadge(r.dias, true)}
                </span>
              ))}
            </div>
          </div>
        )}

        {total === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <CheckCircle2 size={72} className="text-emerald-500 opacity-40" />
            <p className="text-3xl font-semibold text-slate-300">Todo al día</p>
            <p className="text-slate-500 text-lg">No hay incidencias activas</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-5 min-h-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-shrink-0">
              {[
                { label: "Total activos", value: total, color: "text-slate-100",   labelColor: "text-slate-500" },
                { label: "Asignados", value: asignados, color: "text-emerald-400", labelColor: "text-emerald-600", sub: `${pct(asignados, total)}%` },
                { label: "Pendientes", value: pendientes, color: pendientes > 0 ? "text-amber-400" : "text-slate-500", labelColor: "text-amber-600" },
                { label: "Urgentes +7d", value: urgentes, color: urgentes > 0 ? "text-red-400" : "text-slate-500", labelColor: urgentes > 0 ? "text-red-500" : "text-slate-500", alert: urgentes > 0 },
              ].map((k) => (
                <div key={k.label} className={`rounded-2xl p-5 text-center border ${k.alert && k.value > 0 ? "bg-red-950/30 border-red-700/40" : "bg-slate-800 border-slate-700"}`}>
                  <p className={`text-xs uppercase tracking-widest mb-2 ${k.labelColor}`}>{k.label}</p>
                  <p className={`text-7xl font-black ${k.color}`}>{k.value}</p>
                  {k.sub && <p className="text-xs text-slate-600 mt-2">{k.sub}</p>}
                </div>
              ))}
            </div>

            {semana && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
                <div className={`rounded-xl px-4 py-2.5 border ${semana.cerradosEstaSemana >= semana.cerradosSemanaAnterior ? "bg-emerald-950/30 border-emerald-800/40" : "bg-slate-800 border-slate-700"}`}>
                  <p className="text-[11px] text-emerald-600 uppercase tracking-wider">Cerrados semana</p>
                  <p className="text-2xl font-bold text-emerald-400">{semana.cerradosEstaSemana}</p>
                  {semana.cerradosSemanaAnterior > 0 && <p className="text-[11px] text-slate-600">ant. {semana.cerradosSemanaAnterior}</p>}
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5">
                  <p className="text-[11px] text-sky-600 uppercase tracking-wider">Nuevos semana</p>
                  <p className="text-2xl font-bold text-sky-400">{semana.nuevosEstaSemana}</p>
                  {semana.nuevosSemanaAnterior > 0 && <p className="text-[11px] text-slate-600">ant. {semana.nuevosSemanaAnterior}</p>}
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Problema frecuente</p>
                  {semana.problemaFrecuente
                    ? <p className="text-sm font-semibold text-slate-200 leading-tight line-clamp-2 mt-0.5">{semana.problemaFrecuente.problema}</p>
                    : <p className="text-slate-500 text-sm">—</p>}
                </div>
                {(() => {
                  const masAnt = rows.length > 0 ? Math.max(...rows.map((r) => r.dias)) : 0;
                  return (
                    <div className={`rounded-xl px-4 py-2.5 border ${masAnt >= 7 ? "bg-red-950/30 border-red-800/40" : "bg-slate-800 border-slate-700"}`}>
                      <p className="text-[11px] text-slate-500 uppercase tracking-wider">Más antiguo</p>
                      <p className={`text-2xl font-bold ${masAnt >= 7 ? "text-red-400" : masAnt >= 3 ? "text-amber-400" : "text-slate-300"}`}>{masAnt > 0 ? `${masAnt}d` : "—"}</p>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 overflow-y-auto">
                <h3 className="text-base font-semibold text-slate-200 mb-4">Tipos de reclamo</h3>
                <div className="space-y-4">
                  {porProblema.map((p, i) => (
                    <HBar key={p.nombre} label={p.nombre} n={p.cantidad} max={maxP} color={COLORES_PROBLEMA[i % COLORES_PROBLEMA.length]} />
                  ))}
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 overflow-y-auto">
                <h3 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
                  <Users size={16} className="text-cyan-400" /> Reclamos por cuadrilla
                </h3>
                <div className="space-y-4">
                  {porCuadrilla.length === 0
                    ? <p className="text-slate-500 text-sm">Sin cuadrillas asignadas</p>
                    : porCuadrilla.map((c) => {
                        const prom = semana?.cuadrillaPromedios?.[c.nombre];
                        return (
                          <div key={c.nombre} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-slate-200 flex items-center gap-2">
                                {c.nombre}
                                {prom != null && <span className="text-[11px] text-slate-500">{prom}d prom.</span>}
                              </span>
                              <span className="text-xl font-bold text-cyan-400 flex-shrink-0">{c.cantidad}</span>
                            </div>
                            <div className="w-full h-3 bg-slate-700/60 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-cyan-500/80 transition-all" style={{ width: `${pct(c.cantidad, total)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                </div>
              </div>
            </div>

            {porNap.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3 flex-shrink-0">
                <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                  <Wifi size={14} className="text-indigo-400" />
                  {porNap.length} NAP{porNap.length > 1 ? "s" : ""} con 2+ Sin Servicio
                </p>
                <div className="flex flex-wrap gap-3">
                  {porNap.map((n) => (
                    <span key={n.nap} className="flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-800/40 rounded-lg text-sm">
                      <span className="font-mono text-slate-300">{n.nap}</span>
                      <span className="font-bold text-indigo-400">{n.cantidad}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── VISTA NORMAL ─────────────────────────────────────────────────────────────
export default function ReclamosSucursalDashboard({
  codSucursal,
  onBack,
  onClose,
}: {
  codSucursal: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const [rows, setRows]           = useState<Row[]>([]);
  const [loading, setLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tvMode, setTvMode]       = useState(false);
  const [semana, setSemana]       = useState<SemanaData | null>(null);
  const [semanaLoading, setSemanaLoading] = useState(true);
  const [nuevos, setNuevos]       = useState<string[]>([]);
  const [prevCounts, setPrevCounts] = useState<Counts | null>(null);
  const currentCountsRef          = useRef<Counts | null>(null);
  const prevIdsRef                = useRef<Set<string>>(new Set());

  const nombre = SUCURSALES[codSucursal] ?? `Sucursal ${codSucursal}`;

  const fetchData = useCallback((isFirst = false) => {
    if (!isFirst) setIsRefreshing(true);

    const mainFetch = fetch(`/api/incidencias-activas?sucursal=${codSucursal}`)
      .then((r) => r.json())
      .then((data: Row[]) => {
        if ((data as unknown as { error: string }).error) throw new Error((data as unknown as { error: string }).error);

        // Detectar reclamos nuevos
        const newIds = new Set(data.map((r) => r.conexion));
        if (prevIdsRef.current.size > 0) {
          const appeared = data.filter((r) => !prevIdsRef.current.has(r.conexion)).map((r) => r.conexion);
          if (appeared.length > 0) {
            setNuevos(appeared);
            setTimeout(() => setNuevos([]), 8000);
          }
        }
        prevIdsRef.current = newIds;

        setRows(data);
        setLastUpdate(new Date());
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => { setLoading(false); setIsRefreshing(false); });

    const semanaFetch = fetch(`/api/incidencias-semana?sucursal=${codSucursal}`)
      .then((r) => r.json())
      .then((data: SemanaData) => { if (!(data as unknown as { error: string }).error) setSemana(data); })
      .finally(() => setSemanaLoading(false));

    return Promise.all([mainFetch, semanaFetch]);
  }, [codSucursal]);

  useEffect(() => { fetchData(true); }, [fetchData]);

  useEffect(() => {
    if (tvMode) {
      const t = setInterval(() => fetchData(false), REFRESH_INTERVAL);
      return () => clearInterval(t);
    }
  }, [tvMode, fetchData]);

  const total      = useMemo(() => rows.length, [rows]);
  const asignados  = useMemo(() => rows.filter((r) => r.estado_incidencia === 2).length, [rows]);
  const pendientes = useMemo(() => rows.filter((r) => r.estado_incidencia === 1).length, [rows]);
  const urgentes   = useMemo(() => rows.filter((r) => r.dias >= 7).length, [rows]);

  const porProblema = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) { const k = r.problema ?? "Sin clasificar"; map.set(k, (map.get(k) ?? 0) + 1); }
    return [...map.entries()].map(([n, c]) => ({ nombre: n, cantidad: c })).sort((a, b) => b.cantidad - a.cantidad);
  }, [rows]);
  const maxProblema = useMemo(() => Math.max(...porProblema.map((p) => p.cantidad), 1), [porProblema]);

  const porCuadrilla = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!r.cuadrilla) continue;
      if (!map.has(r.cuadrilla)) map.set(r.cuadrilla, new Map());
      const sub = map.get(r.cuadrilla)!;
      const k = r.problema ?? "Sin clasificar";
      sub.set(k, (sub.get(k) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([n, sub]) => ({
        nombre: n,
        total: [...sub.values()].reduce((a, b) => a + b, 0),
        problemas: [...sub.entries()].map(([p, c]) => ({ problema: p, cantidad: c })).sort((a, b) => b.cantidad - a.cantidad),
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const masAntiguo = useMemo(() => (rows.length > 0 ? Math.max(...rows.map((r) => r.dias)) : 0), [rows]);

  // Actualizar prev/current counts DESPUÉS del render para que el delta muestre la diferencia real
  useEffect(() => {
    const next: Counts = { total, asignados, pendientes, urgentes };
    setPrevCounts(currentCountsRef.current);
    currentCountsRef.current = next;
  }, [total, asignados, pendientes, urgentes]);

  const sinCuadrilla = useMemo(() => rows.filter((r) => !r.cuadrilla && r.estado_incidencia === 1), [rows]);
  const urgentesRows = useMemo(() => rows.filter((r) => r.dias >= 7).sort((a, b) => b.dias - a.dias), [rows]);

  const porNap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.nap || r.nap === "N.") continue;
      if (!r.problema?.toLowerCase().includes("sin servicio")) continue;
      map.set(r.nap, (map.get(r.nap) ?? 0) + 1);
    }
    return [...map.entries()].filter(([, c]) => c >= 2).map(([nap, cantidad]) => ({ nap, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }, [rows]);

  const demora = useMemo(() => {
    const con = rows.filter((r) => r.dias_hasta_asignacion !== null && r.dias_hasta_asignacion > 0);
    if (con.length === 0) return null;
    const prom = Math.round(con.reduce((a, r) => a + r.dias_hasta_asignacion!, 0) / con.length);
    const top5 = [...con].sort((a, b) => b.dias_hasta_asignacion! - a.dias_hasta_asignacion!).slice(0, 5);
    return { prom, top5 };
  }, [rows]);

  const prev = prevCounts;

  if (tvMode) {
    return <TVMode nombre={nombre} rows={rows} semana={semana} isRefreshing={isRefreshing}
      onExit={() => setTvMode(false)} onRefresh={() => fetchData(false)} lastUpdate={lastUpdate} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-lg">Cargando {nombre}…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          <button onClick={onBack} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition-colors mb-4">
            <ChevronLeft size={16} /> Volver al resumen
          </button>
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
            <AlertCircle size={16} /> {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              <ChevronLeft size={16} /> Volver al resumen
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Sucursal {nombre}</h2>
              {lastUpdate && (
                <p className="text-xs text-slate-500">
                  {isRefreshing ? <span className="animate-pulse">Actualizando…</span> : `Actualizado ${lastUpdate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchData(false)} disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-xs rounded-lg transition-colors disabled:opacity-40">
              <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} /> Actualizar
            </button>
            <button onClick={() => setTvMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-700 hover:border-indigo-600 bg-slate-800 hover:bg-indigo-950/40 text-slate-400 hover:text-indigo-300 text-xs rounded-lg transition-colors">
              <Maximize2 size={13} /> Pantalla completa
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-600 hover:text-slate-400 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Notificación de reclamo nuevo */}
        {nuevos.length > 0 && (
          <div className="flex items-center gap-3 bg-amber-950/50 border border-amber-700 rounded-xl px-4 py-3 text-sm">
            <Bell size={16} className="text-amber-400 flex-shrink-0" />
            <span className="text-amber-300 font-medium">{nuevos.length} reclamo{nuevos.length > 1 ? "s" : ""} nuevo{nuevos.length > 1 ? "s" : ""}:</span>
            <span className="text-slate-400 font-mono">{nuevos.join(", ")}</span>
            <button onClick={() => setNuevos([])} className="ml-auto text-amber-600 hover:text-amber-400">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Alerta urgente */}
        {urgentes > 0 && (
          <div className="bg-red-950/60 border border-red-700 rounded-2xl p-4">
            <p className="text-sm font-bold text-red-300 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} />
              {urgentes} reclamo{urgentes > 1 ? "s" : ""} con 7 o más días sin resolver
            </p>
            {urgentes <= 3 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-red-400/50 uppercase text-xs tracking-wider border-b border-red-900/50">
                      <th className="text-left py-1.5 px-3">Conexión</th>
                      <th className="text-left py-1.5 px-3">Problema</th>
                      <th className="text-left py-1.5 px-3">Cuadrilla</th>
                      <th className="text-left py-1.5 px-3">NAP</th>
                      <th className="text-left py-1.5 px-3">Desde</th>
                      <th className="text-right py-1.5 px-3">Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urgentesRows.map((r, i) => (
                      <tr key={i} className="border-b border-red-900/20 last:border-0">
                        <td className="py-2 px-3 font-mono text-slate-200">{r.conexion}</td>
                        <td className="py-2 px-3 text-slate-300 max-w-[200px] truncate">{r.problema ?? "—"}</td>
                        <td className="py-2 px-3 text-slate-400">{r.cuadrilla ?? <span className="text-amber-400">Sin asignar</span>}</td>
                        <td className="py-2 px-3 font-mono text-slate-400">{r.nap || "—"}</td>
                        <td className="py-2 px-3 text-slate-400">{r.fecha}</td>
                        <td className="py-2 px-3 text-right">{diasBadge(r.dias)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {urgentesRows.map((r, i) => (
                  <span key={i} className="flex items-center gap-1.5 bg-red-900/40 border border-red-800/40 rounded-lg px-2.5 py-1.5 text-xs">
                    <span className="font-mono font-semibold text-slate-200">{r.conexion}</span>
                    <span className="text-slate-400 max-w-[160px] truncate">{r.problema ?? "—"}</span>
                    {diasBadge(r.dias)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {total === 0 && !loading && (
          <div className="flex items-center gap-3 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl px-5 py-4">
            <CheckCircle2 size={22} className="text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-emerald-300 font-semibold text-sm">Todo al día</p>
              <p className="text-emerald-700 text-xs mt-0.5">No hay incidencias activas en {nombre}</p>
            </div>
          </div>
        )}

        <>
          {/* KPIs con deltas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total activos",  value: total,      color: "text-slate-100",   labelColor: "text-slate-400",   prevVal: prev?.total,      inverse: true },
                { label: "Asignados",      value: asignados,  color: "text-emerald-400", labelColor: "text-emerald-600", prevVal: prev?.asignados,  inverse: false, sub: `${pct(asignados, total)}% del total` },
                { label: "Pendientes",     value: pendientes, color: pendientes > 0 ? "text-amber-400" : "text-slate-500", labelColor: "text-amber-600", prevVal: prev?.pendientes, inverse: true },
                { label: "Urgentes +7d",   value: urgentes,   color: urgentes > 0 ? "text-red-400" : "text-slate-500", labelColor: urgentes > 0 ? "text-red-500" : "text-slate-500", prevVal: prev?.urgentes, inverse: true, alert: urgentes > 0 },
              ].map((k) => (
                <div key={k.label} className={`rounded-2xl p-5 text-center border ${k.alert && k.value > 0 ? "bg-red-950/30 border-red-700/40" : "bg-slate-800 border-slate-700"}`}>
                  <p className={`text-xs uppercase tracking-widest mb-2 ${k.labelColor}`}>{k.label}</p>
                  <p className={`text-4xl font-black ${k.color}`}>{k.value}</p>
                  <div className="flex items-center justify-center gap-2 mt-1 min-h-[20px]">
                    {k.sub && <p className="text-xs text-slate-500">{k.sub}</p>}
                    {k.prevVal !== undefined && <Delta prev={k.prevVal} curr={k.value} inverse={k.inverse} />}
                  </div>
                </div>
              ))}
            </div>

            {/* Mini estadísticas semanales */}
            {semanaLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-slate-800/50 border border-slate-700/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : semana && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                {/* 1. Cerrados esta semana */}
                <div className={`rounded-xl px-4 py-3 border ${semana.cerradosEstaSemana >= semana.cerradosSemanaAnterior ? "bg-emerald-950/30 border-emerald-800/40" : "bg-slate-800 border-slate-700"}`}>
                  <p className="text-[11px] text-emerald-600 uppercase tracking-wider leading-tight">Cerrados esta semana</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-0.5">{semana.cerradosEstaSemana}</p>
                  {semana.cerradosSemanaAnterior > 0 && (
                    <p className="text-[11px] text-slate-600 mt-0.5">ant. {semana.cerradosSemanaAnterior}</p>
                  )}
                </div>

                {/* 2. Nuevos esta semana */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                  <p className="text-[11px] text-sky-600 uppercase tracking-wider leading-tight">Nuevos esta semana</p>
                  <p className="text-2xl font-bold text-sky-400 mt-0.5">{semana.nuevosEstaSemana}</p>
                  {semana.nuevosSemanaAnterior > 0 && (
                    <p className="text-[11px] text-slate-600 mt-0.5">ant. {semana.nuevosSemanaAnterior}</p>
                  )}
                </div>

                {/* 3. Problema más frecuente */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider leading-tight">Problema frecuente</p>
                  {semana.problemaFrecuente ? (
                    <>
                      <p className="text-sm font-semibold text-slate-200 mt-0.5 leading-tight line-clamp-2">{semana.problemaFrecuente.problema}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">{semana.problemaFrecuente.cantidad} casos</p>
                    </>
                  ) : <p className="text-slate-500 text-sm mt-0.5">—</p>}
                </div>

                {/* 5. Reclamo más antiguo */}
                <div className={`rounded-xl px-4 py-3 border ${masAntiguo >= 7 ? "bg-red-950/30 border-red-800/40" : "bg-slate-800 border-slate-700"}`}>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider leading-tight">Más antiguo activo</p>
                  <p className={`text-2xl font-bold mt-0.5 ${masAntiguo >= 7 ? "text-red-400" : masAntiguo >= 3 ? "text-amber-400" : "text-slate-300"}`}>
                    {masAntiguo > 0 ? `${masAntiguo}d` : "—"}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">sin cerrar</p>
                </div>

              </div>
            )}

            {/* Tipos + Cuadrillas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Tipos de reclamo</h3>
                <div className="space-y-4">
                  {porProblema.map((p, i) => (
                    <HBar key={p.nombre} label={p.nombre} n={p.cantidad} max={maxProblema}
                      color={COLORES_PROBLEMA[i % COLORES_PROBLEMA.length]} />
                  ))}
                </div>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                  <Users size={15} className="text-cyan-400" /> Reclamos por cuadrilla
                  <span className="text-xs font-normal text-slate-500 ml-1">{porCuadrilla.length} activas</span>
                </h3>
                {porCuadrilla.length === 0 ? (
                  <p className="text-slate-500 text-sm">Sin cuadrillas asignadas</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {porCuadrilla.map((c) => (
                      <CuadrillaCard key={c.nombre} nombre={c.nombre} total={c.total}
                        problemas={c.problemas} totalGeneral={total}
                        promedioDias={semana?.cuadrillaPromedios?.[c.nombre] ?? null} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pendientes sin cuadrilla */}
            {sinCuadrilla.length > 0 && (
              <div className="bg-amber-950/30 border border-amber-700/50 rounded-2xl p-4">
                <p className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
                  <Clock size={14} />
                  {sinCuadrilla.length} reclamo{sinCuadrilla.length > 1 ? "s" : ""} pendiente{sinCuadrilla.length > 1 ? "s" : ""} sin cuadrilla asignada
                </p>
                <div className="flex flex-wrap gap-2">
                  {sinCuadrilla.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/30 border border-amber-800/40 rounded-lg">
                      <span className="font-mono text-sm text-slate-300">{r.conexion}</span>
                      <span className="text-xs text-slate-500 max-w-[140px] truncate">{r.problema ?? "Sin clasificar"}</span>
                      {diasBadge(r.dias)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Demora de asignación */}
            {demora && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                  <Clock size={15} className="text-violet-400" /> Demora de asignación
                  <span className="text-xs font-normal text-slate-500 ml-1">creación → cuadrilla, sólo abiertos</span>
                </h3>
                <div className="flex items-start gap-8">
                  <div className="text-center">
                    <p className="text-3xl font-black text-violet-400">{demora.prom}d</p>
                    <p className="text-xs text-slate-500 mt-1">promedio</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Mayor demora</p>
                    <div className="space-y-1.5">
                      {demora.top5.map((r, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <span className="font-mono text-slate-400 w-24 truncate">{r.conexion}</span>
                          <span className="text-slate-500 flex-1 truncate text-xs">{r.problema ?? "—"}</span>
                          {diasBadge(r.dias_hasta_asignacion!)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NAP sin servicio */}
            {porNap.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                  <Wifi size={15} className="text-indigo-400" /> Sin Servicio por NAP
                </h3>
                <p className="text-xs mb-4">
                  <span className="text-amber-400 font-semibold">{porNap.length} NAP{porNap.length > 1 ? "s" : ""}</span>
                  <span className="text-slate-500"> con 2 o más reclamos activos</span>
                </p>
                <div className="space-y-4">
                  {porNap.map((n, i) => (
                    <HBar key={n.nap} label={n.nap} n={n.cantidad} max={porNap[0].cantidad}
                      color={i < 3 ? "#f43f5e" : "#6366f1"} />
                  ))}
                </div>
              </div>
            )}
        </>
      </div>
    </div>
  );
}
