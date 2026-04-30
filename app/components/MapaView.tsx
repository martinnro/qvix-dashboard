"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, ChevronDown, Check, Wifi } from "lucide-react";
import { getColorById, type MapStyle, type NapItem } from "./MapaUtils";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), { ssr: false });

const SUCURSALES: Record<number, string> = {
  4: "Valle Viejo",
  1: "Chumbicha",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

interface Punto {
  id_conexion: number;
  Estado_Servicio: number;
  estado_nombre: string;
  latitud: number;
  longitud: number;
}

interface Barrio {
  cod_barrio: number;
  nombre_barrio: string;
}

interface EstadoOpt {
  id: number;
  nombre: string;
}

const ESTADOS_DEFAULT: EstadoOpt[] = [
  { id: 3, nombre: "Conectado" },
  { id: 6, nombre: "Suspendido" },
];

export default function MapaView({ onClose }: { onClose: () => void }) {
  const [sucursal, setSucursal]     = useState<number>(4);
  const [estados, setEstados]       = useState<number[]>([3, 6]);
  const [barrios, setBarrios]       = useState<Barrio[]>([]);
  const [barriosSel, setBarriosSel] = useState<number[]>([]);
  const [puntos, setPuntos]         = useState<Punto[]>([]);
  const [naps, setNaps]             = useState<NapItem[]>([]);
  const [showNaps, setShowNaps]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [estadosOpts, setEstadosOpts] = useState<EstadoOpt[]>(ESTADOS_DEFAULT);

  const mapStyle: MapStyle = "satellite-labels";
  const [barrioOpen, setBarrioOpen]   = useState(false);
  const [estadoOpen, setEstadoOpen]   = useState(false);
  const barrioRef = useRef<HTMLDivElement>(null);
  const estadoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barrioRef.current && !barrioRef.current.contains(e.target as Node)) setBarrioOpen(false);
      if (estadoRef.current && !estadoRef.current.contains(e.target as Node)) setEstadoOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cargar estados disponibles
  useEffect(() => {
    fetch("/api/clientes-tv?estados=3,6")
      .then((r) => r.json())
      .then((d) => { if (d.estados_disponibles?.length) setEstadosOpts(d.estados_disponibles); })
      .catch(() => {});
  }, []);

  // Cargar barrios y NAPs al cambiar sucursal
  useEffect(() => {
    setBarriosSel([]);
    fetch(`/api/barrios?sucursal=${sucursal}`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) ? setBarrios(d) : setBarrios([]))
      .catch(() => setBarrios([]));

    fetch(`/api/naps?sucursal=${sucursal}`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) ? setNaps(d) : setNaps([]))
      .catch(() => setNaps([]));
  }, [sucursal]);

  const fetchPuntos = useCallback(async () => {
    if (estados.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("sucursal", String(sucursal));
      params.set("estados", estados.join(","));
      if (barriosSel.length > 0) params.set("barrios", barriosSel.join(","));
      const res = await fetch(`/api/mapa?${params.toString()}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPuntos(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sucursal, estados, barriosSel]);

  useEffect(() => { fetchPuntos(); }, [fetchPuntos]);

  const toggleEstado = (id: number) =>
    setEstados((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);

  const toggleBarrio = (id: number) =>
    setBarriosSel((prev) => prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Mapa de conexiones</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? "Cargando..." : `${puntos.length.toLocaleString("es-AR")} conexiones`}
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Volver
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* Sucursal */}
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 overflow-x-auto max-w-full">
          {Object.entries(SUCURSALES).map(([cod, nombre]) => (
            <button
              key={cod}
              onClick={() => setSucursal(Number(cod))}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                sucursal === Number(cod)
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {nombre}
            </button>
          ))}
        </div>

        {/* Estados dropdown */}
        <div ref={estadoRef} className="relative">
          <button
            onClick={() => setEstadoOpen((v) => !v)}
            className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors"
          >
            <span className="text-slate-500 text-xs">Estado</span>
            <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-md min-w-[20px] text-center">
              {estados.length}
            </span>
            <ChevronDown size={13} className={`text-slate-400 transition-transform ${estadoOpen ? "rotate-180" : ""}`} />
          </button>
          {estadoOpen && (
            <div className="absolute left-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 max-h-72 overflow-y-auto">
              <div className="flex justify-between items-center px-2 py-1.5 mb-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Estado</span>
                <button onClick={() => setEstados(estadosOpts.map((e) => e.id))} className="text-xs text-indigo-400 hover:text-indigo-300">Todos</button>
              </div>
              {estadosOpts.map((e) => (
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

        {/* Barrios dropdown */}
        <div ref={barrioRef} className="relative">
          <button
            onClick={() => setBarrioOpen((v) => !v)}
            className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors"
          >
            <span className="text-slate-500 text-xs">Barrio</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md min-w-[20px] text-center ${barriosSel.length > 0 ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-400"}`}>
              {barriosSel.length > 0 ? barriosSel.length : "Todos"}
            </span>
            <ChevronDown size={13} className={`text-slate-400 transition-transform ${barrioOpen ? "rotate-180" : ""}`} />
          </button>
          {barrioOpen && (
            <div className="absolute left-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 max-h-72 overflow-y-auto">
              <div className="flex justify-between items-center px-2 py-1.5 mb-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Barrio</span>
                <button onClick={() => setBarriosSel([])} className="text-xs text-indigo-400 hover:text-indigo-300">Todos</button>
              </div>
              {barrios.map((b) => (
                <button key={b.cod_barrio} onClick={() => toggleBarrio(b.cod_barrio)}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm hover:bg-slate-800 transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${barriosSel.includes(b.cod_barrio) ? "bg-indigo-600 border-indigo-500" : "border-slate-600"}`}>
                    {barriosSel.includes(b.cod_barrio) && <Check size={10} className="text-white" />}
                  </div>
                  <span className={barriosSel.includes(b.cod_barrio) ? "text-white" : "text-slate-400"}>{b.nombre_barrio}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Toggle NAPs */}
        <button
          onClick={() => setShowNaps((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
            showNaps
              ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
        >
          <Wifi size={14} className="flex-shrink-0" />
          NAPs {naps.length > 0 && <span className="text-xs opacity-70">({naps.length})</span>}
        </button>

        <button onClick={fetchPuntos} disabled={loading}
          className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Leyenda dinámica según estados seleccionados */}
      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
        {estadosOpts
          .filter((e) => estados.includes(e.id))
          .map((e) => (
            <div key={e.id} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getColorById(e.id) }} />
              {e.nombre}
            </div>
          ))}
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {/* Mapa */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden" style={{ height: "600px" }}>
        <MapaLeaflet puntos={puntos} mapStyle={mapStyle} naps={naps} showNaps={showNaps} />
      </div>
    </div>
  );
}
