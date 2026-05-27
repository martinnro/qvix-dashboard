"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Monitor, Smartphone, Users, TrendingUp, RefreshCw, ChevronDown, Check } from "lucide-react";
import TiposServicioDonut from "./TiposServicioDonut";
import DecosChart from "./DecosChart";

interface Sucursal {
  cod_sucursal: number;
  nombre: string;
  total_clientes: number;
  total_tv: number;
  porcentaje: number;
  clientes_iptv: number;
  decos_iptv: number;
  clientes_ott: number;
  decos_ott: number;
}

interface EstadoDisponible {
  id: number;
  nombre: string;
}

interface DashboardData {
  total_clientes: number;
  total_tv: number;
  posicionamiento: number;
  con_deco: number;
  solo_app: number;
  tipos: {
    iptv: number;
    iptv_app: number;
    iptv_ott: number;
    iptv_ott_app: number;
    ott: number;
    ott_app: number;
  };
  sucursales: Sucursal[];
  estados_disponibles: EstadoDisponible[];
}

const SUCURSALES: Record<number, string> = {
  4: "Valle Viejo",
  1: "Chumbicha",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

function fmt(n: number) {
  return n.toLocaleString("es-AR");
}

export default function ClientesTVDashboard({ sucursalesPermitidas = null }: { sucursalesPermitidas?: number[] | null }) {
  const sucursalesDisponibles = sucursalesPermitidas
    ? Object.entries(SUCURSALES).filter(([cod]) => sucursalesPermitidas.includes(Number(cod)))
    : Object.entries(SUCURSALES);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estados, setEstados] = useState<number[]>([3, 6]);
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<number | null>(
    sucursalesPermitidas?.length === 1 ? sucursalesPermitidas[0] : null
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (estados.length > 0) params.set("estados", estados.join(","));
      if (sucursalSeleccionada !== null) params.set("sucursal", String(sucursalSeleccionada));
      const qs = params.toString();
      const res = await fetch(`/api/clientes-tv${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [estados, sucursalSeleccionada]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleEstado = (id: number) => {
    setEstados((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const allEstados: EstadoDisponible[] = data?.estados_disponibles.length
    ? data.estados_disponibles
    : [{ id: 3, nombre: "Conectado" }, { id: 6, nombre: "Suspendido" }];

  return (
    <div className="space-y-6">
      {/* Header del dashboard */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Dashboard Clientes</h2>
        </div>
        <div className="flex items-center gap-3">
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors"
            >
              <span className="text-slate-500 text-xs">Estados</span>
              <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-md min-w-[20px] text-center">
                {estados.length}
              </span>
              <ChevronDown size={13} className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 max-h-80 overflow-y-auto">
                <div className="flex justify-between items-center px-2 py-1.5 mb-1">
                  <span className="text-xs text-slate-500 uppercase tracking-wider">Filtrar por estado</span>
                  <button onClick={() => setEstados(allEstados.map((e) => e.id))} className="text-xs text-indigo-400 hover:text-indigo-300">Todos</button>
                </div>
                {allEstados.map((e) => (
                  <button key={e.id} onClick={() => toggleEstado(e.id)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${estados.includes(e.id) ? "bg-indigo-600 border-indigo-500" : "border-slate-600"}`}>
                      {estados.includes(e.id) && <Check size={10} className="text-white" />}
                    </div>
                    <span className={estados.includes(e.id) ? "text-white" : "text-slate-400"}>{e.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={fetchData} disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Chips de sucursal */}
      {sucursalesDisponibles.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSucursalSeleccionada(null)}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors ${
              sucursalSeleccionada === null
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
            }`}
          >
            Todas
          </button>
          {sucursalesDisponibles.map(([cod, nombre]) => (
            <button key={cod} onClick={() => setSucursalSeleccionada(Number(cod))}
              className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors ${
                sucursalSeleccionada === Number(cod)
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
              }`}
            >
              {nombre}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-400 text-sm">
          Error al cargar datos: {error}
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6 animate-pulse h-28" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center gap-4 sm:flex-col sm:items-center sm:justify-center sm:text-center">
              <div className="flex items-center gap-2 text-slate-400 text-sm sm:mb-2">
                <Users size={15} /> <span>Total Clientes</span>
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-white ml-auto sm:ml-0">{fmt(data.total_clientes)}</div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center gap-4 sm:flex-col sm:items-center sm:justify-center sm:text-center">
              <div className="flex items-center gap-2 text-slate-400 text-sm sm:mb-2">
                <Monitor size={15} /> <span>Total Clientes TV</span>
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-violet-400 ml-auto sm:ml-0">{fmt(data.total_tv)}</div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex flex-col justify-center">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <TrendingUp size={15} /> <span>Posicionamiento TV</span>
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-cyan-400">{data.posicionamiento}%</div>
              <div className="w-full mt-3 bg-slate-700 rounded-full h-1.5">
                <div className="bg-cyan-500 h-1.5 rounded-full transition-all" style={{ width: `${data.posicionamiento}%` }} />
              </div>
            </div>
          </div>

          {/* Con Deco vs Solo APP */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 sm:p-6 flex items-center gap-3 sm:gap-5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <Monitor size={20} className="text-violet-400" />
              </div>
              <div>
                <div className="text-slate-400 text-xs sm:text-sm">Con Deco (STB)</div>
                <div className="text-2xl sm:text-3xl font-bold text-white">{fmt(data.con_deco)}</div>
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 sm:p-6 flex items-center gap-3 sm:gap-5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                <Smartphone size={20} className="text-teal-400" />
              </div>
              <div>
                <div className="text-slate-400 text-xs sm:text-sm">Solo APP</div>
                <div className="text-2xl sm:text-3xl font-bold text-white">{fmt(data.solo_app)}</div>
              </div>
            </div>
          </div>

          {/* Desglose por combinación de servicios */}
          <TiposServicioDonut tipos={data.tipos} />

          {/* Desglose por modelo de deco */}
          <DecosChart estados={estados} sucursal={sucursalSeleccionada} />

          {/* Breakdown por sucursal */}
          {sucursalesDisponibles.length > 1 && <div>
            <h3 className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Por sucursal</h3>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Sucursal</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Tot. Clientes</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Clientes TV</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium w-16">%</th>
                      <th className="px-4 py-3 w-28" />
                      <th className="text-right px-3 py-3 text-violet-400 font-medium text-xs">Cli. IPTV</th>
                      <th className="text-right px-3 py-3 text-violet-400 font-medium text-xs">Decos IPTV</th>
                      <th className="text-right px-3 py-3 text-cyan-400 font-medium text-xs">Cli. OTT</th>
                      <th className="text-right px-3 py-3 text-cyan-400 font-medium text-xs">Decos OTT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sucursales.map((s, i) => (
                      <tr key={s.cod_sucursal}
                        className={`${i < data.sucursales.length - 1 ? "border-b border-slate-700/50" : ""} hover:bg-slate-700/30 transition-colors`}
                      >
                        <td className="px-4 py-3.5 font-medium text-white">{s.nombre}</td>
                        <td className="px-4 py-3.5 text-right text-slate-300">{fmt(s.total_clientes)}</td>
                        <td className="px-4 py-3.5 text-right text-violet-400 font-semibold">{fmt(s.total_tv)}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-cyan-400">{s.porcentaje}%</td>
                        <td className="px-4 py-3.5">
                          <div className="w-full bg-slate-700 rounded-full h-1.5">
                            <div className="bg-cyan-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(s.porcentaje, 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-right text-slate-300 text-sm">{fmt(s.clientes_iptv)}</td>
                        <td className="px-3 py-3.5 text-right text-violet-400 text-sm">{fmt(s.decos_iptv)}</td>
                        <td className="px-3 py-3.5 text-right text-slate-300 text-sm">{fmt(s.clientes_ott)}</td>
                        <td className="px-3 py-3.5 text-right text-cyan-400 text-sm">{fmt(s.decos_ott)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>}
        </>
      )}
    </div>
  );
}
