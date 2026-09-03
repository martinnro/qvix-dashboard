"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronDown, X, Loader2, AlertCircle, Tv, Tag, TrendingUp, List, HardHat, Search, Package } from "lucide-react";
import MaterialesView from "./MaterialesView";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const SUCURSALES: Record<number, string> = {
  0: "Central",
  1: "Chumbicha",
  3: "SonoVision",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ModeloRow  { modelo: string; tipo: string; cantidad: number }
interface MesRow     { mes: string;     cantidad: number }
interface SubtipoRow   { subtipo: string;   cantidad: number }
interface SucursalRow  { cod_sucursal: number; nombre: string; cantidad: number }
interface CuadrillaRow  { cuadrilla: string; cantidad: number; promedioDias: number | null }
interface PendienteRow  {
  sucursal: string; modelo: string; tipo: string; mac: string;
  id_conexion: number | null; fecha_reclamo: string; dias_demora: number;
  subtipo: string; cuadrilla: string | null;
}
interface FueraSlaRow {
  sucursal: string; modelo: string; tipo: string; mac: string;
  id_conexion: number | null; fecha_reclamo: string; fecha_solucion: string;
  dias_instalacion: number; subtipo: string; cuadrilla: string | null;
}
interface DetalleRow {
  sucursal: string; modelo: string; mac: string;
  id_conexion: number | null;
  fecha_reclamo: string; fecha_solucion: string;
  estado_servicio: string; subtipo: string;
  cuadrilla: string | null;
}
interface Data {
  total: number;
  porModelo:        ModeloRow[];
  porMes:           MesRow[];
  porSubtipo:       SubtipoRow[];
  porSucursal:      SucursalRow[];
  porCuadrilla:     CuadrillaRow[];
  pendientesTotal:  number;
  pendientesDetalle: PendienteRow[];
  detalle:          DetalleRow[];
  tiempoPromedioDias: number | null;
  pctDentroSla:     number;
  fueraSlaTotal:    number;
  fueraSlaDetalle:  FueraSlaRow[];
}

type PanelType = "modelo" | "subtipo" | "tendencia" | "cuadrilla" | "pendientes" | "detalle" | "fueraSla" | "materiales";

function hoy()      { return new Date().toISOString().slice(0, 10); }
function inicioAnio() { return `${new Date().getFullYear()}-01-01`; }
function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

type TendenciaRow = { mes: string; categoria: string; cantidad: number; tipo?: string };
type CriterioTendencia = "subtipo" | "cuadrilla" | "modelo";
const DIMENSIONES_FILTRO: { key: CriterioTendencia; label: string }[] = [
  { key: "subtipo",   label: "Subtipo" },
  { key: "cuadrilla", label: "Cuadrilla" },
  { key: "modelo",    label: "Modelo" },
];

// ── Pivotea filas (mes, categoria, cantidad) a formato de recharts apilado ────
function pivotTendencia(rows: TendenciaRow[], topN = 6) {
  const totales = new Map<string, number>();
  for (const r of rows) totales.set(r.categoria, (totales.get(r.categoria) ?? 0) + r.cantidad);
  const top = [...totales.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([c]) => c);
  const topSet = new Set(top);

  const meses = [...new Set(rows.map((r) => r.mes))].sort();
  const chartData: Record<string, string | number>[] = meses.map((mes) => ({ mes }));
  const idxByMes = new Map(meses.map((mes, i) => [mes, i]));

  let hasOtros = false;
  for (const r of rows) {
    const idx = idxByMes.get(r.mes);
    if (idx === undefined) continue;
    const key = topSet.has(r.categoria) ? r.categoria : "Otros";
    if (key === "Otros") hasOtros = true;
    chartData[idx][key] = (Number(chartData[idx][key]) || 0) + r.cantidad;
  }

  return { chartData, categorias: hasOtros ? [...top, "Otros"] : top };
}

// ── Suma cantidades por categoría, ignorando el mes (para listas de opciones) ──
function totalesPorCategoria(rows: TendenciaRow[]): { nombre: string; cantidad: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.categoria, (map.get(r.categoria) ?? 0) + r.cantidad);
  return [...map.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}

// ── Pivotea filas a formato de recharts apilado, solo para las categorías dadas ──
function pivotFiltrado(rows: TendenciaRow[], categorias: string[]) {
  const catSet = new Set(categorias);
  const meses = [...new Set(rows.map((r) => r.mes))].sort();
  const chartData: Record<string, string | number>[] = meses.map((mes) => ({ mes }));
  const idxByMes = new Map(meses.map((mes, i) => [mes, i]));

  for (const r of rows) {
    if (!catSet.has(r.categoria)) continue;
    const idx = idxByMes.get(r.mes);
    if (idx === undefined) continue;
    chartData[idx][r.categoria] = (Number(chartData[idx][r.categoria]) || 0) + r.cantidad;
  }

  return chartData;
}

// ── Barra de porcentaje (igual que Reclamos) ───────────────────────────────────
function BarRow({ label, cantidad, total, color }: { label: string; cantidad: number; total: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-300 truncate flex-1 pr-3">{label}</span>
        <span className="text-xs font-semibold text-slate-100 flex-shrink-0">
          {cantidad} <span className="text-slate-500 font-normal">({pct(cantidad, total)}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct(cantidad, total)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Tile de KPI compacto ────────────────────────────────────────────────────
function StatTile({ label, value, sublabel, color, onClick, tooltip }: {
  label: string; value: string | number; sublabel?: string; color: string; onClick?: () => void; tooltip?: React.ReactNode;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <div className="relative group">
      <Comp
        onClick={onClick}
        className={`bg-slate-800 border border-slate-700 rounded-xl p-4 text-left w-full ${onClick ? "hover:border-slate-500 transition-colors cursor-pointer" : ""}`}
      >
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 truncate">{label}</p>
        <div className="text-2xl font-bold" style={{ color }}>{value}</div>
        {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
      </Comp>
      {tooltip && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] w-56 opacity-0 group-hover:opacity-100 transition-opacity z-30 bg-slate-900 border border-slate-600 rounded-lg p-3 shadow-xl">
          {tooltip}
        </div>
      )}
    </div>
  );
}

// ── Fila de ranking (sucursal / cuadrilla) ─────────────────────────────────────
function RankRow({ label, cantidad, max, color, sublabel }: {
  label: string; cantidad: number; max: number; color: string; sublabel?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-300 truncate flex-1 pr-3">{label}</span>
        <span className="text-xs font-semibold text-slate-100 flex-shrink-0">
          {cantidad}{sublabel && <span className="text-slate-500 font-normal ml-1.5">{sublabel}</span>}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct(cantidad, max)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Tarjeta de navegación (igual que Reclamos) ─────────────────────────────────
function NavCard({ icon: Icon, titulo, subtitulo, color, onClick }: {
  icon: React.ElementType; titulo: string; subtitulo: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-2xl p-5 text-left transition-all w-full"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "22" }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-100 font-semibold text-sm">{titulo}</p>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{subtitulo}</p>
      </div>
    </button>
  );
}

const COLORS = ["#06b6d4","#a855f7","#f59e0b","#10b981","#f43f5e","#3b82f6","#ec4899","#84cc16"];

// ── Combobox multi-select para filtrar por dimensión (subtipo/cuadrilla/modelo) ──
function FiltroCombobox({
  dimensiones, activo, onCambiarDimension, opciones, seleccionados, onToggle, onLimpiar, onLimpiarTodo, grupoDe, ordenGrupos,
}: {
  dimensiones: { key: CriterioTendencia; label: string; count: number }[];
  activo: CriterioTendencia;
  onCambiarDimension: (dim: CriterioTendencia) => void;
  opciones: { nombre: string; cantidad: number }[];
  seleccionados: Set<string>;
  onToggle: (nombre: string) => void;
  onLimpiar: () => void;
  onLimpiarTodo: () => void;
  grupoDe?: (nombre: string) => string;
  ordenGrupos?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activoLabel = dimensiones.find((d) => d.key === activo)?.label ?? "";
  const totalSeleccionado = dimensiones.reduce((s, d) => s + d.count, 0);
  const colorPorNombre = new Map(opciones.map((o, i) => [o.nombre, COLORS[i % COLORS.length]]));
  const opcionesFiltradas = opciones.filter((o) => o.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  const grupos: { label: string; items: typeof opcionesFiltradas }[] = (() => {
    if (!grupoDe) return [{ label: "", items: opcionesFiltradas }];
    const porGrupo = new Map<string, typeof opcionesFiltradas>();
    for (const o of opcionesFiltradas) {
      const g = grupoDe(o.nombre);
      if (!porGrupo.has(g)) porGrupo.set(g, []);
      porGrupo.get(g)!.push(o);
    }
    const etiquetas = ordenGrupos
      ? [...ordenGrupos.filter((l) => porGrupo.has(l)), ...[...porGrupo.keys()].filter((l) => !ordenGrupos.includes(l))]
      : [...porGrupo.keys()];
    return etiquetas.map((label) => ({ label, items: porGrupo.get(label)! }));
  })();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((v) => !v); setBusqueda(""); }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          totalSeleccionado > 0
            ? "bg-amber-600/15 border-amber-600 text-amber-300"
            : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
        }`}
      >
        {totalSeleccionado > 0 ? `Filtros: ${totalSeleccionado} seleccionados` : "Filtrar por…"}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          <div className="flex border-b border-slate-700">
            {dimensiones.map((d) => (
              <button
                key={d.key}
                onClick={() => { onCambiarDimension(d.key); setBusqueda(""); }}
                className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                  activo === d.key ? "text-amber-400 bg-slate-700/50" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {d.label}{d.count > 0 ? ` (${d.count})` : ""}
              </button>
            ))}
          </div>

          {opciones.length > 6 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
              <Search size={13} className="text-slate-500 flex-shrink-0" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar ${activoLabel.toLowerCase()}…`}
                className="bg-transparent text-xs text-slate-200 placeholder:text-slate-500 outline-none w-full"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {grupos.map((g) => {
              const grupoCompleto = g.items.length > 0 && g.items.every((o) => seleccionados.has(o.nombre));
              return (
              <div key={g.label || "_"}>
                {g.items.length > 0 && (
                  <div className="flex items-center justify-between px-3 pt-2 pb-1">
                    {g.label ? (
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{g.label}</p>
                    ) : <span />}
                    <button
                      onClick={() => {
                        g.items.forEach((o) => {
                          const marcado = seleccionados.has(o.nombre);
                          if (grupoCompleto || !marcado) onToggle(o.nombre);
                        });
                      }}
                      className="text-[10px] font-medium text-slate-500 hover:text-amber-400 transition-colors"
                    >
                      {grupoCompleto ? "Ninguno" : "Todos"}
                    </button>
                  </div>
                )}
                {g.items.map((o) => {
                  const checked = seleccionados.has(o.nombre);
                  return (
                    <button
                      key={o.nombre}
                      onClick={() => onToggle(o.nombre)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-slate-700/50 transition-colors"
                    >
                      <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${checked ? "bg-amber-600 border-amber-500" : "border-slate-600"}`}>
                        {checked && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
                      </span>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorPorNombre.get(o.nombre) }} />
                      <span className="flex-1 text-slate-200 truncate">{o.nombre}</span>
                      <span className="text-slate-500">{o.cantidad}</span>
                    </button>
                  );
                })}
              </div>
              );
            })}
            {opcionesFiltradas.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-3">Sin resultados</p>
            )}
          </div>

          {(seleccionados.size > 0 || totalSeleccionado > seleccionados.size) && (
            <div className="flex items-center justify-between border-t border-slate-700 px-3 py-2">
              {seleccionados.size > 0 ? (
                <button onClick={onLimpiar} className="text-xs text-slate-400 hover:text-amber-400 transition-colors">
                  Limpiar {activoLabel.toLowerCase()}
                </button>
              ) : <span />}
              {totalSeleccionado > seleccionados.size && (
                <button onClick={onLimpiarTodo} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
                  Limpiar todo
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function InstalacionesView({
  onClose,
  sucursalesPermitidas,
}: {
  onClose: () => void;
  sucursalesPermitidas: number[] | null;
}) {
  const [desde,    setDesde]    = useState(inicioAnio);
  const [hasta,    setHasta]    = useState(hoy);
  const [data,     setData]     = useState<Data | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [panel,    setPanel]    = useState<PanelType | null>(null);
  const [sucSel,   setSucSel]   = useState<number | null>(null);
  const [tendenciaDim, setTendenciaDim] = useState<"total" | "subtipo" | "cuadrilla" | "modelo">("total");
  const [tendenciaRows, setTendenciaRows] = useState<TendenciaRow[] | null>(null);
  const [tendenciaLoading, setTendenciaLoading] = useState(false);
  const [criterioTendencia, setCriterioTendencia] = useState<CriterioTendencia>("subtipo");
  const [filtros, setFiltros] = useState<Record<CriterioTendencia, Set<string>>>({
    subtipo: new Set(), cuadrilla: new Set(), modelo: new Set(),
  });
  const [rowsPorDim, setRowsPorDim] = useState<Record<CriterioTendencia, TendenciaRow[] | null>>({
    subtipo: null, cuadrilla: null, modelo: null,
  });

  const fetchData = useCallback(async (suc: number | null = null) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ desde, hasta });
    if (suc !== null) params.set("sucursal", String(suc));
    DIMENSIONES_FILTRO.forEach(({ key }) => {
      filtros[key].forEach((v) => params.append(`filtro_${key}`, v));
    });
    try {
      const res = await fetch(`/api/instalaciones?${params}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, filtros]);

  useEffect(() => { fetchData(sucSel); }, [fetchData, sucSel]);

  useEffect(() => {
    if (panel !== "tendencia" || tendenciaDim === "total") { setTendenciaRows(null); return; }
    let cancelled = false;
    setTendenciaLoading(true);
    const params = new URLSearchParams({ desde, hasta, dimension: tendenciaDim });
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    fetch(`/api/instalaciones/tendencia?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => { if (!cancelled) setTendenciaRows(json.rows); })
      .catch(() => { if (!cancelled) setTendenciaRows([]); })
      .finally(() => { if (!cancelled) setTendenciaLoading(false); });
    return () => { cancelled = true; };
  }, [panel, tendenciaDim, desde, hasta, sucSel]);

  // Trae el desglose mensual de las 3 dimensiones filtrables (para los combos y el stack), respetando los OTROS filtros activos
  useEffect(() => {
    const flags = DIMENSIONES_FILTRO.map(() => ({ cancelled: false }));
    DIMENSIONES_FILTRO.forEach(({ key }, i) => {
      const params = new URLSearchParams({ desde, hasta, dimension: key });
      if (sucSel !== null) params.set("sucursal", String(sucSel));
      DIMENSIONES_FILTRO.forEach(({ key: otraKey }) => {
        filtros[otraKey].forEach((v) => params.append(`filtro_${otraKey}`, v));
      });
      fetch(`/api/instalaciones/tendencia?${params}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((json) => { if (!flags[i].cancelled) setRowsPorDim((prev) => ({ ...prev, [key]: json.rows })); })
        .catch(() => { if (!flags[i].cancelled) setRowsPorDim((prev) => ({ ...prev, [key]: [] })); });
    });
    return () => { flags.forEach((f) => { f.cancelled = true; }); };
  }, [desde, hasta, sucSel, filtros]);

  const SUCURSALES_OCULTAS = [0, 3];
  const sucursalesDisponibles: number[] = (sucursalesPermitidas ?? Object.keys(SUCURSALES).map(Number))
    .filter(cod => !SUCURSALES_OCULTAS.includes(cod));

  // ── Header compartido ──────────────────────────────────────────────────────
  const Header = ({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) => (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        {panel && (
          <button
            onClick={() => setPanel(null)}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mb-3"
          >
            <ChevronLeft size={15} /> Volver al resumen
          </button>
        )}
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Tv size={20} className="text-amber-400" /> {titulo}
        </h2>
        {subtitulo && <p className="text-sm text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
      <div className="flex items-center gap-3">
        {loading && data && (
          <span className="flex items-center gap-1.5 text-slate-500 text-xs">
            <Loader2 size={13} className="animate-spin" /> Actualizando…
          </span>
        )}
        {!loading && error && data && (
          <span className="flex items-center gap-1.5 text-red-400 text-xs">
            <AlertCircle size={13} /> {error}
          </span>
        )}
        {!panel && (
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <X size={15} /> Cerrar
          </button>
        )}
      </div>
    </div>
  );

  // ── Loading / Error ────────────────────────────────────────────────────────
  if (!data && (loading || error)) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Instalaciones Realizadas" />
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Cargando instalaciones…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const total      = data.total;
  const totalOnts       = data.porModelo.filter(r => r.tipo === 'B').reduce((s, r) => s + r.cantidad, 0);
  const totalDecos      = data.porModelo.filter(r => r.tipo === 'T' || r.tipo === 'M').reduce((s, r) => s + r.cantidad, 0);
  const pendientesOnts  = data.pendientesDetalle.filter(r => r.tipo === 'B').length;
  const pendientesDecos = data.pendientesDetalle.filter(r => r.tipo === 'T' || r.tipo === 'M').length;
  const modeloTipoMap = new Map((rowsPorDim.modelo ?? []).map((r) => [r.categoria, r.tipo]));
  const grupoModelo = (nombre: string) => {
    const tipo = modeloTipoMap.get(nombre);
    return tipo === "B" ? "ONTs" : tipo === "T" || tipo === "M" ? "Decos / STB" : "Otros";
  };
  // Solo tiene sentido apilar la dimensión que tiene 2+ categorías elegidas (una sola categoría no genera stack).
  // Si hay más de una dimensión con selección múltiple a la vez, es ambiguo qué apilar y se muestra el total.
  const dimsMultiples = DIMENSIONES_FILTRO.filter((d) => filtros[d.key].size > 1).map((d) => d.key);
  const dimStackeable = dimsMultiples.length === 1 ? dimsMultiples[0] : null;

  // ── Sub-panel: Por Modelo ──────────────────────────────────────────────────
  if (panel === "modelo") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Por modelo de dispositivo" subtitulo={`${total} instalaciones`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {data.porModelo.map((r, i) => (
              <BarRow key={r.modelo} label={r.modelo} cantidad={r.cantidad} total={total} color={COLORS[i % COLORS.length]} />
            ))}
            {data.porModelo.length === 0 && <p className="text-slate-500 text-sm">Sin datos</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Por Subtipo ─────────────────────────────────────────────────
  if (panel === "subtipo") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Por tipo de instalación" subtitulo={`${total} instalaciones`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {data.porSubtipo.map((r, i) => (
              <BarRow key={r.subtipo} label={r.subtipo} cantidad={r.cantidad} total={total} color={COLORS[i % COLORS.length]} />
            ))}
            {data.porSubtipo.length === 0 && <p className="text-slate-500 text-sm">Sin datos</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Tendencia Mensual ───────────────────────────────────────────
  if (panel === "tendencia") {
    const dimLabels: Record<typeof tendenciaDim, string> = {
      total: "Total", subtipo: "Por subtipo", cuadrilla: "Por cuadrilla", modelo: "Por modelo",
    };
    const pivot = tendenciaDim !== "total" && tendenciaRows ? pivotTendencia(tendenciaRows) : null;
    const chartData = (tendenciaDim === "total" ? data.porMes : (pivot?.chartData ?? [])) as unknown as Record<string, string | number>[];

    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Tendencia mensual" subtitulo={`${total} instalaciones en el período`} />

          <div className="flex flex-wrap gap-2">
            {(Object.keys(dimLabels) as (keyof typeof dimLabels)[]).map((dim) => (
              <button
                key={dim}
                onClick={() => setTendenciaDim(dim)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  tendenciaDim === dim
                    ? "bg-amber-600 border-amber-500 text-white"
                    : "border-slate-600 text-slate-400 hover:border-amber-500 hover:text-amber-300"
                }`}
              >
                {dimLabels[dim]}
              </button>
            ))}
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
            {tendenciaDim !== "total" && tendenciaLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                <Loader2 size={14} className="animate-spin" /> Cargando desglose…
              </div>
            )}
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }} labelStyle={{ color: "#e2e8f0" }} />
                {tendenciaDim === "total" ? (
                  <Bar dataKey="cantidad" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                ) : (
                  <>
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    {(pivot?.categorias ?? []).map((cat, i) => (
                      <Bar key={cat} dataKey={cat} stackId="tendencia" fill={cat === "Otros" ? "#475569" : COLORS[i % COLORS.length]} />
                    ))}
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
            {tendenciaDim !== "total" && pivot?.chartData.length === 0 && !tendenciaLoading && (
              <p className="text-slate-500 text-sm text-center mt-2">Sin datos para este desglose</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Pendientes ─────────────────────────────────────────────────
  if (panel === "pendientes") {
    const pend = data.pendientesDetalle;
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Instalaciones pendientes" subtitulo={`${data.pendientesTotal} sin fecha de solución`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <th className="text-left py-2 px-3">Sucursal</th>
                    <th className="text-left py-2 px-3">Tipo Instalación</th>
                    <th className="text-left py-2 px-3">ID Conexión</th>
                    <th className="text-left py-2 px-3">Modelo</th>
                    <th className="text-left py-2 px-3">MAC</th>
                    <th className="text-left py-2 px-3">Cuadrilla</th>
                    <th className="text-left py-2 px-3">F. Reclamo</th>
                    <th className="text-right py-2 px-3">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {pend.map((r, i) => {
                    const d = r.dias_demora;
                    const chip = d >= 7
                      ? "bg-red-500/20 text-red-400"
                      : d >= 3
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-emerald-500/20 text-emerald-400";
                    return (
                    <tr key={i} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300">{r.sucursal}</td>
                      <td className="py-2 px-3 text-slate-400">{r.subtipo}</td>
                      <td className="py-2 px-3 text-slate-400">{r.id_conexion ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-300">{r.modelo}</td>
                      <td className="py-2 px-3 font-mono text-slate-400">{r.mac}</td>
                      <td className="py-2 px-3 text-slate-400">{r.cuadrilla ?? <span className="text-slate-600">Sin asignar</span>}</td>
                      <td className="py-2 px-3 text-slate-400">{r.fecha_reclamo}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-semibold text-xs ${chip}`}>{d}d</span>
                      </td>
                    </tr>
                    );
                  })}
                  {pend.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-slate-500">Sin instalaciones pendientes</td></tr>
                  )}
                </tbody>
              </table>
              {pend.length >= 500 && (
                <p className="text-xs text-slate-500 mt-3 text-center">Mostrando 500 registros</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Fuera de SLA (> 3 días entre reclamo y solución) ────────────
  if (panel === "fueraSla") {
    const fs = data.fueraSlaDetalle;
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Instalaciones fuera de SLA" subtitulo={`${data.fueraSlaTotal} tardaron más de 3 días entre reclamo y solución`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <th className="text-left py-2 px-3">Sucursal</th>
                    <th className="text-left py-2 px-3">Tipo Instalación</th>
                    <th className="text-left py-2 px-3">ID Conexión</th>
                    <th className="text-left py-2 px-3">Modelo</th>
                    <th className="text-left py-2 px-3">MAC</th>
                    <th className="text-left py-2 px-3">Cuadrilla</th>
                    <th className="text-left py-2 px-3">F. Reclamo</th>
                    <th className="text-left py-2 px-3">F. Solución</th>
                    <th className="text-right py-2 px-3">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {fs.map((r, i) => {
                    const d = r.dias_instalacion;
                    const chip = d >= 7
                      ? "bg-red-500/20 text-red-400"
                      : "bg-amber-500/20 text-amber-400";
                    return (
                    <tr key={i} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300">{r.sucursal}</td>
                      <td className="py-2 px-3 text-slate-400">{r.subtipo}</td>
                      <td className="py-2 px-3 text-slate-400">{r.id_conexion ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-300">{r.modelo}</td>
                      <td className="py-2 px-3 font-mono text-slate-400">{r.mac}</td>
                      <td className="py-2 px-3 text-slate-400">{r.cuadrilla ?? <span className="text-slate-600">Sin asignar</span>}</td>
                      <td className="py-2 px-3 text-slate-400">{r.fecha_reclamo}</td>
                      <td className="py-2 px-3 text-slate-300">{r.fecha_solucion}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-semibold text-xs ${chip}`}>{d}d</span>
                      </td>
                    </tr>
                    );
                  })}
                  {fs.length === 0 && (
                    <tr><td colSpan={9} className="py-6 text-center text-slate-500">Todas las instalaciones se completaron dentro del plazo</td></tr>
                  )}
                </tbody>
              </table>
              {fs.length >= 500 && (
                <p className="text-xs text-slate-500 mt-3 text-center">Mostrando 500 registros</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Por Cuadrilla ───────────────────────────────────────────────
  if (panel === "cuadrilla") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Por cuadrilla" subtitulo={`${total} instalaciones`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {data.porCuadrilla.map((r, i) => (
              <BarRow key={r.cuadrilla} label={r.cuadrilla} cantidad={r.cantidad} total={total} color={COLORS[i % COLORS.length]} />
            ))}
            {data.porCuadrilla.length === 0 && <p className="text-slate-500 text-sm">Sin datos de cuadrilla</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Detalle completo ────────────────────────────────────────────
  if (panel === "detalle") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Detalle completo" subtitulo={`${data.detalle.length} registros`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <th className="text-left py-2 px-3">Sucursal</th>
                    <th className="text-left py-2 px-3">Modelo</th>
                    <th className="text-left py-2 px-3">MAC</th>
                    <th className="text-left py-2 px-3">ID Conexión</th>
                    <th className="text-left py-2 px-3">F. Reclamo</th>
                    <th className="text-left py-2 px-3">F. Solución</th>
                    <th className="text-left py-2 px-3">Cuadrilla</th>
                    <th className="text-left py-2 px-3">Estado</th>
                    <th className="text-left py-2 px-3">Subtipo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detalle.map((r, i) => (
                    <tr key={i} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300">{r.sucursal}</td>
                      <td className="py-2 px-3 text-slate-300">{r.modelo}</td>
                      <td className="py-2 px-3 font-mono text-slate-400">{r.mac}</td>
                      <td className="py-2 px-3 text-slate-400">{r.id_conexion ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-400">{r.fecha_reclamo}</td>
                      <td className="py-2 px-3 text-slate-300">{r.fecha_solucion}</td>
                      <td className="py-2 px-3 text-slate-400">{r.cuadrilla ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-400">{r.estado_servicio}</td>
                      <td className="py-2 px-3 text-slate-400">{r.subtipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.detalle.length >= 500 && (
                <p className="text-xs text-slate-500 mt-3 text-center">
                  Mostrando 500 registros — filtrá por sucursal para acotar
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Materiales ─────────────────────────────────────────────────
  if (panel === "materiales") {
    return <MaterialesView onBack={() => setPanel(null)} tipo="instalaciones" />;
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        <Header
          titulo="Instalaciones Realizadas"
          subtitulo={`${total} dispositivos instalados en el período`}
        />

        {/* Filtros de fecha */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Desde</label>
            <input
              type="date" value={desde} max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Hasta</label>
            <input
              type="date" value={hasta} min={desde} max={hoy()}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
            />
          </div>
          <button
            onClick={() => fetchData(sucSel)}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded transition-colors"
          >
            Actualizar
          </button>
        </div>

        {/* Pills de sucursal */}
        {sucursalesDisponibles.length > 1 && (
          <section>
            <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-2">
              Filtrar por sucursal
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSucSel(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  sucSel === null
                    ? "bg-amber-600 border-amber-500 text-white"
                    : "border-slate-600 text-slate-400 hover:border-amber-500 hover:text-amber-300"
                }`}
              >
                Todas
              </button>
              {sucursalesDisponibles.map((cod) => {
                const sRow = data.porSucursal.find((s) => s.cod_sucursal === cod);
                const activo = sucSel === cod;
                return (
                  <button
                    key={cod}
                    onClick={() => setSucSel(activo ? null : cod)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      activo
                        ? "bg-amber-600 border-amber-500 text-white"
                        : sRow
                        ? "border-slate-600 text-slate-300 hover:border-amber-500 hover:text-amber-300"
                        : "border-slate-700 text-slate-600"
                    }`}
                  >
                    {SUCURSALES[cod] ?? `Suc. ${cod}`}
                    {sRow && <span className="ml-1 opacity-70">{sRow.cantidad}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Filtro por subtipo / cuadrilla / modelo — actualiza todo el dashboard */}
        <section>
          <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-2">Filtrar por</h3>

          <FiltroCombobox
            dimensiones={DIMENSIONES_FILTRO.map((d) => ({ ...d, count: filtros[d.key].size }))}
            activo={criterioTendencia}
            onCambiarDimension={setCriterioTendencia}
            opciones={totalesPorCategoria(rowsPorDim[criterioTendencia] ?? [])}
            seleccionados={filtros[criterioTendencia]}
            onToggle={(nombre) => setFiltros((prev) => {
              const next = new Set(prev[criterioTendencia]);
              if (next.has(nombre)) next.delete(nombre); else next.add(nombre);
              return { ...prev, [criterioTendencia]: next };
            })}
            onLimpiar={() => setFiltros((prev) => ({ ...prev, [criterioTendencia]: new Set() }))}
            onLimpiarTodo={() => setFiltros({ subtipo: new Set(), cuadrilla: new Set(), modelo: new Set() })}
            grupoDe={criterioTendencia === "modelo" ? grupoModelo : undefined}
            ordenGrupos={criterioTendencia === "modelo" ? ["ONTs", "Decos / STB"] : undefined}
          />

          {DIMENSIONES_FILTRO.some((d) => filtros[d.key].size > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {DIMENSIONES_FILTRO.flatMap((d) =>
                [...filtros[d.key]].map((nombre) => (
                  <span key={`${d.key}-${nombre}`} className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300">
                    <span className="text-slate-500">{d.label}:</span> {nombre}
                    <button
                      onClick={() => setFiltros((prev) => {
                        const next = new Set(prev[d.key]);
                        next.delete(nombre);
                        return { ...prev, [d.key]: next };
                      })}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              )}
            </div>
          )}
        </section>

        {/* Fila 1 — KPIs compactos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile
            label="Instalaciones realizadas"
            value={total}
            sublabel={`${totalOnts} ONT · ${totalDecos} Deco`}
            color="#f8fafc"
          />
          <StatTile
            label="Pendientes ↗"
            value={data.pendientesTotal}
            sublabel={`${pendientesOnts} ONT · ${pendientesDecos} Deco`}
            color="#f59e0b"
            onClick={() => setPanel("pendientes")}
          />
          <StatTile
            label="Tiempo promedio"
            value={data.tiempoPromedioDias != null ? `${data.tiempoPromedioDias}d` : "—"}
            sublabel="reclamo → solución"
            color="#22d3ee"
          />
          <StatTile
            label="Instaladas en ≤ 3 días ↗"
            value={`${data.pctDentroSla}%`}
            sublabel={`${data.fueraSlaTotal} fuera de plazo`}
            color={data.pctDentroSla >= 80 ? "#10b981" : data.pctDentroSla >= 50 ? "#f59e0b" : "#f43f5e"}
            onClick={() => setPanel("fueraSla")}
            tooltip={
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-slate-200 mb-1.5">Referencia (reclamo → solución)</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400" />
                  <span className="text-emerald-300 font-medium">Correcto</span>
                  <span className="text-slate-400 ml-auto">hasta 3 días</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400" />
                  <span className="text-amber-300 font-medium">Alerta</span>
                  <span className="text-slate-400 ml-auto">4 a 6 días</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-400" />
                  <span className="text-red-300 font-medium">Crítico</span>
                  <span className="text-slate-400 ml-auto">7 días o más</span>
                </div>
              </div>
            }
          />
        </div>

        {/* Fila 2 — Tendencia mensual, ancho completo; apila los filtros seleccionados */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-slate-300 font-medium text-sm">Tendencia mensual</h3>
            <button onClick={() => setPanel("tendencia")} className="text-xs text-slate-500 hover:text-amber-400 transition-colors">Ver más ↗</button>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            {!dimStackeable ? (
              <BarChart data={data.porMes} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }}
                  labelStyle={{ color: "#e2e8f0" }}
                  itemStyle={{ color: "#f59e0b" }}
                />
                <Bar dataKey="cantidad" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={pivotFiltrado(rowsPorDim[dimStackeable] ?? [], [...filtros[dimStackeable]]) as unknown as Record<string, string | number>[]} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }} labelStyle={{ color: "#e2e8f0" }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                {totalesPorCategoria(rowsPorDim[dimStackeable] ?? [])
                  .map((r, i) => ({ nombre: r.nombre, color: COLORS[i % COLORS.length] }))
                  .filter((r) => filtros[dimStackeable].has(r.nombre))
                  .map((r) => (
                    <Bar key={r.nombre} dataKey={r.nombre} stackId="criterio" fill={r.color} />
                  ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Fila 3 — Por tipo, sucursales y cuadrillas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-300 font-medium text-sm">Por tipo de instalación</h3>
              <button onClick={() => setPanel("subtipo")} className="text-xs text-slate-500 hover:text-amber-400 transition-colors">Ver más ↗</button>
            </div>
            <div className="w-full h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.porSubtipo.map(r => ({ name: r.subtipo, value: r.cantidad }))}
                    cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {data.porSubtipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }} itemStyle={{ color: "#e2e8f0" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5 mt-2">
              {data.porSubtipo.slice(0, 5).map((r, i) => (
                <li key={r.subtipo} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 text-slate-300 truncate">{r.subtipo}</span>
                  <span className="text-slate-100 font-semibold flex-shrink-0">{r.cantidad}</span>
                </li>
              ))}
            </ul>
          </div>

          {data.porSucursal.length > 1 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="text-slate-300 font-medium text-sm">Por sucursal</h3>
              {data.porSucursal.map((s) => (
                <div key={s.cod_sucursal} className="cursor-pointer" onClick={() => setSucSel(sucSel === s.cod_sucursal ? null : s.cod_sucursal)}>
                  <RankRow label={s.nombre} cantidad={s.cantidad} max={data.porSucursal[0].cantidad} color="#f59e0b" sublabel={`${pct(s.cantidad, total)}%`} />
                </div>
              ))}
            </div>
          )}

          {data.porCuadrilla.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-slate-300 font-medium text-sm">Top cuadrillas</h3>
                {data.porCuadrilla.length > 5 && (
                  <button onClick={() => setPanel("cuadrilla")} className="text-xs text-slate-500 hover:text-amber-400 transition-colors">Ver todas ↗</button>
                )}
              </div>
              {data.porCuadrilla.slice(0, 5).map((c) => {
                const color = c.promedioDias == null ? "#64748b" : c.promedioDias <= 3 ? "#10b981" : c.promedioDias <= 7 ? "#f59e0b" : "#f43f5e";
                return (
                  <RankRow
                    key={c.cuadrilla}
                    label={c.cuadrilla}
                    cantidad={c.cantidad}
                    max={data.porCuadrilla[0].cantidad}
                    color={color}
                    sublabel={c.promedioDias != null ? `${c.promedioDias}d prom.` : "sin fecha"}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* NavCards */}
        <div>
          <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-3">Ver detalle por</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <NavCard icon={Tv}        titulo="Por modelo"    subtitulo="Dispositivos más instalados"       color="#06b6d4" onClick={() => setPanel("modelo")}    />
            <NavCard icon={Tag}       titulo="Por subtipo"   subtitulo="Tipo de instalación realizada"     color="#a855f7" onClick={() => setPanel("subtipo")}   />
            <NavCard icon={HardHat}   titulo="Por cuadrilla" subtitulo="Cuadrillas que más instalaron"     color="#f43f5e" onClick={() => setPanel("cuadrilla")} />
            <NavCard icon={TrendingUp} titulo="Tendencia"    subtitulo="Evolución mensual"                 color="#f59e0b" onClick={() => setPanel("tendencia")} />
            <NavCard icon={List}      titulo="Detalle"       subtitulo="Listado completo de registros"     color="#10b981" onClick={() => setPanel("detalle")}   />
            <NavCard icon={Package}   titulo="Materiales"    subtitulo="Materiales usados en instalaciones" color="#e879f9" onClick={() => setPanel("materiales")} />
          </div>
        </div>

      </div>
    </div>
  );
}
