"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, ChevronLeft, History, ChevronsUpDown, ChevronUp, ChevronDown, Package, BarChart2, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";

type SortCol = "conexion" | "dias" | "fecha_carga" | "estado_incidencia";
type SortDir = "asc" | "desc";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha", 4: "Valle Viejo",
  5: "Tinogasta", 6: "Rodeo", 7: "La Puerta", 8: "Fiambalá",
};

function estadoBadge(estado: number, fechaAnulacion: string | null = null) {
  if (estado === 1) return <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs">Pendiente</span>;
  if (estado === 2) return <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">Asignado</span>;
  if (fechaAnulacion) return <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs">Anulado</span>;
  return <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 text-xs">Cerrado</span>;
}

interface RowData {
  conexion: string;
  cod_sucursal: number;
  estado_incidencia: number;
  fecha_carga: string;
  fecha_solucion: string | null;
  fecha_anulacion: string | null;
  dias: number;
  mes_anio: string;
  problema: string | null;
  cuadrilla: string | null;
}

interface Filters {
  sucursal: string;
  anio: string;
  mesAnio: string;
  estado: string;
  durMin: string;
  durMax: string;
}

function buildUrl(filters: Filters, offset: number, all = false) {
  const p = new URLSearchParams();
  if (filters.sucursal) p.set("sucursal", filters.sucursal);
  if (filters.mesAnio) p.set("mes_anio", filters.mesAnio);
  else if (filters.anio) p.set("anio", filters.anio);
  if (filters.estado) p.set("estado", filters.estado);
  if (filters.durMin) p.set("dur_min", filters.durMin);
  if (filters.durMax) p.set("dur_max", filters.durMax);
  p.set("offset", String(offset));
  if (all) p.set("limit", "all");
  return `/api/incidencias-historial?${p.toString()}`;
}

const MESES = [
  { value: "01", label: "Ene" }, { value: "02", label: "Feb" }, { value: "03", label: "Mar" },
  { value: "04", label: "Abr" }, { value: "05", label: "May" }, { value: "06", label: "Jun" },
  { value: "07", label: "Jul" }, { value: "08", label: "Ago" }, { value: "09", label: "Sep" },
  { value: "10", label: "Oct" }, { value: "11", label: "Nov" }, { value: "12", label: "Dic" },
];

function prevMesAnioStr(f: Filters): string {
  let base: string;
  if (f.mesAnio) {
    base = f.mesAnio;
  } else {
    const now = new Date();
    base = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  const [y, m] = base.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

function buildPrevMatParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.sucursal) p.set("sucursal", f.sucursal);
  p.set("mes_anio", prevMesAnioStr(f));
  return p;
}

function prevLabel(f: Filters): string {
  const pm = prevMesAnioStr(f);
  const m = MESES.find(x => pm.endsWith(`-${x.value}`));
  return `${m?.label ?? pm.slice(5)} '${pm.slice(2, 4)}`;
}

const YEARS = (() => {
  const years: string[] = [];
  for (let y = 2025; y <= new Date().getFullYear(); y++) years.push(String(y));
  return years;
})();

function getMonthsForYear(year: string) {
  const now = new Date();
  if (year !== String(now.getFullYear())) return MESES;
  return MESES.filter((m) => parseInt(m.value, 10) <= now.getMonth() + 1);
}

