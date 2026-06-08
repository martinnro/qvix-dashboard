"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Search, X, AlertCircle, Wifi, Monitor, RefreshCw } from "lucide-react";
import { getColorById } from "./MapaUtils";

const SUCURSALES: Record<number, string> = {
  0: "Central",
  1: "Chumbicha", 4: "Valle Viejo", 5: "Tinogasta",
  6: "Rodeo", 7: "La Puerta", 8: "Fiambalá",
};

interface Conexion {
  id_conexion: number;
  estado_asignacion: number;
  fecha_asignacion: string;
  cod_sucursal: number;
  Estado_Servicio: number;
  estado_nombre: string;
}

interface StockInfo {
  cod_sucursal: number;
  cantidad_actual: number;
  fecha_carga: string;
  mac: string;
  modelo: string;
  tipo: string;
}

interface MacResult {
  mac: string;
  encontrado: boolean;
  stock: StockInfo | null;
  conexiones: Conexion[];
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

function ResultCard({ result }: { result: MacResult }) {
  if (!result.encontrado) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center space-y-2">
        <AlertCircle size={28} className="text-slate-500 mx-auto" />
        <p className="text-slate-300 font-medium">MAC no encontrada</p>
        <p className="text-slate-500 text-xs font-mono">{result.mac}</p>
      </div>
    );
  }

  const { stock, conexiones } = result;
  const activa = conexiones.find((c) => c.estado_asignacion === 0);

  return (
    <div className="space-y-4">
      {/* Dispositivo */}
      {stock && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            {stock.tipo === "ONT"
              ? <Wifi size={14} className="text-cyan-400" />
              : <Monitor size={14} className="text-violet-400" />}
            <span className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: stock.tipo === "ONT" ? "#06b6d4" : "#a855f7" }}>
              {stock.tipo}
            </span>
          </div>
          <div>
            <div className="text-white font-medium">{stock.modelo}</div>
            <div className="text-slate-400 text-xs font-mono mt-0.5">{result.mac}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700">
            <div>
              <div className="text-slate-500 text-xs">Sucursal stock</div>
              <div className="text-slate-200 text-sm font-medium">{SUCURSALES[stock.cod_sucursal] ?? stock.cod_sucursal}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Fecha carga</div>
              <div className="text-slate-200 text-sm">{fmtDate(stock.fecha_carga)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Estado</div>
              <div className={`text-sm font-medium ${activa ? "text-amber-400" : stock.cantidad_actual === 1 ? "text-emerald-400" : "text-red-400"}`}>
                {activa ? "Asignado" : stock.cantidad_actual === 1 ? "Disponible" : "Sin stock"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conexión activa */}
      {activa && (
        <div className="bg-slate-800 border border-indigo-700/50 rounded-2xl p-4 space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1">Conexión activa</div>
          {[
            ["ID Conexión", `#${activa.id_conexion}`, "font-mono"],
            ["Sucursal", SUCURSALES[activa.cod_sucursal] ?? activa.cod_sucursal, ""],
            ["Asignado el", fmtDate(activa.fecha_asignacion), ""],
          ].map(([label, value, extra]) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{label}</span>
              <span className={`text-white ${extra}`}>{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Estado servicio</span>
            <span className="flex items-center gap-1.5 text-slate-200">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getColorById(activa.Estado_Servicio) }} />
              {activa.estado_nombre}
            </span>
          </div>
        </div>
      )}

      {/* Historial */}
      {conexiones.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Historial de conexiones
            </span>
            <span className="text-xs text-slate-500">{conexiones.length} registro{conexiones.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="divide-y divide-slate-700/50 max-h-64 overflow-y-auto">
            {conexiones.map((c, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <div className={`font-mono text-xs font-medium ${c.estado_asignacion === 0 ? "text-indigo-400" : "text-white"}`}>
                    #{c.id_conexion}
                    {c.estado_asignacion === 0 && <span className="ml-2 text-indigo-300 font-sans font-normal">(activa)</span>}
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5">
                    {fmtDate(c.fecha_asignacion)} · {SUCURSALES[c.cod_sucursal] ?? c.cod_sucursal}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getColorById(c.Estado_Servicio) }} />
                  {c.estado_nombre}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MacScannerView({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [macInput, setMacInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MacResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const lookup = useCallback(async (mac: string) => {
    const clean = mac.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/mac?mac=${encodeURIComponent(clean)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Tu navegador no soporta acceso a la cámara.");
      return;
    }
    // Iniciar getUserMedia ANTES de cualquier await para mantener el contexto
    // de gesto de usuario requerido por iOS Safari
    const streamP = navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    setScanning(true);
    // Esperar que React renderice el contenedor del video (double rAF)
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      const stream = await streamP;
      streamRef.current = stream;
      if (!videoRef.current) { stopCamera(); return; }
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const decoded = await reader.decodeOnceFromStream(stream, videoRef.current);
      const text = decoded.getText();
      setMacInput(text);
      stopCamera();
      lookup(text);
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setCameraError(
        name === "NotAllowedError"
          ? "Permiso de cámara denegado."
          : "No se pudo acceder a la cámara. Verificá los permisos."
      );
      setScanning(false);
    }
  }, [lookup, stopCamera]);

  const handleReset = () => {
    setResult(null);
    setError(null);
    setMacInput("");
  };

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Rastreo de dispositivo</h2>
          <p className="text-slate-400 text-sm mt-0.5">Buscá un dispositivo por código de barras o MAC</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Volver
        </button>
      </div>

      {/* Cámara + input */}
      <div className="space-y-3">
        {/* Video preview — siempre en DOM para mantener el ref */}
        <div className={`relative rounded-2xl overflow-hidden bg-black border border-slate-700 ${scanning ? "block" : "hidden"}`}>
          <video ref={videoRef} className="w-full h-64 object-cover" autoPlay muted playsInline />
          {/* Retícula de encuadre */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-28 border-2 border-cyan-400 rounded-lg opacity-80" />
          </div>
          <button onClick={stopCamera}
            className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/80 text-slate-300 hover:text-white transition-colors">
            <X size={15} />
          </button>
          <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-slate-400">
            Apuntá al código de barras de la etiqueta MAC
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={scanning ? stopCamera : startCamera}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors flex-shrink-0 ${
              scanning
                ? "bg-red-900/30 border-red-700/50 text-red-400 hover:text-red-300"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
            }`}
          >
            <Camera size={15} />
            {scanning ? "Detener" : "Cámara"}
          </button>
          <input
            type="text"
            value={macInput}
            onChange={(e) => setMacInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup(macInput)}
            placeholder="48B25D7C8DD7"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-indigo-500 min-w-0"
          />
          <button
            onClick={() => result ? handleReset() : lookup(macInput)}
            disabled={loading || (!result && !macInput.trim())}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {loading ? <RefreshCw size={15} className="animate-spin" /> : result ? <X size={15} /> : <Search size={15} />}
          </button>
        </div>

        {cameraError && (
          <p className="text-red-400 text-xs flex items-center gap-1.5">
            <AlertCircle size={12} /> {cameraError}
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[80, 48, 120].map((h) => (
            <div key={h} style={{ height: h }} className="bg-slate-800/60 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Resultado */}
      {result && !loading && <ResultCard result={result} />}
    </div>
  );
}
