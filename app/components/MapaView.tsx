"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, ChevronDown, Check, Wifi, MapPin, Plus, Trash2, X, Loader2 } from "lucide-react";
import { getColorById, type MapStyle, type NapItem } from "./MapaUtils";
import type { PinCustom } from "./MapaLeaflet";

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
  nap: string | null;
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

const TITULOS_PRESET = [
  "Nodo No operativo",
  "Sin señal",
  "Corte de fibra",
  "En mantenimiento",
  "Cliente sin servicio",
];

const COLORES_PRESET = [
  { label: "Naranja", value: "#f97316" },
  { label: "Rojo", value: "#ef4444" },
  { label: "Amarillo", value: "#eab308" },
  { label: "Azul", value: "#3b82f6" },
  { label: "Violeta", value: "#a855f7" },
];

export default function MapaView({ onClose, sucursalesPermitidas = null }: { onClose: () => void; sucursalesPermitidas?: number[] | null }) {
  const sucursalesDisponibles = sucursalesPermitidas
    ? Object.entries(SUCURSALES).filter(([cod]) => sucursalesPermitidas.includes(Number(cod)))
    : Object.entries(SUCURSALES);

  const [sucursal, setSucursal] = useState<number>(
    sucursalesPermitidas ? (sucursalesPermitidas[0] ?? 4) : 4
  );
  const [estados, setEstados]       = useState<number[]>([3, 6]);
  const [barrios, setBarrios]       = useState<Barrio[]>([]);
  const [barriosSel, setBarriosSel] = useState<number[]>([]);
  const [puntos, setPuntos]         = useState<Punto[]>([]);
  const [naps, setNaps]             = useState<NapItem[]>([]);
  const [showNaps, setShowNaps]     = useState(false);
  const [napSelName, setNapSelName] = useState<string | null>(null);
  const napSelInfo = naps.find((n) => n.nap === napSelName) ?? null;
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [estadosOpts, setEstadosOpts] = useState<EstadoOpt[]>(ESTADOS_DEFAULT);

  // Pines custom
  const [pinesCustom, setPinesCustom]       = useState<PinCustom[]>([]);
  const [activeTitulos, setActiveTitulos]   = useState<string[]>([]);
  const [showPinesPanel, setShowPinesPanel] = useState(false);
  const [showAddPin, setShowAddPin]           = useState(false);
  const [pinForm, setPinForm] = useState({
    url: "", titulo: TITULOS_PRESET[0], cx: "", abonado: "", barrio: "", color: COLORES_PRESET[0].value,
  });
  const [resolving, setResolving]   = useState(false);
  const [pinError, setPinError]     = useState("");

  const mapStyle: MapStyle = "satellite-labels";
  const [barrioOpen, setBarrioOpen]   = useState(false);
  const [estadoOpen, setEstadoOpen]   = useState(false);
  const barrioRef = useRef<HTMLDivElement>(null);
  const estadoRef = useRef<HTMLDivElement>(null);
  const pinesPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barrioRef.current && !barrioRef.current.contains(e.target as Node)) setBarrioOpen(false);
      if (estadoRef.current && !estadoRef.current.contains(e.target as Node)) setEstadoOpen(false);
      if (pinesPanelRef.current && !pinesPanelRef.current.contains(e.target as Node)) {
        setShowPinesPanel(false);
        setShowAddPin(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    fetch("/api/clientes-tv?estados=3,6")
      .then((r) => r.json())
      .then((d) => { if (d.estados_disponibles?.length) setEstadosOpts(d.estados_disponibles); })
      .catch(() => {});
  }, []);

  const loadPines = useCallback(() => {
    fetch("/api/pines-custom")
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d)) return;
        setPinesCustom(d);
        // Inicializar todos los títulos únicos como activos
        const titulos = [...new Set(d.map((p: PinCustom) => p.titulo))] as string[];
        setActiveTitulos(titulos);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadPines(); }, [loadPines]);

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

  const addPin = async () => {
    if (!pinForm.url) { setPinError("Pegá el link de Google Maps."); return; }
    setResolving(true);
    setPinError("");
    try {
      const res = await fetch("/api/resolve-gmaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pinForm.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al resolver el link.");
      await fetch("/api/pines-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: pinForm.titulo,
          cx: pinForm.cx,
          abonado: pinForm.abonado,
          barrio: pinForm.barrio,
          color: pinForm.color,
          sucursal,
          lat: data.lat,
          lng: data.lng,
          url_origen: pinForm.url,
        }),
      });
      loadPines();
      setPinForm({ url: "", titulo: TITULOS_PRESET[0], cx: "", abonado: "", barrio: "", color: COLORES_PRESET[0].value });
      setShowAddPin(false);
    } catch (e) {
      setPinError((e as Error).message);
    } finally {
      setResolving(false);
    }
  };

  const deletePin = async (id: string) => {
    await fetch("/api/pines-custom", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadPines();
  };

  const pinesDeSucursal   = pinesCustom.filter((p) => p.sucursal === sucursal);
  const pinesFiltrados    = pinesDeSucursal.filter((p) => activeTitulos.includes(p.titulo));
  const titulosUnicos     = [...new Set(pinesDeSucursal.map((p) => p.titulo))];
  const colorPorTitulo    = (titulo: string) => pinesDeSucursal.find((p) => p.titulo === titulo)?.color ?? "#94a3b8";
  const toggleTitulo      = (t: string) =>
    setActiveTitulos((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

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
          {sucursalesDisponibles.map(([cod, nombre]) => (
            <button
              key={cod}
              onClick={() => setSucursal(Number(cod))}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                sucursal === Number(cod) ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {nombre}
            </button>
          ))}
        </div>

        {/* Estados */}
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

        {/* Barrios */}
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

        {/* NAPs */}
        <button
          onClick={() => setShowNaps((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
            showNaps ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
        >
          <Wifi size={14} /> NAPs {naps.length > 0 && <span className="text-xs opacity-70">({naps.length})</span>}
        </button>

        {/* Pines custom */}
        <div ref={pinesPanelRef} className="relative">
          <button
            onClick={() => { setShowPinesPanel((v) => !v); setShowAddPin(false); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              pinesFiltrados.length > 0
                ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            <MapPin size={14} />
            Pines
            {pinesDeSucursal.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-md">
                {pinesFiltrados.length}/{pinesDeSucursal.length}
              </span>
            )}
          </button>

          {showPinesPanel && (
            <div className="absolute left-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 uppercase tracking-wider">Pines en {SUCURSALES[sucursal]}</span>
                <button
                  onClick={() => setShowAddPin((v) => !v)}
                  className="flex items-center gap-1 text-xs bg-orange-600 hover:bg-orange-500 text-white px-2 py-1 rounded-lg transition-colors"
                >
                  <Plus size={11} /> Agregar
                </button>
              </div>

              {/* Toggles por tipo */}
              {titulosUnicos.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {titulosUnicos.map((titulo) => {
                    const count = pinesDeSucursal.filter((p) => p.titulo === titulo).length;
                    const activo = activeTitulos.includes(titulo);
                    return (
                      <button
                        key={titulo}
                        onClick={() => toggleTitulo(titulo)}
                        className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs transition-colors border ${
                          activo ? "border-slate-600 bg-slate-800/60" : "border-slate-800 bg-slate-900 opacity-50"
                        }`}
                      >
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colorPorTitulo(titulo) }} />
                        <span className="flex-1 text-left text-slate-200">{titulo}</span>
                        <span className="text-slate-400 font-medium">{count}</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${activo ? "bg-orange-600 border-orange-500" : "border-slate-600"}`}>
                          {activo && <Check size={9} className="text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Formulario agregar */}
              {showAddPin && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2.5">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Link de Google Maps</label>
                    <input
                      type="text"
                      value={pinForm.url}
                      onChange={(e) => setPinForm((f) => ({ ...f, url: e.target.value }))}
                      placeholder="https://maps.app.goo.gl/..."
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Título</label>
                    <select
                      value={pinForm.titulo}
                      onChange={(e) => setPinForm((f) => ({ ...f, titulo: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                    >
                      {TITULOS_PRESET.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">CX Abonado</label>
                      <input
                        type="text"
                        value={pinForm.cx}
                        onChange={(e) => setPinForm((f) => ({ ...f, cx: e.target.value }))}
                        placeholder="26640"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Color</label>
                      <div className="flex gap-1.5 mt-1">
                        {COLORES_PRESET.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => setPinForm((f) => ({ ...f, color: c.value }))}
                            style={{ backgroundColor: c.value }}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${pinForm.color === c.value ? "border-white scale-110" : "border-transparent"}`}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Abonado</label>
                    <input
                      type="text"
                      value={pinForm.abonado}
                      onChange={(e) => setPinForm((f) => ({ ...f, abonado: e.target.value }))}
                      placeholder="Apellido, Nombre"
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Barrio</label>
                    <input
                      type="text"
                      value={pinForm.barrio}
                      onChange={(e) => setPinForm((f) => ({ ...f, barrio: e.target.value }))}
                      placeholder="Santa Rosa 30 VV."
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  {pinError && <p className="text-xs text-red-400">{pinError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setShowAddPin(false); setPinError(""); }}
                      className="flex-1 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-700 transition-colors">
                      Cancelar
                    </button>
                    <button onClick={addPin} disabled={resolving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 transition-colors">
                      {resolving ? <><Loader2 size={11} className="animate-spin" /> Resolviendo...</> : <><Check size={11} /> Guardar</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de pines */}
              {pinesDeSucursal.length === 0 && !showAddPin && (
                <p className="text-xs text-slate-600 text-center py-2">Sin pines en esta sucursal</p>
              )}
              {pinesDeSucursal.map((pin) => (
                <div key={pin.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pin.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{pin.titulo}</p>
                    {pin.abonado && <p className="text-xs text-slate-500 truncate">{pin.cx && `CX ${pin.cx} · `}{pin.abonado}</p>}
                  </div>
                  <button onClick={() => deletePin(pin.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={fetchPuntos} disabled={loading}
          className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-3 flex-wrap">
        {estadosOpts.filter((e) => estados.includes(e.id)).map((e) => {
          const count = puntos.filter((p) => p.Estado_Servicio === e.id).length;
          return (
            <div key={e.id} className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getColorById(e.id) }} />
              <span className="text-xs text-slate-400">{e.nombre}</span>
              <span className="text-xs font-bold text-white">{count.toLocaleString("es-AR")}</span>
            </div>
          );
        })}
        {titulosUnicos.map((titulo) => {
          const count = pinesDeSucursal.filter((p) => p.titulo === titulo).length;
          const activo = activeTitulos.includes(titulo);
          return (
            <button
              key={titulo}
              onClick={() => toggleTitulo(titulo)}
              className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 transition-colors ${
                activo ? "bg-slate-800 border-slate-700" : "bg-slate-900 border-slate-800 opacity-40"
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorPorTitulo(titulo) }} />
              <span className="text-xs text-slate-400">{titulo}</span>
              <span className="text-xs font-bold text-white">{count}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {/* Mapa */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden relative" style={{ height: "600px" }}>
        <MapaLeaflet
          puntos={puntos}
          mapStyle={mapStyle}
          naps={naps}
          showNaps={showNaps}
          pinesCustom={pinesFiltrados}
          showPinesCustom={true}
          onNapSelect={setNapSelName}
        />

        {/* Panel info NAP seleccionado */}
        {napSelInfo && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/95 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white shadow-xl min-w-[160px]">
            <div className="flex items-center justify-between gap-4 mb-1">
              <span className="font-bold text-base">{napSelInfo.nap}</span>
              <button onClick={() => { setNapSelName(null); }} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>
            {napSelInfo.fibra && <p className="text-slate-400 text-xs">Fibra: {napSelInfo.fibra}</p>}
            <p className="text-slate-300 text-xs">Conexiones: <span className="font-semibold text-white">{napSelInfo.cantidad}</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
