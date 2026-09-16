"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, AlertCircle, Download, RefreshCw } from "lucide-react";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

interface DetalleRow {
  id_conexion: number;
  cod_sucursal: number;
  decos_iptv: number;
  decos_ott: number;
  plan_base: string | null;
  abono_base: number;
  bonif_base: number;
  base_bonificado: number;
  tiene_hbo: number;
  hbo_bonificado: number;
  tiene_univ: number;
  univ_bonificado: number;
  tiene_futbol: number;
  futbol_bonificado: number;
  tiene_app: number;
  neto_app: number;
}
interface PackStat { tiene: number; bonificado: number; paga: number }
interface Data {
  total: number;
  decosIptvTotal: number;
  decosOttTotal: number;
  porSucursal: { cod_sucursal: number; nombre: string; cantidad: number }[];
  porPlanBase: { plan: string; cantidad: number }[];
  planBase: { conPlan: number; conBonif: number };
  hbo: PackStat;
  univ: PackStat;
  futbol: PackStat;
  app: { tiene: number; conCargo: number; sinCargo: number };
  detalle: DetalleRow[];
  detalleTotal: number;
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

// ── Tile de KPI compacto (mismo patrón que Instalaciones) ──────────────────────
function StatTile({ label, value, sublabel, color }: {
  label: string; value: string | number; sublabel?: string; color: string;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 truncate">{label}</p>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

// ── Fila de ranking ─────────────────────────────────────────────────────────
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

// ── Card de adicional (HBO / Universal / Fútbol) con split bonificado vs paga ──
function PackCard({ nombre, stat }: { nombre: string; stat: PackStat }) {
  const pctBonif = pct(stat.bonificado, stat.tiene);
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-200">{nombre}</span>
        <span className="text-xs text-slate-500">{stat.tiene} conexiones</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
        {pctBonif > 0 && <div style={{ width: `${pctBonif}%`, backgroundColor: "#10b981" }} />}
        {pctBonif < 100 && <div style={{ width: `${100 - pctBonif}%`, backgroundColor: "#f59e0b" }} />}
      </div>
      <div className="flex justify-between mt-2 text-xs">
        <span className="text-emerald-400">{stat.bonificado} bonificado ({pctBonif}%)</span>
        <span className="text-amber-400">{stat.paga} paga</span>
      </div>
    </div>
  );
}

export default function TVPlanesView({ onClose, sucursalesPermitidas }: {
  onClose: () => void; sucursalesPermitidas: number[] | null;
}) {
  const sucursalesDisponibles: number[] = sucursalesPermitidas
    ? Object.keys(SUCURSALES).map(Number).filter((c) => sucursalesPermitidas.includes(c))
    : Object.keys(SUCURSALES).map(Number);

  const [sucSel, setSucSel] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    try {
      const res = await fetch(`/api/tv-planes?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sucSel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    return `/api/export/tv-planes?${params}`;
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ArrowLeft size={18} className="cursor-pointer text-slate-400 hover:text-white transition-colors" onClick={onClose} />
            TV — Planes y Bonificaciones
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? "Cargando..." : data ? `${data.total.toLocaleString("es-AR")} conexiones` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <a href={exportUrl()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors"
            >
              <Download size={13} /> Exportar Excel
            </a>
          )}
          <button onClick={fetchData} disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filtro sucursal */}
      {sucursalesDisponibles.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSucSel(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              sucSel === null ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
            }`}
          >
            Todas
          </button>
          {sucursalesDisponibles.map((cod) => (
            <button
              key={cod}
              onClick={() => setSucSel(sucSel === cod ? null : cod)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                sucSel === cod ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
              }`}
            >
              {SUCURSALES[cod]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Cargando planes de TV…
        </div>
      )}

      {data && (
        <>
          {/* Fila 1 — KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Conexiones TV" value={data.total} color="#f8fafc" />
            <StatTile label="Decos IPTV" value={data.decosIptvTotal} color="#a855f7" />
            <StatTile label="Decos OTT" value={data.decosOttTotal} color="#06b6d4" />
            <StatTile
              label="Plan base bonificado"
              value={`${pct(data.planBase.conBonif, data.planBase.conPlan)}%`}
              sublabel={`${data.planBase.conBonif} de ${data.planBase.conPlan} con plan`}
              color="#10b981"
            />
          </div>

          {/* Fila 2 — Distribución de plan base */}
          {data.porPlanBase.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="text-slate-300 font-medium text-sm">Distribución de plan base</h3>
              {data.porPlanBase.map((r) => (
                <RankRow
                  key={r.plan}
                  label={r.plan}
                  cantidad={r.cantidad}
                  max={data.porPlanBase[0].cantidad}
                  color="#6366f1"
                  sublabel={`${pct(r.cantidad, data.planBase.conPlan)}%`}
                />
              ))}
            </div>
          )}

          {/* Fila 3 — Adicionales */}
          <div>
            <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-3">Adicionales — penetración y bonificación</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PackCard nombre="HBO+" stat={data.hbo} />
              <PackCard nombre="Universal+" stat={data.univ} />
              <PackCard nombre="Fútbol" stat={data.futbol} />
            </div>
          </div>

          {/* App GO TV — informativo, sin cargo no implica promo */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-slate-200">App GO TV</span>
            <span className="text-xs text-slate-400">
              {data.app.tiene} conexiones con la app · {data.app.conCargo} con cargo · {data.app.sinCargo} sin cargo (incluida/bundle)
            </span>
          </div>

          {/* Ranking por sucursal (solo si hay más de una) */}
          {data.porSucursal.length > 1 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="text-slate-300 font-medium text-sm">Por sucursal</h3>
              {data.porSucursal.map((s) => (
                <RankRow
                  key={s.cod_sucursal}
                  label={s.nombre}
                  cantidad={s.cantidad}
                  max={data.porSucursal[0].cantidad}
                  color="#0ea5e9"
                  sublabel={`${pct(s.cantidad, data.total)}%`}
                />
              ))}
            </div>
          )}

          {/* Detalle */}
          <div>
            <button
              onClick={() => setShowDetalle((v) => !v)}
              className="text-xs text-slate-400 hover:text-white transition-colors underline decoration-slate-600"
            >
              {showDetalle ? "Ocultar detalle" : `Ver detalle (${data.detalleTotal.toLocaleString("es-AR")} conexiones)`}
            </button>

            {showDetalle && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 mt-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                        <th className="text-left py-2 px-3">ID Conexión</th>
                        <th className="text-left py-2 px-3">Sucursal</th>
                        <th className="text-right py-2 px-3">Decos IPTV</th>
                        <th className="text-right py-2 px-3">Decos OTT</th>
                        <th className="text-left py-2 px-3">Plan base</th>
                        <th className="text-center py-2 px-3">Bonif. base</th>
                        <th className="text-center py-2 px-3">HBO+</th>
                        <th className="text-center py-2 px-3">Universal+</th>
                        <th className="text-center py-2 px-3">Fútbol</th>
                        <th className="text-center py-2 px-3">App</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.detalle.map((r) => (
                        <tr key={r.id_conexion} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                          <td className="py-2 px-3 text-slate-300">{r.id_conexion}</td>
                          <td className="py-2 px-3 text-slate-400">{SUCURSALES[r.cod_sucursal] ?? r.cod_sucursal}</td>
                          <td className="py-2 px-3 text-right text-slate-400">{r.decos_iptv}</td>
                          <td className="py-2 px-3 text-right text-slate-400">{r.decos_ott}</td>
                          <td className="py-2 px-3 text-slate-300">{r.plan_base ?? <span className="text-slate-600">—</span>}</td>
                          <td className="py-2 px-3 text-center">
                            {r.base_bonificado === 1
                              ? <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">Sí</span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <PackCell tiene={r.tiene_hbo} bonificado={r.hbo_bonificado} />
                          <PackCell tiene={r.tiene_univ} bonificado={r.univ_bonificado} />
                          <PackCell tiene={r.tiene_futbol} bonificado={r.futbol_bonificado} />
                          <td className="py-2 px-3 text-center">
                            {r.tiene_app === 1
                              ? <span className="px-2 py-0.5 rounded-full bg-slate-600/30 text-slate-300 text-xs font-semibold">{r.neto_app > 0 ? "Con cargo" : "Sin cargo"}</span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.detalleTotal >= 500 && (
                    <p className="text-xs text-slate-500 mt-3 text-center">
                      Mostrando 500 registros — filtrá por sucursal para acotar, o usá &quot;Exportar Excel&quot; para ver todo
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PackCell({ tiene, bonificado }: { tiene: number; bonificado: number }) {
  if (tiene !== 1) return <td className="py-2 px-3 text-center text-slate-600">—</td>;
  return (
    <td className="py-2 px-3 text-center">
      {bonificado === 1
        ? <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">Bonificado</span>
        : <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold">Paga</span>}
    </td>
  );
}
