"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, Package, BarChart2,
  TrendingUp, TrendingDown, AlertTriangle, ShieldAlert, Plus, X, SlidersHorizontal,
  Sparkles,
} from "lucide-react";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha", 4: "Valle Viejo",
  5: "Tinogasta", 6: "Rodeo", 7: "La Puerta", 8: "Fiambalá",
};

const MESES = [
  { value: "01", label: "Ene" }, { value: "02", label: "Feb" }, { value: "03", label: "Mar" },
  { value: "04", label: "Abr" }, { value: "05", label: "May" }, { value: "06", label: "Jun" },
  { value: "07", label: "Jul" }, { value: "08", label: "Ago" }, { value: "09", label: "Sep" },
  { value: "10", label: "Oct" }, { value: "11", label: "Nov" }, { value: "12", label: "Dic" },
];

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

interface Filters { sucursal: string; anio: string; mesAnio: string; }

function prevMesAnioStr(f: Filters): string {
  let base: string;
  if (f.mesAnio) { base = f.mesAnio; }
  else { const now = new Date(); base = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
  const [y, m] = base.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

function prevLabel(f: Filters): string {
  const pm = prevMesAnioStr(f);
  const m = MESES.find(x => pm.endsWith(`-${x.value}`));
  return `${m?.label ?? pm.slice(5)} '${pm.slice(2, 4)}`;
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
        active ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

interface MaterialRow { material: string; total_unidades: number; cantidad_ordenes: number; }
interface DetailRow { conexion: string; fecha_cierre: string; cod_sucursal: number; cantidad: number; }
interface EstadRow { material: string; mes: string; total_unidades: number; total_material: number; }
interface AnomaliaRow {
  material: string;
  conexion: string;
  id_incidencia: number;
  fecha_cierre: string;
  cod_sucursal: number;
  cantidad_usada: number;
}
interface PromedioRow {
  material: string;
  sugerido: number;
  promedio: number;
  maximo: number;
  total_ordenes: number;
}

const STORAGE_KEY = "mat_limites_v1";

export default function MaterialesView({ onBack }: { onBack: () => void }) {
  const [vista, setVista] = useState<"materiales" | "estadisticas" | "fuera-de-lo-normal">("materiales");
  const [filters, setFiltersState] = useState<Filters>({ sucursal: "", anio: "", mesAnio: "" });

  // Materiales
  const [materiales, setMateriales] = useState<MaterialRow[]>([]);
  const [materialesPrev, setMaterialesPrev] = useState<MaterialRow[]>([]);
  const [loadingMat, setLoadingMat] = useState(false);
  const [errorMat, setErrorMat] = useState<string | null>(null);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [materialDetails, setMaterialDetails] = useState<Record<string, DetailRow[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  // Estadísticas
  const [estadData, setEstadData] = useState<EstadRow[]>([]);
  const [loadingEstad, setLoadingEstad] = useState(false);
  const [errorEstad, setErrorEstad] = useState<string | null>(null);

  // Fuera de lo normal
  const [limites, setLimites] = useState<Record<string, number>>({});
  const [expandedLimite, setExpandedLimite] = useState<string | null>(null);
  const [anomaliasPorMat, setAnomaliasPorMat] = useState<Record<string, AnomaliaRow[]>>({});
  const [loadingPorMat, setLoadingPorMat] = useState<string | null>(null);
  const [errorPorMat, setErrorPorMat] = useState<Record<string, string>>({});
  const [loadingSugeridos, setLoadingSugeridos] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMaterial, setNewMaterial] = useState("");
  const [newLimite, setNewLimite] = useState(1);
  const [allMaterialNames, setAllMaterialNames] = useState<string[]>([]);
  const [loadingAllMat, setLoadingAllMat] = useState(false);

  // Cargar límites desde localStorage después de hidratación
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setLimites(JSON.parse(saved));
    } catch {}
  }, []);

  const setFilter = (update: Partial<Filters>) => {
    setFiltersState(prev => ({ ...prev, ...update }));
    setMaterialDetails({});
    setExpandedMaterial(null);
    // Limpiar caché de anomalías al cambiar filtros
    setAnomaliasPorMat({});
    setExpandedLimite(null);
  };

  const saveLimites = (next: Record<string, number>) => {
    setLimites(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const updateMaterialLimite = (material: string, value: number) => {
    saveLimites({ ...limites, [material]: value });
    // Limpiar caché de ese material para que re-fetchee al volver a abrir
    setAnomaliasPorMat(prev => { const next = { ...prev }; delete next[material]; return next; });
    if (expandedLimite === material) setExpandedLimite(null);
  };

  const removeLimite = (material: string) => {
    const next = { ...limites };
    delete next[material];
    saveLimites(next);
    setAnomaliasPorMat(prev => { const next2 = { ...prev }; delete next2[material]; return next2; });
    if (expandedLimite === material) setExpandedLimite(null);
  };

  const fetchMateriales = useCallback(async (f: Filters) => {
    setLoadingMat(true); setErrorMat(null);
    try {
      const p = new URLSearchParams();
      if (f.sucursal) p.set("sucursal", f.sucursal);
      if (f.mesAnio) p.set("mes_anio", f.mesAnio);
      else if (f.anio) p.set("anio", f.anio);
      const pp = new URLSearchParams();
      if (f.sucursal) pp.set("sucursal", f.sucursal);
      pp.set("mes_anio", prevMesAnioStr(f));
      const [res, resPrev] = await Promise.all([
        fetch(`/api/materiales-historial?${p}`),
        fetch(`/api/materiales-historial?${pp}`),
      ]);
      const [data, dataPrev] = await Promise.all([res.json(), resPrev.json()]);
      if (data.error) throw new Error(data.error);
      setMateriales(data.rows ?? []);
      setMaterialesPrev(dataPrev.rows ?? []);
    } catch (e: unknown) {
      setErrorMat(e instanceof Error ? e.message : String(e));
    } finally { setLoadingMat(false); }
  }, []);

  const fetchEstadisticas = useCallback(async (f: Filters) => {
    setLoadingEstad(true); setErrorEstad(null);
    try {
      const p = new URLSearchParams({ modo: "estadisticas" });
      if (f.sucursal) p.set("sucursal", f.sucursal);
      p.set("anio", f.anio || String(new Date().getFullYear()));
      const res = await fetch(`/api/materiales-historial?${p}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEstadData(data.rows ?? []);
    } catch (e: unknown) {
      setErrorEstad(e instanceof Error ? e.message : String(e));
    } finally { setLoadingEstad(false); }
  }, []);

  // Fetch anomalías de un material específico al hacer clic
  const fetchAnomaliasMaterial = useCallback(async (material: string, limite: number, f: Filters) => {
    setLoadingPorMat(material);
    setErrorPorMat(prev => { const next = { ...prev }; delete next[material]; return next; });
    try {
      const p = new URLSearchParams({ limites: JSON.stringify({ [material]: limite }) });
      if (f.sucursal) p.set("sucursal", f.sucursal);
      if (f.mesAnio) p.set("mes_anio", f.mesAnio);
      else if (f.anio) p.set("anio", f.anio);
      const res = await fetch(`/api/materiales-anomalias?${p}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnomaliasPorMat(prev => ({ ...prev, [material]: data.rows ?? [] }));
    } catch (e: unknown) {
      setErrorPorMat(prev => ({ ...prev, [material]: e instanceof Error ? e.message : String(e) }));
    } finally { setLoadingPorMat(null); }
  }, []);

  const toggleLimiteMaterial = (material: string) => {
    if (expandedLimite === material) { setExpandedLimite(null); return; }
    setExpandedLimite(material);
    if (!(material in anomaliasPorMat)) {
      fetchAnomaliasMaterial(material, limites[material], filters);
    }
  };

  // Sugerir límites desde promedios de la BD
  const fetchSugeridos = async () => {
    setLoadingSugeridos(true);
    try {
      const p = new URLSearchParams({ modo: "promedios" });
      if (filters.sucursal) p.set("sucursal", filters.sucursal);
      const res = await fetch(`/api/materiales-anomalias?${p}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const newLimites: Record<string, number> = {};
      for (const row of (data.rows ?? []) as PromedioRow[]) {
        newLimites[row.material] = row.sugerido;
      }
      saveLimites(newLimites);
      setAnomaliasPorMat({});
      setExpandedLimite(null);
    } catch (e: unknown) {
      console.error("[fetchSugeridos]", e);
    } finally { setLoadingSugeridos(false); }
  };

  const handleAddMaterial = () => {
    setShowAddForm(true);
    if (allMaterialNames.length === 0 && !loadingAllMat) {
      if (materiales.length > 0) {
        setAllMaterialNames(materiales.map(r => r.material).sort());
      } else {
        setLoadingAllMat(true);
        fetch("/api/materiales-historial")
          .then(r => r.json())
          .then(data => setAllMaterialNames((data.rows ?? []).map((r: MaterialRow) => r.material).sort()))
          .catch(() => {})
          .finally(() => setLoadingAllMat(false));
      }
    }
  };

  useEffect(() => { if (vista === "materiales") fetchMateriales(filters); }, [filters, fetchMateriales, vista]);
  useEffect(() => { if (vista === "estadisticas") fetchEstadisticas(filters); }, [filters, fetchEstadisticas, vista]);

  const hayFiltros = filters.sucursal || filters.anio || filters.mesAnio;
  const activeYear = filters.mesAnio ? filters.mesAnio.slice(0, 4) : filters.anio;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <button onClick={onBack} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mb-3">
            <ChevronLeft size={15} /> Volver al resumen
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Package size={20} className="text-indigo-400" /> Materiales
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">Materiales utilizados en reclamos desde 2025</p>
            </div>
            <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-1 gap-1">
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
              <button
                onClick={() => setVista("fuera-de-lo-normal")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${vista === "fuera-de-lo-normal" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                <ShieldAlert size={14} /> Fuera de lo normal
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Sucursal</span>
              <PillButton active={filters.sucursal === ""} onClick={() => setFilter({ sucursal: "" })}>Todas</PillButton>
              {Object.entries(SUCURSALES).map(([cod, nombre]) => (
                <PillButton key={cod} active={filters.sucursal === cod} onClick={() => setFilter({ sucursal: cod })}>{nombre}</PillButton>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Período</span>
              <PillButton active={!filters.anio && !filters.mesAnio} onClick={() => setFilter({ anio: "", mesAnio: "" })}>Todos</PillButton>
              {YEARS.map(y => (
                <PillButton key={y} active={filters.anio === y || filters.mesAnio.startsWith(y)} onClick={() => setFilter({ anio: y, mesAnio: "" })}>{y}</PillButton>
              ))}
            </div>
          </div>
          {activeYear && (
            <div className="flex flex-col gap-1 pl-3 border-l-2 border-indigo-800">
              <span className="text-[10px] text-indigo-400 font-semibold tracking-widest uppercase">{activeYear}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <PillButton active={!!filters.anio && !filters.mesAnio} onClick={() => setFilter({ anio: activeYear, mesAnio: "" })}>Todo</PillButton>
                {getMonthsForYear(activeYear).map(m => (
                  <PillButton key={m.value} active={filters.mesAnio === `${activeYear}-${m.value}`} onClick={() => setFilter({ anio: "", mesAnio: `${activeYear}-${m.value}` })}>{m.label}</PillButton>
                ))}
              </div>
            </div>
          )}
          {hayFiltros && (
            <button onClick={() => setFilter({ sucursal: "", anio: "", mesAnio: "" })} className="self-start text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Limpiar filtros
            </button>
          )}
        </div>

        {/* ── VISTA MATERIALES ── */}
        {vista === "materiales" && (
          <>
            {errorMat && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3"><AlertCircle size={16}/>{errorMat}</div>}
            {loadingMat && <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 size={16} className="animate-spin"/> Cargando materiales...</div>}
            {!loadingMat && !errorMat && materiales.length === 0 && <div className="text-center py-16 text-slate-500 text-sm">Sin materiales para los filtros seleccionados</div>}
            {!loadingMat && materiales.length > 0 && (() => {
              const totalUnidades = materiales.reduce((s, r) => s + r.total_unidades, 0);
              return (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                  <div className="flex items-center px-5 py-3 border-b border-slate-700 bg-slate-900/40">
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
                            <Fragment key={r.material}>
                              <tr onClick={() => { if (expandedMaterial === r.material) { setExpandedMaterial(null); return; } setExpandedMaterial(r.material); if (materialDetails[r.material]) return; setLoadingDetail(r.material); const p = new URLSearchParams({ material: r.material }); if (filters.sucursal) p.set("sucursal", filters.sucursal); if (filters.mesAnio) p.set("mes_anio", filters.mesAnio); else if (filters.anio) p.set("anio", filters.anio); fetch(`/api/materiales-historial?${p}`).then(res => res.json()).then(data => setMaterialDetails(prev => ({ ...prev, [r.material]: data.rows ?? [] }))).catch(() => {}).finally(() => setLoadingDetail(null)); }} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors cursor-pointer">
                                <td className="py-2.5 px-4 text-slate-600 font-mono">{i + 1}</td>
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <ChevronRight size={13} className={`text-slate-500 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                                    <span className="text-slate-200 font-medium">{r.material}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-right text-white font-semibold tabular-nums">{r.total_unidades.toLocaleString()}</td>
                                <td className="py-2.5 px-4 text-right text-slate-400 tabular-nums">{r.cantidad_ordenes}</td>
                                {filters.mesAnio && (
                                  <td className="py-2.5 px-4 text-right tabular-nums" title={prevUnidades !== null ? `${prevUnidades.toLocaleString()} uds. en ${prevLabel(filters)}` : undefined}>
                                    {deltaCell}
                                  </td>
                                )}
                              </tr>
                              {isExpanded && (
                                <tr className="border-b border-slate-800 bg-slate-900/50">
                                  <td colSpan={filters.mesAnio ? 5 : 4} className="px-4 py-3">
                                    {isLoadingThis && <div className="flex items-center gap-2 text-slate-400 text-xs py-1"><Loader2 size={12} className="animate-spin"/> Cargando reclamos...</div>}
                                    {!isLoadingThis && details && details.length === 0 && <p className="text-slate-500 text-xs">Sin reclamos encontrados.</p>}
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
                            </Fragment>
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
              {errorEstad && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3"><AlertCircle size={16}/>{errorEstad}</div>}
              {loadingEstad && <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 size={16} className="animate-spin"/> Cargando estadísticas...</div>}
              {!loadingEstad && pivot.length === 0 && !errorEstad && <div className="text-center py-16 text-slate-500 text-sm">Sin datos para {estadAnio}</div>}
              {!loadingEstad && pivot.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-700 bg-slate-900/40">
                    <p className="text-xs text-slate-400 font-medium">
                      Materiales utilizados — <span className="text-slate-200">{estadAnio}</span>
                      {filters.sucursal && <span className="ml-3 text-slate-600">· {SUCURSALES[parseInt(filters.sucursal)] ?? filters.sucursal}</span>}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700 bg-slate-900/20">
                          <th className="text-left py-3 px-4 font-medium sticky left-0 bg-slate-800 z-10">Material</th>
                          {meses.map(m => <th key={m} className="text-right py-3 px-3 font-medium whitespace-nowrap">{mesLabel(m)}</th>)}
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
              {!loadingEstad && (() => {
                const byMat: Record<string, { mes: string; total_unidades: number }[]> = {};
                for (const r of estadData) {
                  if (!byMat[r.material]) byMat[r.material] = [];
                  byMat[r.material].push({ mes: r.mes, total_unidades: r.total_unidades });
                }
                const anomalies: { material: string; mes: string; unidades: number; promedio: number; ratio: number }[] = [];
                for (const [mat, rows] of Object.entries(byMat)) {
                  if (rows.length < 2) continue;
                  const avg = rows.reduce((s, r) => s + r.total_unidades, 0) / rows.length;
                  for (const r of rows) {
                    if (r.total_unidades >= avg * 3 && r.total_unidades - avg >= 10) {
                      anomalies.push({ material: mat, mes: r.mes, unidades: r.total_unidades, promedio: Math.round(avg), ratio: Math.round(r.total_unidades / avg) });
                    }
                  }
                }
                anomalies.sort((a, b) => b.ratio - a.ratio);
                if (anomalies.length === 0) return null;
                const mesLabel2 = (mes: string) => { const m = MESES.find(x => mes.endsWith(`-${x.value}`)); return m?.label ?? mes.slice(5); };
                return (
                  <div className="bg-slate-800 border border-amber-800/50 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-800/40 bg-amber-950/20">
                      <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                      <p className="text-xs font-medium text-amber-300">Cargas inusuales detectadas</p>
                      <span className="ml-auto text-xs text-amber-600">{anomalies.length} {anomalies.length === 1 ? "registro" : "registros"} · &gt;3× el promedio mensual</span>
                    </div>
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="text-slate-500 uppercase tracking-wider border-b border-slate-700 bg-slate-900/20">
                          <th className="text-left py-2.5 px-5 font-medium">Material</th>
                          <th className="text-right py-2.5 px-4 font-medium">Mes</th>
                          <th className="text-right py-2.5 px-4 font-medium">Unidades</th>
                          <th className="text-right py-2.5 px-4 font-medium">Promedio</th>
                          <th className="text-right py-2.5 px-5 font-medium">Ratio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anomalies.map((a, i) => (
                          <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-700/20">
                            <td className="py-2.5 px-5 text-slate-200 max-w-[220px] truncate">{a.material}</td>
                            <td className="py-2.5 px-4 text-right text-slate-400">{mesLabel2(a.mes)}</td>
                            <td className="py-2.5 px-4 text-right text-white font-semibold tabular-nums">{a.unidades.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right text-slate-500 tabular-nums">{a.promedio.toLocaleString()}</td>
                            <td className={`py-2.5 px-5 text-right font-bold tabular-nums ${a.ratio >= 10 ? "text-rose-400" : "text-amber-400"}`}>{a.ratio}×</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </>
          );
        })()}

        {/* ── VISTA FUERA DE LO NORMAL ── */}
        {vista === "fuera-de-lo-normal" && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            {/* Header del panel */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-900/40 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-300">Límites por material</span>
                <span className="text-xs text-slate-600">· guardados en tu navegador · clic en el material para ver casos</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchSugeridos}
                  disabled={loadingSugeridos}
                  className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors font-medium border border-amber-800/50 hover:border-amber-700 px-2.5 py-1 rounded-lg"
                >
                  {loadingSugeridos ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Sugerir desde datos
                </button>
                <button
                  onClick={handleAddMaterial}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                >
                  <Plus size={13} /> Agregar
                </button>
              </div>
            </div>

            {/* Estado vacío */}
            {Object.keys(limites).length === 0 && !showAddForm && (
              <div className="px-5 py-10 text-center">
                <ShieldAlert size={36} className="mx-auto text-slate-700 mb-3" />
                <p className="text-slate-400 text-sm font-medium">Sin límites configurados</p>
                <p className="text-slate-600 text-xs mt-1 max-w-xs mx-auto">
                  Definí cuántas unidades es normal usar por orden. Las que superen ese valor aparecerán acá.
                </p>
                <div className="flex items-center justify-center gap-3 mt-5">
                  <button
                    onClick={fetchSugeridos}
                    disabled={loadingSugeridos}
                    className="inline-flex items-center gap-1.5 text-xs bg-amber-600/20 hover:bg-amber-600/30 border border-amber-700 text-amber-300 px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50"
                  >
                    {loadingSugeridos ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Sugerir desde datos
                  </button>
                  <button
                    onClick={handleAddMaterial}
                    className="inline-flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                  >
                    <Plus size={13} /> Agregar manualmente
                  </button>
                </div>
              </div>
            )}

            {/* Lista de materiales con acordeón */}
            {Object.keys(limites).length > 0 && (
              <div className="divide-y divide-slate-700/50">
                {Object.entries(limites).map(([material, limite]) => {
                  const isExpanded = expandedLimite === material;
                  const isLoading = loadingPorMat === material;
                  const anomalias = anomaliasPorMat[material];
                  const error = errorPorMat[material];

                  return (
                    <div key={material}>
                      {/* Fila del material */}
                      <div className="flex items-center gap-2 px-4 py-2.5">
                        <button
                          onClick={() => toggleLimiteMaterial(material)}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left group"
                        >
                          <ChevronRight size={13} className={`text-slate-500 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                          <span className="text-sm text-slate-200 group-hover:text-white transition-colors truncate">{material}</span>
                        </button>
                        {/* Badge de resultado (solo si ya se consultó) */}
                        {isLoading && <Loader2 size={12} className="animate-spin text-slate-500 shrink-0" />}
                        {!isLoading && anomalias !== undefined && (
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                            anomalias.length > 0
                              ? "bg-rose-900/50 text-rose-400"
                              : "bg-emerald-900/30 text-emerald-500"
                          }`}>
                            {anomalias.length > 0 ? `${anomalias.length} casos` : "OK"}
                          </span>
                        )}
                        <span className="text-xs text-slate-600 shrink-0">máx.</span>
                        <input
                          type="number"
                          min={1}
                          value={limite}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateMaterialLimite(material, Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-14 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white text-center tabular-nums focus:outline-none focus:border-indigo-500 transition-colors shrink-0"
                        />
                        <span className="text-xs text-slate-600 whitespace-nowrap shrink-0">ud.</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeLimite(material); }}
                          className="text-slate-700 hover:text-rose-400 transition-colors ml-1 shrink-0"
                          title="Eliminar"
                        >
                          <X size={13} />
                        </button>
                      </div>

                      {/* Acordeón con resultados */}
                      {isExpanded && (
                        <div className="bg-slate-900/60 border-t border-slate-700/50 px-5 py-3">
                          {isLoading && (
                            <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                              <Loader2 size={12} className="animate-spin" /> Buscando órdenes con más de {limite} unidad{limite !== 1 ? "es" : ""}...
                            </div>
                          )}
                          {error && <div className="text-red-400 text-xs py-2">{error}</div>}
                          {!isLoading && !error && anomalias !== undefined && anomalias.length === 0 && (
                            <p className="text-slate-500 text-xs py-1.5">
                              Sin órdenes que superen {limite} unidad{limite !== 1 ? "es" : ""} de <span className="text-slate-400 font-medium">{material}</span>.
                            </p>
                          )}
                          {!isLoading && !error && anomalias && anomalias.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="text-xs w-full">
                                <thead>
                                  <tr className="text-slate-500 border-b border-slate-700/60">
                                    <th className="text-left pb-1.5 pr-4 font-medium">Incidencia</th>
                                    <th className="text-left pb-1.5 pr-4 font-medium">Conexión</th>
                                    <th className="text-left pb-1.5 pr-4 font-medium">Sucursal</th>
                                    <th className="text-right pb-1.5 pr-4 font-medium">Fecha</th>
                                    <th className="text-right pb-1.5 font-medium">Cant.</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                  {anomalias.map((a, i) => (
                                    <tr key={i} className="hover:bg-slate-800/60">
                                      <td className="py-1.5 pr-4 font-mono text-slate-400 tabular-nums">{a.id_incidencia}</td>
                                      <td className="py-1.5 pr-4 font-mono text-slate-300 tabular-nums">{a.conexion}</td>
                                      <td className="py-1.5 pr-4 text-slate-400">{SUCURSALES[a.cod_sucursal] ?? `Suc. ${a.cod_sucursal}`}</td>
                                      <td className="py-1.5 pr-4 text-right text-slate-400 tabular-nums">{a.fecha_cierre}</td>
                                      <td className="py-1.5 text-right text-rose-400 font-bold tabular-nums">{a.cantidad_usada}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Formulario para agregar material */}
            {showAddForm && (
              <div className="border-t border-slate-700 bg-slate-900/30 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[200px]">
                    {loadingAllMat ? (
                      <div className="flex items-center gap-2 text-slate-400 text-xs py-1.5">
                        <Loader2 size={12} className="animate-spin" /> Cargando materiales...
                      </div>
                    ) : (
                      <select
                        value={newMaterial}
                        onChange={(e) => setNewMaterial(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="">Seleccionar material...</option>
                        {allMaterialNames.filter(m => !(m in limites)).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">máx.</span>
                    <input
                      type="number"
                      min={1}
                      value={newLimite}
                      onChange={(e) => setNewLimite(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white text-center tabular-nums focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <span className="text-xs text-slate-500">ud.</span>
                    <button
                      onClick={() => {
                        if (!newMaterial) return;
                        saveLimites({ ...limites, [newMaterial]: newLimite });
                        setNewMaterial(""); setNewLimite(1); setShowAddForm(false);
                      }}
                      disabled={!newMaterial}
                      className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      Agregar
                    </button>
                    <button onClick={() => { setShowAddForm(false); setNewMaterial(""); }} className="text-slate-500 hover:text-slate-300 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
