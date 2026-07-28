"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, ChevronLeft, X, History, ChevronDown } from "lucide-react";

const SUCURSALES: Record<number, string> = {
  0: "Central", 1: "Chumbicha", 4: "Valle Viejo",
  5: "Tinogasta", 6: "Rodeo", 7: "La Puerta", 8: "Fiambalá",
};

const ESTADOS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "1", label: "Pendiente" },
  { value: "2", label: "Asignado" },
  { value: "cerrado", label: "Cerrado / Finalizado" },
];

function estadoBadge(estado: number) {
  if (estado === 1) return <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs">Pendiente</span>;
  if (estado === 2) return <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">Asignado</span>;
  return <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 text-xs">Cerrado</span>;
}

interface RowData {
  conexion: string;
  cod_sucursal: number;
  estado_incidencia: number;
  fecha_carga: string;
  dias: number;
  mes_anio: string;
  problema: string | null;
  cuadrilla: string | null;
}

function buildUrl(filters: Filters, offset: number, all = false) {
  const p = new URLSearchParams();
  if (filters.sucursal) p.set("sucursal", filters.sucursal);
  if (filters.mesAnio) p.set("mes_anio", filters.mesAnio);
  if (filters.estado) p.set("estado", filters.estado);
  if (filters.durMin) p.set("dur_min", filters.durMin);
  if (filters.durMax) p.set("dur_max", filters.durMax);
  p.set("offset", String(offset));
  if (all) p.set("limit", "all");
  return `/api/incidencias-historial?${p.toString()}`;
}

interface Filters {
  sucursal: string;
  mesAnio: string;
  estado: string;
  durMin: string;
  durMax: string;
}

// Generate mes-año options from 2025-01 to current month
function getMesAnioOptions() {
  const opts: { value: string; label: string }[] = [{ value: "", label: "Todos" }];
  const now = new Date();
  const cur = new Date(2025, 0, 1);
  while (cur <= now) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const label = cur.toLocaleString("es-AR", { month: "long", year: "numeric" });
    opts.push({ value: `${y}-${m}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return opts.reverse();
}

const MES_ANIO_OPTIONS = getMesAnioOptions();

export default function ReclamosHistorial({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    sucursal: "",
    mesAnio: "",
    estado: "",
    durMin: "",
    durMax: "",
  });
  const [applied, setApplied] = useState<Filters>(filters);

  const fetchPage = useCallback(async (appliedFilters: Filters, newOffset: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(appliedFilters, newOffset));
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

  // Initial load
  useEffect(() => {
    fetchPage(applied, 0, true);
  }, [applied, fetchPage]);

  const applyFilters = () => {
    setApplied({ ...filters });
    setOffset(0);
  };

  const resetFilters = () => {
    const empty: Filters = { sucursal: "", mesAnio: "", estado: "", durMin: "", durMax: "" };
    setFilters(empty);
    setApplied(empty);
    setOffset(0);
  };

  const loadMore = () => fetchPage(applied, offset, false);

  const loadAll = async () => {
    setLoadingAll(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(applied, 0, true));
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
  const inputCls = "bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400 w-full";
  const selectCls = inputCls;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-xs mb-2 transition-colors">
              <ChevronLeft size={14} /> Volver al resumen
            </button>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <History size={20} className="text-indigo-400" /> Historial de Reclamos
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Todos los reclamos desde 2025 — filtrable y paginado
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <X size={15} /> Cerrar
          </button>
        </div>

        {/* Filtros */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <span className="font-medium">Filtros</span>
            <ChevronDown size={15} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>

          {showFilters && (
            <div className="px-5 pb-5 border-t border-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Mes / Año</label>
                  <select value={filters.mesAnio} onChange={(e) => setFilters((f) => ({ ...f, mesAnio: e.target.value }))} className={selectCls}>
                    {MES_ANIO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Estado</label>
                  <select value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} className={selectCls}>
                    {ESTADOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Sucursal</label>
                  <select value={filters.sucursal} onChange={(e) => setFilters((f) => ({ ...f, sucursal: e.target.value }))} className={selectCls}>
                    <option value="">Todas</option>
                    {Object.entries(SUCURSALES).map(([cod, nombre]) => (
                      <option key={cod} value={cod}>{nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Duración mínima (días)</label>
                  <input type="number" min={0} value={filters.durMin}
                    onChange={(e) => setFilters((f) => ({ ...f, durMin: e.target.value }))}
                    placeholder="0" className={inputCls} />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Duración máxima (días)</label>
                  <input type="number" min={0} value={filters.durMax}
                    onChange={(e) => setFilters((f) => ({ ...f, durMax: e.target.value }))}
                    placeholder="Sin límite" className={inputCls} />
                </div>

              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={applyFilters}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Aplicar filtros
                </button>
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
                >
                  Limpiar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Contador */}
        {!loading && !error && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              Mostrando <span className="text-slate-200 font-medium">{rows.length}</span> de{" "}
              <span className="text-slate-200 font-medium">{total.toLocaleString()}</span> reclamos
            </p>
          </div>
        )}

        {/* Tabla */}
        {rows.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700 bg-slate-900/40">
                    <th className="text-left py-3 px-4">Conexión</th>
                    <th className="text-left py-3 px-4">Sucursal</th>
                    <th className="text-left py-3 px-4">Problema</th>
                    <th className="text-left py-3 px-4">Cuadrilla</th>
                    <th className="text-left py-3 px-4">Estado</th>
                    <th className="text-left py-3 px-4">Fecha</th>
                    <th className="text-right py-3 px-4">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-slate-200">{r.conexion}</td>
                      <td className="py-2.5 px-4 text-slate-300">{SUCURSALES[r.cod_sucursal] ?? `Suc. ${r.cod_sucursal}`}</td>
                      <td className="py-2.5 px-4 text-slate-300 max-w-[200px] truncate">{r.problema ?? "—"}</td>
                      <td className="py-2.5 px-4 text-slate-400">{r.cuadrilla ?? "—"}</td>
                      <td className="py-2.5 px-4">{estadoBadge(r.estado_incidencia)}</td>
                      <td className="py-2.5 px-4 text-slate-400">{r.fecha_carga}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          r.dias >= 7 ? "bg-red-500/20 text-red-400" :
                          r.dias >= 3 ? "bg-amber-500/20 text-amber-400" :
                          "bg-emerald-500/20 text-emerald-400"
                        }`}>{r.dias}d</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Loading spinner */}
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
              className="flex items-center gap-2 px-4 py-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-sm rounded-lg transition-colors"
            >
              Cargar 50 más
            </button>
            <button
              onClick={loadAll}
              disabled={loadingAll}
              className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors disabled:opacity-50"
            >
              {loadingAll ? <Loader2 size={14} className="animate-spin" /> : null}
              Cargar todos ({(total - rows.length).toLocaleString()} restantes)
            </button>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm">Sin reclamos para los filtros seleccionados</div>
        )}

      </div>
    </div>
  );
}
