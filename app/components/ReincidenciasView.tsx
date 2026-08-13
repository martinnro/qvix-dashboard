"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import { Loader2, AlertCircle, ChevronLeft, RefreshCw, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

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

function prevMesAnio(): string {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  const pm = m === 0 ? 12 : m;
  const py = m === 0 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${active ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"}`}>
      {children}
    </button>
  );
}

function EstadoBadge({ estado }: { estado: string | number | null }) {
  const e = String(estado ?? "").toLowerCase();
  const cls = e === "cerrado" || e.includes("cerrad") || e.includes("solucionad")
    ? "bg-emerald-500/20 text-emerald-400"
    : e === "anulado" || e.includes("anulad")
    ? "bg-slate-600/50 text-slate-400"
    : e === "asignado" || e === "pendiente" || e.includes("asignad") || e.includes("pendient")
    ? "bg-amber-500/20 text-amber-400"
    : "bg-rose-500/20 text-rose-400";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {estado != null ? String(estado) : "—"}
    </span>
  );
}

interface Row {
  conexion: string;
  cod_sucursal: number;
  total: number;
  max_mismo_tipo: number;
  problema_frecuente: string | null;
}

interface DetalleRow {
  id_incidencia: number;
  fecha_carga: string | null;
  fecha_asignacion: string | null;
  fecha_cierre: string | null;
  estado_incidencia: string;
  problema: string | null;
  cuadrilla: string | null;
  dias: number | null;
}

interface Filters { sucursal: string; mesAnio: string; anio: string; }

