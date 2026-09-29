"use client";
import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { ArrowLeft, X, Loader2, AlertCircle, Download, RefreshCw, PlusCircle, QrCode as QrCodeIcon } from "lucide-react";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

interface SolicitudRow {
  id: number;
  origen: string;
  vendedor_nombre: string | null;
  cod_sucursal: number;
  fecha_solicitud: string;
  velocidad: string | null;
  go_tv: boolean;
  titular_apellido_nombre: string;
  titular_telefono: string;
  titular_barrio: string | null;
  referencia: string | null;
  inm_lat: number | null;
  inm_lng: number | null;
}

interface Data {
  total: number;
  porOrigen: { vendedor: number; qr: number };
  conGoTv: number;
  porSucursal: { cod_sucursal: number; nombre: string; cantidad: number }[];
  rows: SolicitudRow[];
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Tile de KPI ──────────────────────────────────────────────────────────────
function StatTile({ label, value, sublabel, color }: { label: string; value: string | number; sublabel?: string; color: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 truncate">{label}</p>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

type PanelType = "qr" | null;

export default function SolicitudesConexionView({ onClose, sucursalesPermitidas }: {
  onClose: () => void; sucursalesPermitidas: number[] | null;
}) {
  const sucursalesDisponibles: number[] = sucursalesPermitidas
    ? Object.keys(SUCURSALES).map(Number).filter((c) => sucursalesPermitidas.includes(c))
    : Object.keys(SUCURSALES).map(Number);

  const [panel, setPanel] = useState<PanelType>(null);
  const [sucSel, setSucSel] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [qrSucursal, setQrSucursal] = useState<number | null>(sucursalesDisponibles[0] ?? null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    try {
      const res = await fetch(`/api/solicitudes-conexion?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sucSel]);

  useEffect(() => { if (panel === null) fetchData(); }, [panel, sucSel, fetchData]);

  useEffect(() => {
    if (panel !== "qr" || !qrSucursal) return;
    const url = `${window.location.origin}/solicitud?sucursal=${qrSucursal}`;
    QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [panel, qrSucursal]);

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    return `/api/export/solicitudes-conexion?${params}`;
  };

  const Header = ({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) => (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        {panel && (
          <button onClick={() => setPanel(null)}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mb-3"
          >
            <ArrowLeft size={15} /> Volver
          </button>
        )}
        <h2 className="text-xl font-bold text-white">{titulo}</h2>
        {subtitulo && <p className="text-slate-400 text-sm mt-0.5">{subtitulo}</p>}
      </div>
      <div className="flex items-center gap-2">
        {!panel && data && (
          <a href={exportUrl()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors">
            <Download size={13} /> Exportar Excel
          </a>
        )}
        {!panel && (
          <button onClick={fetchData} disabled={loading} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        )}
        {!panel && (
          <button onClick={onClose} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors">
            <X size={15} /> Cerrar
          </button>
        )}
      </div>
    </div>
  );

  const sucursalFiltro = sucursalesDisponibles.length > 1 && (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setSucSel(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${sucSel === null ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"}`}
      >
        Todas
      </button>
      {sucursalesDisponibles.map((cod) => (
        <button key={cod} onClick={() => setSucSel(cod)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${sucSel === cod ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"}`}
        >
          {SUCURSALES[cod]}
        </button>
      ))}
    </div>
  );

  // "Nueva solicitud" abre /solicitud (el mismo formulario que ve el cliente) en una pestaña
  // nueva — como el vendedor ya tiene sesión activa en este navegador, el endpoint la atribuye
  // a su usuario igual que si la hubiera cargado dentro del panel.
  const abrirNuevaSolicitud = () => {
    const params = sucursalesDisponibles.length === 1 ? `?sucursal=${sucursalesDisponibles[0]}` : "";
    window.open(`/solicitud${params}`, "_blank", "noopener,noreferrer");
  };

  // ══════════════════════════ Pantalla: generar QR ═════════════════════════
  if (panel === "qr") {
    const url = qrSucursal ? `${typeof window !== "undefined" ? window.location.origin : ""}/solicitud?sucursal=${qrSucursal}` : "";
    return (
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Header titulo="Generar QR de sucursal" />
        <div className="max-w-md mx-auto bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4 text-center">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 text-left">Sucursal</label>
            <select value={qrSucursal ?? ""} onChange={(e) => setQrSucursal(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {sucursalesDisponibles.map((cod) => <option key={cod} value={cod}>{SUCURSALES[cod]}</option>)}
            </select>
          </div>
          {qrDataUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt={`QR sucursal ${qrSucursal ? SUCURSALES[qrSucursal] : ""}`} className="mx-auto rounded-lg border border-slate-700" style={{ width: 260, height: 260 }} />
              <p className="text-xs text-slate-500 break-all">{url}</p>
              <a href={qrDataUrl} download={`qr-solicitud-${qrSucursal ? SUCURSALES[qrSucursal] : "sucursal"}.png`}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Download size={15} /> Descargar QR
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════ Pantalla principal ════════════════════════════
  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <Header titulo="Solicitudes de Conexión" subtitulo="Preventas cargadas por vendedores o por QR" />

      {sucursalFiltro}

      <div className="flex flex-wrap gap-2">
        <button onClick={abrirNuevaSolicitud} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          <PlusCircle size={15} /> Nueva solicitud
        </button>
        <button onClick={() => setPanel("qr")} className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          <QrCodeIcon size={15} /> Generar QR
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-900 text-rose-300 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatTile label="Total" value={data.total.toLocaleString("es-AR")} color="#f8fafc" />
            <StatTile label="Internet" value={(data.total - data.conGoTv).toLocaleString("es-AR")} color="#38bdf8" />
            <StatTile label="Doble Play" value={data.conGoTv.toLocaleString("es-AR")} color="#f59e0b" />
            <StatTile label="Por vendedor" value={data.porOrigen.vendedor.toLocaleString("es-AR")} color="#818cf8" />
            <StatTile label="Por QR" value={data.porOrigen.qr.toLocaleString("es-AR")} color="#a855f7" />
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <th className="py-2 px-3 font-medium text-left">Fecha</th>
                    <th className="py-2 px-3 font-medium text-left">Origen</th>
                    <th className="py-2 px-3 font-medium text-left">Titular</th>
                    <th className="py-2 px-3 font-medium text-left">Teléfono</th>
                    <th className="py-2 px-3 font-medium text-left">Sucursal</th>
                    <th className="py-2 px-3 font-medium text-left">Barrio</th>
                    <th className="py-2 px-3 font-medium text-center">Servicios</th>
                    <th className="py-2 px-3 font-medium text-center">Ubicación</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-700/20">
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{fmtFecha(r.fecha_solicitud)}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.origen === "vendedor" ? "bg-indigo-500/20 text-indigo-300" : "bg-purple-500/20 text-purple-300"}`}>
                          {r.origen === "vendedor" ? (r.vendedor_nombre ?? "Vendedor") : "QR"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-200 whitespace-nowrap">{r.titular_apellido_nombre}</td>
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{r.titular_telefono}</td>
                      <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{SUCURSALES[r.cod_sucursal] ?? r.cod_sucursal}</td>
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{r.titular_barrio ?? "—"}</td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {r.velocidad && <span className="text-emerald-400">{r.velocidad}</span>}
                        {r.velocidad && r.go_tv && " · "}
                        {r.go_tv && <span className="text-amber-400">GO TV</span>}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {r.inm_lat !== null && r.inm_lng !== null ? (
                          <a href={`https://www.google.com/maps?q=${r.inm_lat},${r.inm_lng}`} target="_blank" rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                          >
                            Ver en mapa
                          </a>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-8">Todavía no hay solicitudes cargadas.</p>
              )}
              {data.total > 500 && (
                <p className="text-center text-slate-500 text-xs py-3">
                  Mostrando 500 de {data.total.toLocaleString("es-AR")} — exportá a Excel para ver el listado completo.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
