"use client";
import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Tv, ChevronUp, ChevronDown, CheckCircle2, Clock } from "lucide-react";

interface BajaRow {
  conexion: number;
  nombre: string;
  cod_sucursal: number;
  concepto_tv: string;
  fecha_baja: string;
}

interface LoteHistorial {
  lote_mes: string;
  fecha_cierre: string;
  total: number;
  guardado_por: string;
}

const SUCS: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

type SortKey = keyof BajaRow;

interface Props {
  onClose: () => void;
}

export default function BajasQvixView({ onClose }: Props) {
  const [rows, setRows] = useState<BajaRow[]>([]);
  const [lotes, setLotes] = useState<LoteHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generado, setGenerado] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("fecha_baja");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSuc, setFilterSuc] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    fetch("/api/tv-bajas-qvix")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setRows(d.rows ?? []);
        setLotes(d.lotes ?? []);
        setGenerado(d.generado ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const sorted = useMemo(() => {
    const q = search.toLowerCase();
    let filtered = rows.filter((r) => {
      if (q && !String(r.conexion).includes(q) && !r.nombre.toLowerCase().includes(q)) return false;
      if (filterSuc !== "" && r.cod_sucursal !== filterSuc) return false;
      return true;
    });
    filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [rows, search, filterSuc, sortKey, sortAsc]);

  const totalCount = rows.length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const cerrarLote = async () => {
    if (!rows.length) return;
    const ok = confirm(`¿Cerrar lote con ${rows.length} conexiones? Quedarán registradas y no aparecerán el mes que viene.`);
    if (!ok) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/tv-bajas-qvix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg({ ok: false, text: data.error ?? "Error al guardar" });
      } else {
        setSaveMsg({ ok: true, text: `Lote ${data.lote_mes} guardado — ${data.insertados} conexiones registradas.` });
        fetchData();
      }
    } catch (e: unknown) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const Th = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-white transition-colors"
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === col ? (
          sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ChevronDown size={12} className="opacity-20" />
        )}
      </span>
    </th>
  );

  const loteDate = generado
    ? new Date(generado).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm"
        >
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="flex items-center gap-2">
          <Tv size={20} className="text-rose-400" />
          <h1 className="text-lg font-bold text-white">Bajas QVIX</h1>
        </div>
      </div>

      {/* Historial de lotes */}
      {lotes.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Lotes cerrados</p>
          <div className="flex flex-wrap gap-3">
            {lotes.map((l) => (
              <div key={l.lote_mes} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-white">{l.lote_mes}</p>
                  <p className="text-xs text-slate-400">{l.total.toLocaleString()} conexiones · {l.fecha_cierre}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lote actual */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-amber-400" />
            <p className="text-xs text-slate-500 uppercase tracking-wider">Lote pendiente</p>
          </div>
          <p className="text-2xl font-bold text-white">{loteDate}</p>
          <p className="text-sm text-slate-400 mt-1">
            Nuevas bajas de TV no registradas en lotes anteriores
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-rose-400">{loading ? "…" : totalCount.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">Conexiones</p>
          </div>
          <button
            onClick={cerrarLote}
            disabled={saving || loading || totalCount === 0}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {saving ? "Guardando…" : "Cerrar lote"}
          </button>
        </div>
      </div>

      {saveMsg && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${saveMsg.ok ? "bg-emerald-900/30 border-emerald-700 text-emerald-300" : "bg-red-900/30 border-red-700 text-red-300"}`}>
          {saveMsg.text}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar conexión o nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 w-56"
        />
        <select
          value={filterSuc}
          onChange={(e) => setFilterSuc(e.target.value === "" ? "" : Number(e.target.value))}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-slate-500"
        >
          <option value="">Todas las sucursales</option>
          {Object.entries(SUCS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(search || filterSuc !== "") && (
          <span className="self-center text-xs text-slate-400">
            {sorted.length} de {totalCount}
          </span>
        )}
      </div>

      {/* Tabla */}
      {loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-rose-400 border-t-transparent rounded-full" />
        </div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 border-b border-slate-800">
              <tr>
                <Th label="Conexión" col="conexion" />
                <Th label="Nombre" col="nombre" />
                <Th label="Sucursal" col="cod_sucursal" />
                <Th label="Concepto TV" col="concepto_tv" />
                <Th label="Fecha baja" col="fecha_baja" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.conexion} className="border-b border-slate-800/60 hover:bg-slate-900/60 transition-colors">
                  <td className="px-3 py-2 font-mono text-slate-300">{r.conexion}</td>
                  <td className="px-3 py-2 text-white">{r.nombre}</td>
                  <td className="px-3 py-2 text-slate-400">{SUCS[r.cod_sucursal] ?? r.cod_sucursal}</td>
                  <td className="px-3 py-2 text-slate-400">{r.concepto_tv}</td>
                  <td className="px-3 py-2 text-slate-400 font-mono">{r.fecha_baja}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">
              {totalCount === 0 ? "No hay bajas nuevas — todos los casos ya están registrados en lotes anteriores." : "Sin resultados"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