export default function ReincidenciasView({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloMismoTipo, setSoloMismoTipo] = useState(false);
  const [filters, setFiltersState] = useState<Filters>({
    sucursal: "",
    mesAnio: prevMesAnio(),
    anio: "",
  });

  // Detalle por conexión
  const [expandedConexion, setExpandedConexion] = useState<string | null>(null);
  const [detallesCache, setDetallesCache] = useState<Record<string, DetalleRow[]>>({});
  const [loadingDetalle, setLoadingDetalle] = useState<string | null>(null);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const setFilter = (update: Partial<Filters>) => {
    setFiltersState(prev => ({ ...prev, ...update }));
    setExpandedConexion(null);
    setDetallesCache({});
  };

  const fetchData = useCallback(async (f: Filters) => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (f.sucursal) p.set("sucursal", f.sucursal);
      if (f.mesAnio) p.set("mes_anio", f.mesAnio);
      else if (f.anio) p.set("anio", f.anio);
      const res = await fetch(`/api/reincidencias?${p}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows(data.rows ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(filters); }, [filters, fetchData]);

  const handleRowClick = useCallback(async (conexion: string) => {
    if (expandedConexion === conexion) {
      setExpandedConexion(null);
      return;
    }
    setExpandedConexion(conexion);
    setErrorDetalle(null);
    if (detallesCache[conexion]) return;

    setLoadingDetalle(conexion);
    try {
      const p = new URLSearchParams({ conexion });
      if (filters.sucursal) p.set("sucursal", filters.sucursal);
      if (filters.mesAnio) p.set("mes_anio", filters.mesAnio);
      else if (filters.anio) p.set("anio", filters.anio);
      const res = await fetch(`/api/reincidencias?${p}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDetallesCache(prev => ({ ...prev, [conexion]: data.detalles ?? [] }));
    } catch (e: unknown) {
      setErrorDetalle(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDetalle(null);
    }
  }, [expandedConexion, detallesCache, filters]);

  const displayed = soloMismoTipo ? rows.filter(r => r.max_mismo_tipo >= 2) : rows;
  const activeYear = filters.mesAnio ? filters.mesAnio.slice(0, 4) : filters.anio;

  const periodoLabel = (() => {
    if (filters.mesAnio) {
      const m = MESES.find(x => filters.mesAnio.endsWith(`-${x.value}`));
      return `${m?.label ?? filters.mesAnio.slice(5)} ${filters.mesAnio.slice(0, 4)}`;
    }
    if (filters.anio) return filters.anio;
    return "último mes";
  })();

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <button onClick={onBack} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mb-3">
            <ChevronLeft size={15} /> Volver al resumen
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <RefreshCw size={20} className="text-rose-400" /> Reincidencias
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">Conexiones con 2 o más reclamos en el mismo período · hacé click en una fila para ver el detalle</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex flex-col gap-2">

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Sucursal</span>
            <PillButton active={filters.sucursal === ""} onClick={() => setFilter({ sucursal: "" })}>Todas</PillButton>
            {Object.entries(SUCURSALES).map(([cod, nombre]) => (
              <PillButton key={cod} active={filters.sucursal === cod} onClick={() => setFilter({ sucursal: cod })}>{nombre}</PillButton>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Período</span>
              <PillButton active={filters.mesAnio === prevMesAnio() && !filters.anio} onClick={() => setFilter({ mesAnio: prevMesAnio(), anio: "" })}>Mes anterior</PillButton>
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

          <div className="flex items-center gap-3 pt-1 border-t border-slate-700/50">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Tipo de incidencia</span>
            <button
              onClick={() => setSoloMismoTipo(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!soloMismoTipo ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-slate-400"}`}
            >
              Cualquier reclamo
            </button>
            <button
              onClick={() => setSoloMismoTipo(true)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${soloMismoTipo ? "bg-amber-600 border-amber-500 text-white" : "border-slate-600 text-slate-400 hover:border-slate-400"}`}
            >
              <AlertTriangle size={11} /> Solo mismo tipo repetido
            </button>
          </div>
        </div>

        {error && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3"><AlertCircle size={16}/>{error}</div>}
        {loading && <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 size={16} className="animate-spin"/> Cargando reincidencias...</div>}

        {!loading && !error && displayed.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm">Sin reincidencias para {periodoLabel}</div>
        )}

        {/* Tabla */}
        {!loading && displayed.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-900/40">
              <p className="text-xs text-slate-400">
                <span className="text-slate-200 font-semibold">{displayed.length}</span> conexiones · período: <span className="text-slate-200">{periodoLabel}</span>
                {soloMismoTipo && <span className="ml-2 text-amber-400 font-medium">· mismo tipo de problema</span>}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700 bg-slate-900/20">
                    <th className="text-left py-3 px-4 w-8">#</th>
                    <th className="text-left py-3 px-4">Conexión</th>
                    <th className="text-left py-3 px-4">Sucursal</th>
                    <th className="text-left py-3 px-4">Problema más frecuente</th>
                    <th className="text-right py-3 px-4">Reclamos</th>
                    <th className="text-right py-3 px-4">Mismo tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((r, i) => {
                    const isExpanded = expandedConexion === r.conexion;
                    const isLoadingThis = loadingDetalle === r.conexion;
                    const detalle = detallesCache[r.conexion] ?? [];
                    const mismoBadge = r.max_mismo_tipo >= 2;

                    return (
                      <Fragment key={r.conexion}>
                        <tr
                          onClick={() => handleRowClick(r.conexion)}
                          className={`border-b border-slate-800 last:border-0 cursor-pointer transition-colors select-none
                            ${isExpanded ? "bg-slate-700/40 border-slate-600" : "hover:bg-slate-700/20"}
                            ${mismoBadge && soloMismoTipo ? "bg-amber-950/10" : ""}
                          `}
                        >
                          <td className="py-2.5 px-4 text-slate-600 font-mono">{i + 1}</td>
                          <td className="py-2.5 px-4">
                            <span className="flex items-center gap-1.5 font-mono text-slate-200 font-semibold">
                              {isExpanded
                                ? <ChevronDown size={13} className="text-indigo-400 shrink-0" />
                                : <ChevronRight size={13} className="text-slate-600 shrink-0" />
                              }
                              {r.conexion}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-400">{SUCURSALES[r.cod_sucursal] ?? `Suc. ${r.cod_sucursal}`}</td>
                          <td className="py-2.5 px-4 text-slate-300 max-w-[220px] truncate">{r.problema_frecuente ?? "—"}</td>
                          <td className="py-2.5 px-4 text-right">
                            <span className={`px-2 py-0.5 rounded-full font-bold tabular-nums ${r.total >= 5 ? "bg-rose-500/20 text-rose-400" : r.total >= 3 ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-slate-300"}`}>
                              {r.total}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {r.max_mismo_tipo >= 2
                              ? <span className="flex items-center justify-end gap-1 text-amber-400 font-semibold"><AlertTriangle size={11}/>{r.max_mismo_tipo}×</span>
                              : <span className="text-slate-700">—</span>
                            }
                          </td>
                        </tr>

                        {/* Fila expandida con detalle */}
                        {isExpanded && (
                          <tr className="border-b border-slate-700/50">
                            <td colSpan={6} className="px-0 py-0">
                              <div className="bg-slate-900/60 border-t border-slate-700/50">

                                {isLoadingThis && (
                                  <div className="flex items-center gap-2 text-slate-400 text-xs px-8 py-4">
                                    <Loader2 size={13} className="animate-spin"/> Cargando incidencias de {r.conexion}...
                                  </div>
                                )}

                                {!isLoadingThis && errorDetalle && expandedConexion === r.conexion && (
                                  <div className="flex items-center gap-2 text-red-400 text-xs px-8 py-4">
                                    <AlertCircle size={13}/> {errorDetalle}
                                  </div>
                                )}

                                {!isLoadingThis && detalle.length === 0 && !errorDetalle && (
                                  <div className="text-slate-500 text-xs px-8 py-4">Sin incidencias registradas en este período.</div>
                                )}

                                {!isLoadingThis && detalle.length > 0 && (
                                  <div className="px-6 py-3">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 ml-2">
                                      {detalle.length} incidencia{detalle.length !== 1 ? "s" : ""} · {r.conexion}
                                    </p>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-slate-500 uppercase tracking-wider text-[10px]">
                                          <th className="text-left py-2 px-2">#</th>
                                          <th className="text-left py-2 px-2">Fecha carga</th>
                                          <th className="text-left py-2 px-2">Asignación</th>
                                          <th className="text-left py-2 px-2">Problema</th>
                                          <th className="text-left py-2 px-2">Cuadrilla</th>
                                          <th className="text-left py-2 px-2">Estado</th>
                                          <th className="text-right py-2 px-2">Días</th>
                                          <th className="text-right py-2 px-2">Fecha cierre</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detalle.map((d, j) => (
                                          <tr key={d.id_incidencia} className={`border-t border-slate-800/60 ${j % 2 === 0 ? "" : "bg-slate-800/20"}`}>
                                            <td className="py-2 px-2 text-slate-600 font-mono tabular-nums">{j + 1}</td>
                                            <td className="py-2 px-2 text-slate-400 font-mono tabular-nums whitespace-nowrap">{d.fecha_carga ?? "—"}</td>
                                            <td className="py-2 px-2 text-slate-400 font-mono tabular-nums whitespace-nowrap">{d.fecha_asignacion ?? "—"}</td>
                                            <td className="py-2 px-2 text-slate-300 max-w-[200px] truncate" title={d.problema ?? undefined}>{d.problema ?? "—"}</td>
                                            <td className="py-2 px-2 text-slate-400 whitespace-nowrap">{d.cuadrilla ?? <span className="text-slate-700">Sin asignar</span>}</td>
                                            <td className="py-2 px-2"><EstadoBadge estado={d.estado_incidencia} /></td>
                                            <td className="py-2 px-2 text-right tabular-nums">
                                              {d.dias !== null
                                                ? <span className={`font-semibold ${(d.dias ?? 0) > 7 ? "text-rose-400" : (d.dias ?? 0) > 3 ? "text-amber-400" : "text-slate-300"}`}>{d.dias}d</span>
                                                : <span className="text-slate-700">—</span>
                                              }
                                            </td>
                                            <td className="py-2 px-2 text-right text-slate-400 font-mono tabular-nums whitespace-nowrap">{d.fecha_cierre ?? <span className="text-amber-400/70 font-medium">En curso</span>}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
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
        )}

      </div>
    </div>
  );
}
