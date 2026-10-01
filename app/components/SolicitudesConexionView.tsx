"use client";
import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { ArrowLeft, X, Loader2, AlertCircle, Download, RefreshCw, PlusCircle, QrCode as QrCodeIcon, DollarSign, Pencil, Trash2, Film, Box, Monitor } from "lucide-react";
import ConfirmModal from "./ConfirmModal";

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
  precio: number | null;
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

function pesos(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
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

type PanelType = "qr" | "planes" | null;

type TipoPlan = "internet" | "doble_play";

const ICONOS_ITEM = ["film", "box", "monitor"] as const;
type IconoItem = (typeof ICONOS_ITEM)[number];

interface PlanItem {
  icono: IconoItem;
  titulo: string;
  texto: string;
}

interface PlanConexion {
  id: number;
  nombre: string;
  precio: number;
  orden: number;
  tipo: TipoPlan;
  incluye: PlanItem[];
}

const TIPO_PLAN_LABEL: Record<TipoPlan, string> = {
  doble_play: "Doble Play (Internet + TV)",
  internet: "Solo Internet",
};

const ICONO_COMPONENTE: Record<IconoItem, React.ComponentType<{ size?: number; className?: string }>> = {
  film: Film, box: Box, monitor: Monitor,
};
const ICONO_LABEL: Record<IconoItem, string> = {
  film: "Premium/Películas", box: "Dispositivo", monitor: "Pantallas",
};
// Al elegir un ícono se autocompletan título y texto — siempre se repiten los mismos 3 ítems.
const ICONO_PRESET: Record<IconoItem, { titulo: string; texto: string }> = {
  film: { titulo: "Pack Premium", texto: "HBO, Universal y Fútbol" },
  box: { titulo: "1 Dispositivo", texto: "Smart TV Box" },
  monitor: { titulo: "3 Pantallas", texto: "Go TV Android" },
};

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

  const [qrSucursal, setQrSucursal] = useState<number | "universal" | null>(sucursalesDisponibles[0] ?? null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [planes, setPlanes] = useState<PlanConexion[] | null>(null);
  const [planesLoading, setPlanesLoading] = useState(false);
  const [planesError, setPlanesError] = useState<string | null>(null);
  const [editando, setEditando] = useState<PlanConexion | "nuevo" | null>(null);
  const [formPlan, setFormPlan] = useState<{ nombre: string; precio: string; orden: string; tipo: TipoPlan; items: PlanItem[] }>({ nombre: "", precio: "", orden: "", tipo: "internet", items: [] });
  const [guardandoPlan, setGuardandoPlan] = useState(false);
  const [aBorrar, setABorrar] = useState<PlanConexion | null>(null);

  const fetchPlanes = useCallback(async () => {
    setPlanesLoading(true);
    setPlanesError(null);
    try {
      const res = await fetch("/api/planes-conexion");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPlanes(json.planes);
    } catch (e: unknown) {
      setPlanesError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanesLoading(false);
    }
  }, []);

  useEffect(() => { if (panel === "planes") fetchPlanes(); }, [panel, fetchPlanes]);

  const abrirEdicionPlan = (plan: PlanConexion | "nuevo", tipoDefault: TipoPlan = "internet") => {
    setEditando(plan);
    setFormPlan(
      plan === "nuevo"
        ? { nombre: "", precio: "", orden: String((planes?.filter((p) => p.tipo === tipoDefault).length ?? 0) + 1), tipo: tipoDefault, items: [] }
        : { nombre: plan.nombre, precio: String(plan.precio), orden: String(plan.orden), tipo: plan.tipo, items: plan.incluye }
    );
  };

  const agregarItem = () => setFormPlan((f) => ({ ...f, items: [...f.items, { icono: ICONOS_ITEM[0], ...ICONO_PRESET[ICONOS_ITEM[0]] }] }));
  const quitarItem = (i: number) => setFormPlan((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const actualizarItem = (i: number, patch: Partial<PlanItem>) =>
    setFormPlan((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  const elegirIconoItem = (i: number, icono: IconoItem) => actualizarItem(i, { icono, ...ICONO_PRESET[icono] });

  const guardarPlan = async () => {
    if (!formPlan.nombre.trim()) return setPlanesError("Falta el nombre del plan");
    const precioNum = Number(formPlan.precio);
    if (!Number.isFinite(precioNum) || precioNum < 0) return setPlanesError("Precio inválido");

    setGuardandoPlan(true);
    setPlanesError(null);
    try {
      const body = {
        nombre: formPlan.nombre.trim(),
        precio: precioNum,
        orden: Number(formPlan.orden) || 0,
        tipo: formPlan.tipo,
        incluye: formPlan.items.filter((it) => it.titulo.trim()),
      };
      const res = await fetch("/api/planes-conexion", {
        method: editando === "nuevo" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editando === "nuevo" ? body : { ...body, id: (editando as PlanConexion).id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setEditando(null);
      await fetchPlanes();
    } catch (e: unknown) {
      setPlanesError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoPlan(false);
    }
  };

  const borrarPlan = async () => {
    if (!aBorrar) return;
    try {
      const res = await fetch("/api/planes-conexion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: aBorrar.id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setABorrar(null);
      await fetchPlanes();
    } catch (e: unknown) {
      setPlanesError(e instanceof Error ? e.message : String(e));
      setABorrar(null);
    }
  };

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
    const url = qrSucursal === "universal"
      ? `${window.location.origin}/solicitud`
      : `${window.location.origin}/solicitud?sucursal=${qrSucursal}`;
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
    const url = !qrSucursal ? "" : qrSucursal === "universal"
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/solicitud`
      : `${typeof window !== "undefined" ? window.location.origin : ""}/solicitud?sucursal=${qrSucursal}`;
    const nombreQr = qrSucursal === "universal" ? "Todas las localidades" : qrSucursal ? SUCURSALES[qrSucursal] : "";
    return (
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Header titulo="Generar QR de sucursal" />
        <div className="max-w-md mx-auto bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4 text-center">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 text-left">Sucursal</label>
            <select value={qrSucursal ?? ""} onChange={(e) => setQrSucursal(e.target.value === "universal" ? "universal" : e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {sucursalesDisponibles.map((cod) => <option key={cod} value={cod}>{SUCURSALES[cod]}</option>)}
              <option value="universal">Todas (QR universal — elige localidad en el form)</option>
            </select>
          </div>
          {qrDataUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt={`QR ${nombreQr}`} className="mx-auto rounded-lg border border-slate-700" style={{ width: 260, height: 260 }} />
              <p className="text-xs text-slate-500 break-all">{url}</p>
              <a href={qrDataUrl} download={`qr-solicitud-${nombreQr.replace(/\s+/g, "-").toLowerCase() || "sucursal"}.png`}
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

  // ══════════════════════════ Pantalla: gestionar planes ═══════════════════
  if (panel === "planes") {
    return (
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Header titulo="Planes de conexión" subtitulo="Velocidades y precios que ve el cliente en el formulario" />

        {planesError && (
          <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-900 text-rose-300 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {planesError}
          </div>
        )}

        {planesLoading && !planes && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Cargando planes…
          </div>
        )}

        {planes && (["doble_play", "internet"] as TipoPlan[]).map((tipo) => {
          const planesTipo = planes.filter((p) => p.tipo === tipo);
          return (
            <div key={tipo} className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-slate-200 font-semibold text-sm">{TIPO_PLAN_LABEL[tipo]}</h3>
                <button onClick={() => abrirEdicionPlan("nuevo", tipo)} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                  <PlusCircle size={13} /> Agregar plan
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 uppercase tracking-wider text-xs border-b border-slate-700">
                      <th className="py-2 px-3 font-medium text-left">Orden</th>
                      <th className="py-2 px-3 font-medium text-left">Nombre</th>
                      <th className="py-2 px-3 font-medium text-left">Precio</th>
                      <th className="py-2 px-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planesTipo.map((p) => (
                      <tr key={p.id} className="border-b border-slate-800/60 hover:bg-slate-700/20">
                        <td className="py-2.5 px-3 text-slate-400">{p.orden}</td>
                        <td className="py-2.5 px-3 text-slate-200 font-medium">
                          {p.nombre}
                          {p.incluye.length > 0 && (
                            <span className="block text-[11px] text-slate-500 font-normal mt-0.5 max-w-xs">
                              {p.incluye.map((it) => it.titulo).join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">{p.precio > 0 ? pesos(p.precio) : <span className="text-slate-500 font-normal">Sin definir</span>}</td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => abrirEdicionPlan(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Editar">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => setABorrar(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-colors" title="Eliminar">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {planesTipo.length === 0 && (
                  <p className="text-center text-slate-500 text-sm py-6">Todavía no hay planes en esta categoría.</p>
                )}
              </div>
            </div>
          );
        })}

        {editando && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-white font-semibold">{editando === "nuevo" ? "Agregar plan" : "Editar plan"}</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Tipo</label>
                <div className="flex gap-2">
                  {(["doble_play", "internet"] as TipoPlan[]).map((t) => (
                    <button key={t} type="button" onClick={() => setFormPlan((f) => ({ ...f, tipo: t }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        formPlan.tipo === t ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                      }`}
                    >
                      {TIPO_PLAN_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Nombre (ej. 300MB)</label>
                <input value={formPlan.nombre} onChange={(e) => setFormPlan((f) => ({ ...f, nombre: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Precio</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={formPlan.precio} onChange={(e) => setFormPlan((f) => ({ ...f, precio: e.target.value }))}
                    inputMode="decimal" placeholder="0"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Orden (menor = más arriba)</label>
                <input value={formPlan.orden} onChange={(e) => setFormPlan((f) => ({ ...f, orden: e.target.value }))}
                  inputMode="numeric"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-slate-400">Qué incluye (opcional)</label>
                  <button type="button" onClick={agregarItem} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    <PlusCircle size={13} /> Agregar ítem
                  </button>
                </div>
                <div className="space-y-2">
                  {formPlan.items.map((item, i) => {
                    const IconoPreview = ICONO_COMPONENTE[item.icono];
                    return (
                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 space-y-1.5 relative">
                      <button type="button" onClick={() => quitarItem(i)} className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 transition-colors">
                        <X size={13} />
                      </button>
                      <div className="flex items-center gap-1.5">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                          <IconoPreview size={13} />
                        </span>
                        <select value={item.icono} onChange={(e) => elegirIconoItem(i, e.target.value as IconoItem)}
                          className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                        >
                          {ICONOS_ITEM.map((ic) => <option key={ic} value={ic}>{ICONO_LABEL[ic]}</option>)}
                        </select>
                      </div>
                      <input value={item.titulo} onChange={(e) => actualizarItem(i, { titulo: e.target.value })}
                        placeholder="Título (ej. Pack Premium)" maxLength={40}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <input value={item.texto} onChange={(e) => actualizarItem(i, { texto: e.target.value })}
                        placeholder="Texto (ej. HBO, Universal y Fútbol Premium)" maxLength={150}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    );
                  })}
                  {formPlan.items.length === 0 && (
                    <p className="text-xs text-slate-500">Sin ítems — el cliente va a ver la tarjeta sin el bloque &quot;Incluye&quot;.</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditando(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                  Cancelar
                </button>
                <button onClick={guardarPlan} disabled={guardandoPlan}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
                >
                  {guardandoPlan && <Loader2 size={14} className="animate-spin" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {aBorrar && (
          <ConfirmModal
            message={`¿Eliminar el plan "${aBorrar.nombre}"? Ya no va a aparecer como opción en el formulario.`}
            onConfirm={borrarPlan}
            onCancel={() => setABorrar(null)}
          />
        )}
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
        <button onClick={() => setPanel("planes")} className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          <DollarSign size={15} /> Gestionar planes
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
                        {r.precio !== null && <span className="block text-[10px] text-slate-500">{pesos(r.precio)}</span>}
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