const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "1", label: "Pendiente" },
  { value: "2", label: "Asignado" },
  { value: "cerrado", label: "Cerrado" },
  { value: "anulado", label: "Anulado" },
];

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
        active
          ? "bg-indigo-600 border-indigo-500 text-white"
          : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function ReclamosHistorial({
  onBack,
  onClose: _onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const [vista, setVista] = useState<"historial" | "materiales" | "estadisticas">("historial");

  const [rows, setRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Materiales — resumen
  interface MaterialRow { material: string; total_unidades: number; cantidad_ordenes: number; }
  const [materiales, setMateriales] = useState<MaterialRow[]>([]);
  const [materialesPrev, setMaterialesPrev] = useState<MaterialRow[]>([]);
  const [loadingMat, setLoadingMat] = useState(false);
  const [errorMat, setErrorMat] = useState<string | null>(null);

  // Materiales — detalle acordeón
  interface DetailRow { conexion: string; fecha_cierre: string; cod_sucursal: number; cantidad: number; }
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [materialDetails, setMaterialDetails] = useState<Record<string, DetailRow[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  // Estadísticas mes a mes
  interface EstadRow { material: string; mes: string; total_unidades: number; total_material: number; }
  const [estadData, setEstadData] = useState<EstadRow[]>([]);
  const [loadingEstad, setLoadingEstad] = useState(false);
  const [errorEstad, setErrorEstad] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>({ sucursal: "", anio: "", mesAnio: "", estado: "", durMin: "", durMax: "" });
  const [durInput, setDurInput] = useState({ min: "", max: "" });
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchPage = useCallback(async (f: Filters, newOffset: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(f, newOffset));
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows((prev) => replace ? data.rows : [...prev, ...data.rows]);
      setTotal(data.total);
      setOffset(newOffset + data.rows.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (vista === "historial") fetchPage(filters, 0, true);
  }, [filters, fetchPage, vista]);

  const fetchMateriales = useCallback(async (f: Filters) => {
    setLoadingMat(true);
    setErrorMat(null);
    try {
      const p = new URLSearchParams();
      if (f.sucursal) p.set("sucursal", f.sucursal);
      if (f.mesAnio) p.set("mes_anio", f.mesAnio);
      else if (f.anio) p.set("anio", f.anio);
      const [res, resPrev] = await Promise.all([
        fetch(`/api/materiales-historial?${p.toString()}`),
        fetch(`/api/materiales-historial?${buildPrevMatParams(f).toString()}`),
      ]);
      const [data, dataPrev] = await Promise.all([res.json(), resPrev.json()]);
      if (data.error) throw new Error(data.error);
      setMaterialesPrev(dataPrev.rows ?? []);
      setMateriales(data.rows ?? []);
    } catch (e: unknown) {
      setErrorMat(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMat(false);
    }
  }, []);

  useEffect(() => {
    if (vista === "materiales") fetchMateriales(filters);
  }, [filters, fetchMateriales, vista]);

  const toggleMaterialDetail = async (material: string) => {
    if (expandedMaterial === material) { setExpandedMaterial(null); return; }
    setExpandedMaterial(material);
    if (materialDetails[material]) return;
    setLoadingDetail(material);
    try {
      const p = new URLSearchParams({ material });
      if (filters.sucursal) p.set("sucursal", filters.sucursal);
      if (filters.mesAnio) p.set("mes_anio", filters.mesAnio);
      else if (filters.anio) p.set("anio", filters.anio);
      const res = await fetch(`/api/materiales-historial?${p.toString()}`);
      const data = await res.json();
      setMaterialDetails(prev => ({ ...prev, [material]: data.rows ?? [] }));
    } catch { /* ignore */ }
    finally { setLoadingDetail(null); }
  };

  const fetchEstadisticas = useCallback(async (f: Filters) => {
    setLoadingEstad(true);
    setErrorEstad(null);
    try {
      const p = new URLSearchParams({ modo: "estadisticas" });
      if (f.sucursal) p.set("sucursal", f.sucursal);
      p.set("anio", f.anio || String(new Date().getFullYear()));
      const res = await fetch(`/api/materiales-historial?${p.toString()}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEstadData(data.rows ?? []);
    } catch (e: unknown) {
      setErrorEstad(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingEstad(false);
    }
  }, []);

  useEffect(() => {
    if (vista === "estadisticas") fetchEstadisticas(filters);
  }, [filters, fetchEstadisticas, vista]);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setOffset(0);
    setMaterialDetails({});
    setExpandedMaterial(null);
  };

  const applyDuracion = () => {
    setFilters((prev) => ({ ...prev, durMin: durInput.min, durMax: durInput.max }));
    setOffset(0);
  };

  const resetAll = () => {
    setFilters({ sucursal: "", anio: "", mesAnio: "", estado: "", durMin: "", durMax: "" });
    setDurInput({ min: "", max: "" });
    setOffset(0);
    setMaterialDetails({});
    setExpandedMaterial(null);
  };

  const loadMore = () => fetchPage(filters, offset, false);

  const loadAll = async () => {
    setLoadingAll(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(filters, 0, true));
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows(data.rows);
      setTotal(data.total);
      setOffset(data.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingAll(false);
    }
  };

  const hayMas = rows.length < total;
  const hayFiltros = filters.sucursal || filters.anio || filters.mesAnio || filters.estado || filters.durMin || filters.durMax;

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    // fecha_carga viene en formato DD-MM-YY; convertir a YYMMDD para orden correcto
    const parseDate = (s: string | null) => {
      if (!s) return "";
      const [d, m, y] = s.split("-");
      return `${y}${m}${d}`;
    };
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "dias" || sortCol === "estado_incidencia") {
        cmp = (a[sortCol] as number) - (b[sortCol] as number);
      } else if (sortCol === "fecha_carga") {
        cmp = parseDate(a.fecha_carga).localeCompare(parseDate(b.fecha_carga));
      } else {
        cmp = (a[sortCol] ?? "").localeCompare(b[sortCol] ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronsUpDown size={12} className="text-slate-600" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-indigo-400" /> : <ChevronDown size={12} className="text-indigo-400" />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mb-3"
          >
            <ChevronLeft size={15} /> Volver al resumen
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <History size={20} className="text-indigo-400" /> Historial de Reclamos
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">Todos los reclamos desde 2025 — duración desde asignación hasta cierre</p>
            </div>
            {/* Tab selector */}
            <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-1 gap-1">
              <button
                onClick={() => setVista("historial")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${vista === "historial" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                <History size={14} /> Reclamos
              </button>
              <button
                onClick={() => setVista("materiales")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${vista === "materiales" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                <Package size={14} /> Materiales
              </button>
              <button
                onClick={() => setVista("estadisticas")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${vista === "estadisticas" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                <BarChart2 size={14} /> Estadísticas
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex flex-col gap-2">

          {/* Fila 1: Estado + Sucursal */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Estado</span>
              {ESTADOS.map((e) => (
                <PillButton key={e.value} active={filters.estado === e.value} onClick={() => setFilter("estado", e.value)}>
                  {e.label}
                </PillButton>
              ))}
            </div>
            <div className="w-px h-4 bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Sucursal</span>
              <PillButton active={filters.sucursal === ""} onClick={() => setFilter("sucursal", "")}>Todas</PillButton>
              {Object.entries(SUCURSALES).map(([cod, nombre]) => (
                <PillButton key={cod} active={filters.sucursal === cod} onClick={() => setFilter("sucursal", cod)}>
                  {nombre}
                </PillButton>
              ))}
            </div>
          </div>

          {/* Fila 2: Período + Duración */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Período</span>
              <PillButton active={!filters.anio && !filters.mesAnio} onClick={() => setFilters((p) => ({ ...p, anio: "", mesAnio: "" }))}>
                Todos
              </PillButton>
              {YEARS.map((y) => (
                <PillButton key={y} active={filters.anio === y || filters.mesAnio.startsWith(y)} onClick={() => setFilters((p) => ({ ...p, anio: y, mesAnio: "" }))}>
                  {y}
                </PillButton>
              ))}
            </div>
            <div className="w-px h-4 bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Días</span>
              <input type="number" min={0} placeholder="Mín" value={durInput.min}
                onChange={(e) => setDurInput((d) => ({ ...d, min: e.target.value }))}
                className="w-16 bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-slate-400" />
              <span className="text-slate-600 text-xs">—</span>
              <input type="number" min={0} placeholder="Máx" value={durInput.max}
                onChange={(e) => setDurInput((d) => ({ ...d, max: e.target.value }))}
                className="w-16 bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-slate-400" />
              <button onClick={applyDuracion} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 text-xs rounded-lg transition-colors">
                Aplicar
              </button>
              {(filters.durMin || filters.durMax) && (
                <button onClick={() => { setFilters((f) => ({ ...f, durMin: "", durMax: "" })); setDurInput({ min: "", max: "" }); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors">✕</button>
              )}
            </div>
          </div>

          {/* Fila 3: Meses (solo cuando hay año seleccionado) */}
          {(filters.anio || filters.mesAnio) && (() => {
            const activeYear = filters.mesAnio ? filters.mesAnio.slice(0, 4) : filters.anio;
            return (
              <div className="flex items-center gap-1.5 flex-wrap pl-3 border-l-2 border-indigo-800">
                <PillButton active={!!filters.anio && !filters.mesAnio} onClick={() => setFilters((p) => ({ ...p, anio: activeYear, mesAnio: "" }))}>
                  Todo {activeYear}
                </PillButton>
                {getMonthsForYear(activeYear).map((m) => (
                  <PillButton key={m.value} active={filters.mesAnio === `${activeYear}-${m.value}`}
                    onClick={() => setFilters((p) => ({ ...p, anio: "", mesAnio: `${activeYear}-${m.value}` }))}>
                    {m.label}
                  </PillButton>
                ))}
              </div>
            );
          })()}

          {/* Limpiar */}
          {hayFiltros && (
            <button onClick={resetAll} className="self-start text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Limpiar todos los filtros
            </button>
          )}
        </div>

        {/* ── VISTA MATERIALES ── */}
        {vista === "materiales" && (
          <>
            {errorMat && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
                <AlertCircle size={16} /> {errorMat}
              </div>
            )}
            {loadingMat && (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                <Loader2 size={16} className="animate-spin" /> Cargando materiales...
              </div>
            )}
            {!loadingMat && !errorMat && materiales.length === 0 && (
              <div className="text-center py-16 text-slate-500 text-sm">Sin materiales para los filtros seleccionados</div>
            )}
            {!loadingMat && materiales.length > 0 && (() => {
              const totalUnidades = materiales.reduce((s, r) => s + r.total_unidades, 0);
              return (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-900/40">
                    <p className="text-xs text-slate-400">
                      <span className="text-slate-200 font-semibold">{materiales.length}</span> materiales ·{" "}
                      <span className="text-slate-200 font-semibold">{totalUnidades.toLocaleString()}</span> unidades totales
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                          <th className="text-left py-3 px-4 w-8">#</th>
                          <th className="text-left py-3 px-4">Material</th>
                          <th className="text-right py-3 px-4">Unidades</th>
                          <th className="text-right py-3 px-4">Órdenes</th>
                          {filters.mesAnio && <th className="text-right py-3 px-4 whitespace-nowrap">VS {prevLabel(filters)}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {materiales.map((r, i) => {
                          const isExpanded = expandedMaterial === r.material;
                          const details = materialDetails[r.material];
                          const isLoadingThis = loadingDetail === r.material;
                          const prevRow = materialesPrev.find(p => p.material === r.material);
                          const prevUnidades = prevRow?.total_unidades ?? null;
                          let deltaCell = <span className="text-slate-600 text-xs">—</span>;
                          if (prevUnidades === null || prevUnidades === 0) {
                            deltaCell = <span className="text-indigo-400 text-xs font-medium">nuevo</span>;
                          } else {
                            const dpct = Math.round(((r.total_unidades - prevUnidades) / prevUnidades) * 100);
                            if (dpct > 0) deltaCell = <span className="flex items-center justify-end gap-1 text-emerald-400 font-semibold"><TrendingUp size={12}/>+{dpct}%</span>;
                            else if (dpct < 0) deltaCell = <span className="flex items-center justify-end gap-1 text-rose-400 font-semibold"><TrendingDown size={12}/>{dpct}%</span>;
                            else deltaCell = <span className="text-slate-500 text-xs">=</span>;
                          }
                          return (
                            <>
                              <tr
                                key={i}
                                onClick={() => toggleMaterialDetail(r.material)}
                                className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors cursor-pointer"
                              >
                                <td className="py-2.5 px-4 text-slate-600 font-mono">{i + 1}</td>
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <ChevronRight size={13} className={`text-slate-500 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                                    <span className="text-slate-200 font-medium">{r.material}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-right text-white font-semibold tabular-nums">{r.total_unidades.toLocaleString()}</td>
                                <td className="py-2.5 px-4 text-right text-slate-400 tabular-nums">{r.cantidad_ordenes}</td>
                                {filters.mesAnio && <td className="py-2.5 px-4 text-right tabular-nums" title={prevUnidades !== null ? `${prevUnidades.toLocaleString()} uds. en ${prevLabel(filters)}` : undefined}>{deltaCell}</td>}
                              </tr>
                              {isExpanded && (
                                <tr key={`${i}-detail`} className="border-b border-slate-800 bg-slate-900/50">
                                  <td colSpan={5} className="px-4 py-3">
                                    {isLoadingThis && (
                                      <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
                                        <Loader2 size={12} className="animate-spin" /> Cargando reclamos...
                                      </div>
                                    )}
                                    {!isLoadingThis && details && details.length === 0 && (
                                      <p className="text-slate-500 text-xs">Sin reclamos encontrados.</p>
                                    )}
                                    {!isLoadingThis && details && details.length > 0 && (
                                      <div className="overflow-x-auto">
                                        <table className="text-xs w-full">
                                          <thead>
                                            <tr className="text-slate-500 border-b border-slate-700">
                                              <th className="text-left pb-1.5 pr-4 font-medium">Conexión</th>
                                              <th className="text-left pb-1.5 pr-4 font-medium">Sucursal</th>
                                              <th className="text-left pb-1.5 pr-4 font-medium">Fecha cierre</th>
                                              <th className="text-right pb-1.5 font-medium">Cant.</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-800/60">
                                            {details.map((d, di) => (
                                              <tr key={di} className="hover:bg-slate-700/20">
                                                <td className="py-1.5 pr-4 font-mono text-slate-300">{d.conexion}</td>
                                                <td className="py-1.5 pr-4 text-slate-400">{SUCURSALES[d.cod_sucursal] ?? `Suc. ${d.cod_sucursal}`}</td>
                                                <td className="py-1.5 pr-4 text-slate-400">{d.fecha_cierre}</td>
                                                <td className="py-1.5 text-right text-slate-300 font-semibold tabular-nums">{d.cantidad}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── VISTA ESTADÍSTICAS ── */}
        {vista === "estadisticas" && (() => {
          const estadAnio = filters.anio || String(new Date().getFullYear());
          const meses = [...new Set(estadData.map(r => r.mes))].sort();
          const materialesEstad = [...new Set(estadData.map(r => r.material))];
          const pivot = materialesEstad.map(mat => {
            const byMes: Record<string, number> = {};
            let total = 0;
            for (const r of estadData) {
              if (r.material === mat) { byMes[r.mes] = r.total_unidades; total += r.total_unidades; }
            }
            return { material: mat, byMes, total };
          }).sort((a, b) => b.total - a.total);
          const mesLabel = (mes: string) => {
            const m = MESES.find(x => mes.endsWith(`-${x.value}`));
            return m?.label ?? mes.slice(5);
          };
          return (
            <>
              {errorEstad && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
                  <AlertCircle size={16} /> {errorEstad}
                </div>
              )}
              {loadingEstad && (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                  <Loader2 size={16} className="animate-spin" /> Cargando estadísticas...
                </div>
              )}
              {!loadingEstad && pivot.length === 0 && !errorEstad && (
                <div className="text-center py-16 text-slate-500 text-sm">Sin datos para {estadAnio}</div>
              )}
              {!loadingEstad && pivot.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-900/40">
                    <p className="text-xs text-slate-400 font-medium">
                      Materiales utilizados — <span className="text-slate-200">{estadAnio}</span>
                      <span className="ml-3 text-slate-600">· Filtro de sucursal activo: {filters.sucursal ? (SUCURSALES[parseInt(filters.sucursal)] ?? filters.sucursal) : "Todas"}</span>
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700 bg-slate-900/20">
                          <th className="text-left py-3 px-4 font-medium sticky left-0 bg-slate-800 z-10">Material</th>
                          {meses.map(m => (
                            <th key={m} className="text-right py-3 px-3 font-medium whitespace-nowrap">{mesLabel(m)}</th>
                          ))}
                          <th className="text-right py-3 px-4 font-medium text-slate-300">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pivot.map((row, i) => {
                          const maxVal = Math.max(...meses.map(m => row.byMes[m] ?? 0));
                          return (
                            <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-700/20 transition-colors">
                              <td className="py-2.5 px-4 text-slate-200 font-medium sticky left-0 bg-slate-800 max-w-[180px] truncate">{row.material}</td>
                              {meses.map(m => {
                                const val = row.byMes[m];
                                const isMax = val !== undefined && val === maxVal && maxVal > 0;
                                return (
                                  <td key={m} className={`py-2.5 px-3 text-right tabular-nums ${val !== undefined ? (isMax ? "text-indigo-300 font-bold" : "text-slate-300") : "text-slate-700"}`}>
                                    {val !== undefined ? val.toLocaleString() : "—"}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 px-4 text-right text-white font-bold tabular-nums">{row.total.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ── VISTA HISTORIAL ── */}
        {vista === "historial" && <>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Contador */}
        {!loading && !error && (
          <p className="text-sm text-slate-400">
            Mostrando <span className="text-slate-200 font-medium">{rows.length}</span> de{" "}
            <span className="text-slate-200 font-medium">{total.toLocaleString()}</span> reclamos
          </p>
        )}

        {/* Tabla */}
        {rows.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700 bg-slate-900/40">
                    <th className="text-left py-3 px-4">
                      <button onClick={() => toggleSort("conexion")} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                        Conexión <SortIcon col="conexion" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-4">Sucursal</th>
                    <th className="text-left py-3 px-4">Problema</th>
                    <th className="text-left py-3 px-4">Cuadrilla</th>
                    <th className="text-left py-3 px-4">
                      <button onClick={() => toggleSort("estado_incidencia")} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                        Estado <SortIcon col="estado_incidencia" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-4">
                      <button onClick={() => toggleSort("fecha_carga")} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                        Asignado <SortIcon col="fecha_carga" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-4">Cerrado</th>
                    <th className="text-right py-3 px-4">
                      <button onClick={() => toggleSort("dias")} className="flex items-center gap-1 ml-auto hover:text-slate-200 transition-colors">
                        Duración <SortIcon col="dias" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r, i) => {
                    const esAnulado = !!r.fecha_anulacion && !r.fecha_solucion;
                    const fechaCierre = r.fecha_solucion ?? r.fecha_anulacion;
                    return (
                    <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-slate-200">{r.conexion}</td>
                      <td className="py-2.5 px-4 text-slate-300">{SUCURSALES[r.cod_sucursal] ?? `Suc. ${r.cod_sucursal}`}</td>
                      <td className="py-2.5 px-4 text-slate-300 max-w-[180px] truncate">{r.problema ?? "—"}</td>
                      <td className="py-2.5 px-4 text-slate-400">{r.cuadrilla ?? "—"}</td>
                      <td className="py-2.5 px-4">{estadoBadge(r.estado_incidencia, r.fecha_anulacion)}</td>
                      <td className="py-2.5 px-4 text-slate-400">{r.fecha_carga ?? "—"}</td>
                      <td className="py-2.5 px-4">
                        {fechaCierre
                          ? <span className={esAnulado ? "text-rose-400/70" : "text-slate-400"}>{fechaCierre}</span>
                          : <span className="text-amber-400/70 italic">En curso</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          esAnulado ? "bg-slate-700 text-slate-400" :
                          r.dias >= 7 ? "bg-red-500/20 text-red-400" :
                          r.dias >= 3 ? "bg-amber-500/20 text-amber-400" :
                          "bg-emerald-500/20 text-emerald-400"
                        }`}>{r.dias}d</span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <Loader2 size={16} className="animate-spin" /> Cargando reclamos...
          </div>
        )}

        {/* Paginación */}
        {!loading && hayMas && (
          <div className="flex items-center gap-3">
            <button
              onClick={loadMore}
              className="px-4 py-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-sm rounded-lg transition-colors"
            >
              Cargar 50 más
            </button>
            <button
              onClick={loadAll}
              disabled={loadingAll}
              className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors disabled:opacity-50"
            >
              {loadingAll && <Loader2 size={14} className="animate-spin" />}
              Cargar todos ({(total - rows.length).toLocaleString()} restantes)
            </button>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm">Sin reclamos para los filtros seleccionados</div>
        )}

        </>}

      </div>
    </div>
  );
}
