"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Loader2, CheckCircle2, AlertCircle, Wifi, MapPin, Check, Plus, Film, Box, Monitor, Wrench, Tag, Info, ChevronDown, ArrowDown, ArrowUp, FileText, X } from "lucide-react";
import BurbujasDecorativas from "./BurbujasDecorativas";

const UbicacionMapPicker = dynamic(() => import("./UbicacionMapPicker"), { ssr: false });

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};
const SUCURSALES_VALIDAS = Object.keys(SUCURSALES).map(Number);

// Centro aproximado de cada localidad (geocodificado con OpenStreetMap/Nominatim), para que el
// mapa arranque centrado ahí en vez de en la vista genérica de toda la provincia.
const SUCURSAL_COORDS: Record<number, [number, number]> = {
  1: [-28.8532078, -66.2376266], // Chumbicha
  4: [-28.4514788, -65.7911747], // Valle Viejo
  5: [-28.0655005, -67.5644496], // Tinogasta
  6: [-28.2124867, -65.8773962], // Rodeo
  7: [-28.1703819, -65.7914755], // La Puerta
  8: [-27.6921754, -67.6189241], // Fiambalá
};

const TIPOS_DOCUMENTO = ["DNI", "LC", "LE"] as const;

type IconoItem = "film" | "box" | "monitor" | "instalacion";

interface PlanItem {
  icono: IconoItem;
  titulo: string;
  texto: string;
}

interface PlanConexion {
  id: number;
  nombre: string;
  precio: number;
  precio_lista: number | null;
  orden: number;
  tipo: "internet" | "doble_play";
  incluye: PlanItem[];
  condiciones: string | null;
}

const ICONO_COMPONENTE: Record<IconoItem, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  film: Film, box: Box, monitor: Monitor, instalacion: Wrench,
};

function pesos(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

// Paleta tomada de ultranet.com.ar
const MORADO = "#3D1263";
const MORADO_CLARO = "#5B2A8A";
const CIAN = "#22C3DC";
// Paleta específica de la tarjeta de plan (tomada por muestreo del modelo de referencia) —
// ahí no aparece el cian en ningún lado, es toda violeta/morado.
const TARJETA_MORADO = "#3B0E67";
const TARJETA_MORADO_CLARO = "#612BB1";
const TARJETA_VIOLETA_BADGE_1 = "#7C22D0";
const TARJETA_VIOLETA_BADGE_2 = "#822AE5";

interface FormState {
  cod_sucursal: number | null;
  velocidad: string;
  velocidadOtra: string;
  go_tv: boolean;
  inm_lat: number | null;
  inm_lng: number | null;
  referencia: string;
  titular_apellido_nombre: string;
  titular_tipo_documento: string;
  titular_numero_documento: string;
  titular_barrio: string; titular_localidad: string; titular_provincia: string;
  titular_calle: string; titular_numero: string; titular_piso: string; titular_dpto: string;
  titular_telefono: string;
  titular_email: string;
}

const initialState: FormState = {
  cod_sucursal: null,
  velocidad: "",
  velocidadOtra: "",
  go_tv: true,
  inm_lat: null,
  inm_lng: null,
  referencia: "",
  titular_apellido_nombre: "",
  titular_tipo_documento: "DNI",
  titular_numero_documento: "",
  titular_barrio: "", titular_localidad: "", titular_provincia: "",
  titular_calle: "", titular_numero: "", titular_piso: "", titular_dpto: "",
  titular_telefono: "",
  titular_email: "",
};

const inputClass = "w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-shadow";
const inputStyle = { "--tw-ring-color": CIAN } as React.CSSProperties;
const labelClass = "block text-xs font-medium text-slate-500 mb-1.5";

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className={labelClass}>{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

export default function SolicitudPublicaForm({
  sucursalInicial = null,
  sucursalesDisponibles = SUCURSALES_VALIDAS,
  onSubmitted,
}: {
  sucursalInicial?: number | null;
  /** Restringe qué sucursales puede elegir (ej. las permitidas para un vendedor logueado). Por defecto, todas. */
  sucursalesDisponibles?: number[];
  onSubmitted?: () => void;
}) {
  const [form, setForm] = useState<FormState>({ ...initialState, cod_sucursal: sucursalInicial });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const [planes, setPlanes] = useState<PlanConexion[]>([]);
  const [planesLoading, setPlanesLoading] = useState(true);
  const [condicionesPlan, setCondicionesPlan] = useState<PlanConexion | null>(null);

  useEffect(() => {
    fetch("/api/planes-conexion")
      .then((r) => r.json())
      .then((json) => setPlanes(json.planes ?? []))
      .catch(() => setPlanes([]))
      .finally(() => setPlanesLoading(false));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // El toggle Internet+TV / Sólo Internet no es solo un rótulo: son dos catálogos de planes
  // con precios distintos (Doble Play suele costar más que el mismo ancho de banda sin TV).
  const planesFiltrados = planes.filter((p) => p.tipo === (form.go_tv ? "doble_play" : "internet"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.cod_sucursal) return setError("Elegí tu sucursal más cercana.");
    if (!form.titular_apellido_nombre.trim()) return setError("Falta tu nombre completo.");
    if (!form.titular_numero_documento.trim()) return setError("Falta tu número de documento.");
    if (!form.titular_telefono.trim()) return setError("Falta un teléfono para contactarte.");
    const planSeleccionado = planesFiltrados.find((p) => p.nombre === form.velocidad);
    const velocidadFinal = form.velocidad === "Otra" ? form.velocidadOtra.trim() : form.velocidad;
    if (!velocidadFinal && !form.go_tv) return setError("Elegí al menos un servicio: internet o GO TV.");

    setSending(true);
    try {
      const res = await fetch("/api/solicitudes-conexion/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cod_sucursal: form.cod_sucursal,
          doble_play: form.go_tv,
          velocidad: velocidadFinal || null,
          precio: planSeleccionado?.precio ?? null,
          go_tv: form.go_tv,
          inm_lat: form.inm_lat,
          inm_lng: form.inm_lng,
          referencia: form.referencia,
          titular_apellido_nombre: form.titular_apellido_nombre,
          titular_tipo_documento: form.titular_tipo_documento,
          titular_numero_documento: form.titular_numero_documento,
          titular_barrio: form.titular_barrio,
          titular_localidad: form.titular_localidad,
          titular_provincia: form.titular_provincia,
          titular_calle: form.titular_calle,
          titular_numero: form.titular_numero,
          titular_piso: form.titular_piso,
          titular_dpto: form.titular_dpto,
          titular_telefono: form.titular_telefono,
          titular_email: form.titular_email,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo enviar la solicitud");
      setEnviado(true);
      onSubmitted?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: `linear-gradient(135deg, ${MORADO}, ${MORADO_CLARO})` }}>
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={34} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-2">¡Ya casi sos parte de Ultranet!</h1>
          <p className="text-white/70 text-sm leading-relaxed">
            Recibimos tu solicitud. Un asesor te va a contactar a la brevedad para coordinar la instalación.
          </p>
          <button
            onClick={() => { setForm({ ...initialState, cod_sucursal: sucursalInicial }); setEnviado(false); }}
            className="mt-8 text-sm text-white underline underline-offset-4 hover:opacity-80 transition-opacity"
          >
            Cargar otra solicitud
          </button>
        </div>
      </div>
    );
  }

  // QR universal (sin ?sucursal=): hasta que no elija localidad no se muestra el resto del
  // formulario — pensado para un QR expuesto en un evento con gente de distintas localidades.
  if (sucursalInicial === null && !form.cod_sucursal) {
    return (
      <div className="relative overflow-hidden min-h-screen flex items-center" style={{ background: `linear-gradient(135deg, ${MORADO}, ${MORADO_CLARO})` }}>
        <BurbujasDecorativas />
        <div className="relative px-4 py-14 text-center w-full">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ultranet-logo.png" alt="Ultranet — Internet a Ultra Velocidad" className="mx-auto" style={{ width: 220 }} />
            <p className="text-white/80 text-sm mt-7 mb-4">Por favor, seleccioná tu localidad para continuar</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-lg mx-auto">
              {sucursalesDisponibles.map((cod) => (
                <button key={cod} type="button" onClick={() => set("cod_sucursal", cod)}
                  className="flex items-center rounded-full overflow-hidden text-left transition-transform hover:scale-[1.03]"
                >
                  <span className="flex items-center justify-center px-3 py-3" style={{ backgroundColor: CIAN }}>
                    <MapPin size={16} className="text-white" />
                  </span>
                  <span className="flex-1 px-3 py-2 text-left" style={{ backgroundColor: "#1F0A38" }}>
                    <span className="block text-white font-bold text-xs leading-tight">{SUCURSALES[cod]}</span>
                    <span className="block text-white/50 text-[10px] italic">Catamarca</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f5fb]">
      {/* Hero morado */}
      <div className="relative overflow-hidden px-4 pt-10 pb-12 sm:pb-16 text-center" style={{ background: `linear-gradient(135deg, ${MORADO}, ${MORADO_CLARO})` }}>
        <BurbujasDecorativas />
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ultranet-logo.png" alt="Ultranet — Internet a Ultra Velocidad" className="mx-auto" style={{ width: 220 }} />

          {sucursalInicial === null ? (
            <button type="button" onClick={() => set("cod_sucursal", null)}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-full px-4 py-2 mt-7 transition-colors"
            >
              <MapPin size={15} style={{ color: CIAN }} />
              <span className="text-white text-sm font-semibold">{SUCURSALES[form.cod_sucursal as number]}, Catamarca</span>
              <span className="text-white/60 text-xs underline underline-offset-2">Cambiar</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 mt-7">
              <MapPin size={15} style={{ color: CIAN }} />
              <span className="text-white text-sm font-semibold">{SUCURSALES[form.cod_sucursal as number]}, Catamarca</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 pt-8 pb-14 space-y-6">
        {/* Servicios */}
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 text-center mb-4">Elegí tu plan</h2>

          <div className="flex justify-center mb-5">
            <div className="inline-flex bg-slate-200 rounded-full p-1">
              <button type="button" onClick={() => setForm((f) => ({ ...f, go_tv: true, velocidad: "" }))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-colors"
                style={go_tv_style(form.go_tv, true)}
              >
                <Wifi size={14} /> Internet + TV
              </button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, go_tv: false, velocidad: "" }))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-colors"
                style={go_tv_style(form.go_tv, false)}
              >
                <Wifi size={14} /> Sólo Internet
              </button>
            </div>
          </div>

          {planesLoading ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
              <Loader2 size={16} className="animate-spin" /> Cargando planes…
            </div>
          ) : planesFiltrados.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {planesFiltrados.map((plan) => {
                const activo = form.velocidad === plan.nombre;
                const partes = plan.nombre.match(/^(\d+)\s*(.*)$/);
                const itemsGrid = plan.incluye.filter((it) => it.icono !== "instalacion");
                const instalacion = plan.incluye.find((it) => it.icono === "instalacion");
                return (
                  <button key={plan.id} type="button" onClick={() => set("velocidad", activo ? "" : plan.nombre)}
                    className={`relative w-full rounded-2xl overflow-hidden text-left flex flex-col bg-white transform-gpu transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] active:duration-75 ${activo ? "-translate-y-0.5" : ""}`}
                    style={{
                      border: `2px solid ${activo ? TARJETA_MORADO_CLARO : "#e2e8f0"}`,
                      boxShadow: activo ? `0 10px 25px -8px ${TARJETA_MORADO_CLARO}80` : "0 1px 2px rgba(0,0,0,0.05)",
                      WebkitTransform: "translateZ(0)",
                      WebkitBackfaceVisibility: "hidden",
                    }}
                  >
                    {/* Header recto, sin curva — más simple y sin riesgo de que el recorte tape algo. */}
                    <div className="relative w-full overflow-hidden px-5 pt-4 pb-5" style={{ background: `linear-gradient(135deg, ${TARJETA_MORADO}, ${TARJETA_MORADO_CLARO})` }}>
                      <Wifi size={80} strokeWidth={1.5} className="absolute top-4 right-2 text-white/15 pointer-events-none" />
                      <div className="relative flex items-start justify-between">
                        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold text-white tracking-wide uppercase"
                          style={{ background: `linear-gradient(135deg, ${TARJETA_VIOLETA_BADGE_1}, ${TARJETA_VIOLETA_BADGE_2})` }}
                        >
                          {form.go_tv ? "Doble Play" : "Solo Internet"}
                        </span>
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${activo ? "scale-110" : "scale-100"}`}
                          style={{ border: `2px solid ${activo ? CIAN : "rgba(255,255,255,0.6)"}`, backgroundColor: activo ? CIAN : "transparent" }}
                        >
                          {activo && <Check size={14} className="text-white" strokeWidth={3} style={{ animation: "plan-check-pop 0.25s ease-out" }} />}
                        </span>
                      </div>
                      <div className="relative flex items-baseline gap-2 mt-3">
                        <span className="text-5xl font-extrabold leading-none text-white">{partes ? partes[1] : plan.nombre}</span>
                        {partes && partes[2] && (
                          <span className="text-sm font-bold text-white px-2 py-1 rounded-md" style={{ backgroundColor: CIAN }}>{partes[2]}</span>
                        )}
                      </div>
                    </div>

                    <div className="px-5 pt-3 pb-4 flex-1 flex flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-slate-800 text-sm font-bold">FTTH Internet{form.go_tv ? " + TV" : ""}{partes ? "" : ` ${plan.nombre}`}</p>
                          {partes && (
                            <div className="flex items-center gap-2 mt-1 text-sm font-bold" style={{ color: TARJETA_MORADO }}>
                              <span className="inline-flex items-center gap-0.5"><ArrowDown size={14} />{partes[1]} Mb</span>
                              <span className="w-px h-4 bg-slate-200" />
                              <span className="inline-flex items-center gap-0.5"><ArrowUp size={14} />{Math.round(Number(partes[1]) * 0.1)} Mb</span>
                            </div>
                          )}
                        </div>
                        {form.go_tv && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src="/gotv-logo.png" alt="GO TV" className="w-auto flex-shrink-0" style={{ height: 22 }} />
                        )}
                      </div>

                      {itemsGrid.length > 0 && (
                        <>
                          <div className="border-t border-slate-100 my-3" />
                          <div className="grid grid-cols-3 gap-2">
                            {itemsGrid.map((item, i) => {
                              const Icono = ICONO_COMPONENTE[item.icono];
                              return (
                                <div key={i} className="flex items-start gap-1.5 min-w-0">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f1eef6" }}>
                                    <Icono size={12} style={{ color: TARJETA_MORADO }} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-800 leading-tight whitespace-nowrap">{item.titulo}</p>
                                    {item.texto && <p className="text-[10px] text-slate-500 leading-snug text-balance">{item.texto}</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {instalacion && (
                        <div className="mt-3 rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "#ebf8ee" }}>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#bfedc3" }}>
                            <Wrench size={17} style={{ color: "#004100" }} />
                          </div>
                          <p className="text-sm font-bold leading-tight" style={{ color: "#002800" }}>{instalacion.titulo}</p>
                          {instalacion.texto && (
                            <>
                              <div className="w-px self-stretch" style={{ backgroundColor: "#055608" }} />
                              <p className="text-xs leading-snug" style={{ color: "#334155" }}>{instalacion.texto}</p>
                            </>
                          )}
                        </div>
                      )}

                      {plan.precio > 0 && (
                        <div className="mt-auto">
                          <div className="border-t border-slate-100 my-3" />
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold text-white uppercase tracking-wide" style={{ backgroundColor: "#f6549b" }}>Promo</span>
                              <div className="flex items-baseline gap-1.5 mt-1">
                                <span className="text-3xl font-extrabold leading-none" style={{ color: TARJETA_MORADO }}>{pesos(plan.precio)}</span>
                                <span className="text-sm text-slate-500">por mes</span>
                              </div>
                            </div>
                            {plan.precio_lista !== null && plan.precio_lista > plan.precio && (
                              <div className="flex flex-col items-end gap-1.5 pl-3 border-l border-slate-200">
                                <span className="text-xs text-slate-400">Precio de lista: <span className="text-sm line-through">{pesos(plan.precio_lista)}</span></span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap" style={{ backgroundColor: "#fde5ef", color: "#dd0054" }}>
                                  <Tag size={14} style={{ color: "#e40056" }} />
                                  Ahorrás {pesos(plan.precio_lista - plan.precio)}
                                </span>
                              </div>
                            )}
                          </div>
                          {plan.condiciones && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setCondicionesPlan(plan); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); setCondicionesPlan(plan); } }}
                              className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                            >
                              <Info size={14} />
                              <span className="underline underline-offset-2">Ver condiciones de la promoción</span>
                              <ChevronDown size={14} />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* "Otra velocidad": franja completa debajo de los planes, con el mismo peso visual
              que una tarjeta — para que no pase desapercibida como un link chico */}
          <button type="button" onClick={() => set("velocidad", form.velocidad === "Otra" ? "" : "Otra")}
            className={`relative w-full flex items-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-3.5 mt-3 transition-colors ${form.velocidad === "Otra" ? "" : "border-slate-300 hover:border-slate-400"}`}
            style={form.velocidad === "Otra" ? { borderColor: MORADO, backgroundColor: "#faf8fc" } : undefined}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: form.velocidad === "Otra" ? CIAN : "#e2e8f0" }}>
              <Plus size={18} className={form.velocidad === "Otra" ? "text-white" : "text-slate-500"} />
            </span>
            <span className="text-sm font-bold" style={{ color: form.velocidad === "Otra" ? MORADO : "#475569" }}>
              ¿Necesitás otra velocidad? Contanos cuál
            </span>
            {form.velocidad === "Otra" && (
              <span className="ml-auto w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: CIAN }}>
                <Check size={12} className="text-white" strokeWidth={3} />
              </span>
            )}
          </button>
          {form.velocidad === "Otra" && (
            <div className="mt-3">
              <label className={labelClass}>¿Qué velocidad necesitás?</label>
              <input value={form.velocidadOtra} onChange={(e) => set("velocidadOtra", e.target.value)} placeholder="Ej. 700MB" className={inputClass} style={inputStyle} autoFocus />
            </div>
          )}
        </div>

        {/* Datos personales */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h2 className="text-slate-900 font-extrabold text-base">Tus datos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre y apellido" required>
              <input value={form.titular_apellido_nombre} onChange={(e) => set("titular_apellido_nombre", e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Documento" required>
                <select value={form.titular_tipo_documento} onChange={(e) => set("titular_tipo_documento", e.target.value)} className={inputClass} style={inputStyle}>
                  {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="N° documento" required>
                <input value={form.titular_numero_documento} onChange={(e) => set("titular_numero_documento", e.target.value)} className={inputClass} style={inputStyle} inputMode="numeric" />
              </Field>
            </div>
            <Field label="Teléfono" required>
              <input value={form.titular_telefono} onChange={(e) => set("titular_telefono", e.target.value)} className={inputClass} style={inputStyle} inputMode="tel" placeholder="Ej. 3834123456" />
            </Field>
            <Field label="Correo electrónico">
              <input type="email" value={form.titular_email} onChange={(e) => set("titular_email", e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
          </div>
        </div>

        {/* Domicilio */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h2 className="text-slate-900 font-extrabold text-base">¿Dónde instalamos?</h2>
          <UbicacionMapPicker
            lat={form.inm_lat}
            lng={form.inm_lng}
            onChange={(lat, lng) => setForm((f) => ({ ...f, inm_lat: lat, inm_lng: lng }))}
            color={MORADO}
            centro={form.cod_sucursal ? SUCURSAL_COORDS[form.cod_sucursal] ?? null : null}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Barrio">
              <input value={form.titular_barrio} onChange={(e) => set("titular_barrio", e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Localidad">
              <input value={form.titular_localidad} onChange={(e) => set("titular_localidad", e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <Field label="Calle">
                <input value={form.titular_calle} onChange={(e) => set("titular_calle", e.target.value)} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="N°">
                <input value={form.titular_numero} onChange={(e) => set("titular_numero", e.target.value)} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Piso/Dpto">
                <div className="flex gap-1">
                  <input value={form.titular_piso} onChange={(e) => set("titular_piso", e.target.value)} placeholder="Piso" className={inputClass} style={inputStyle} />
                  <input value={form.titular_dpto} onChange={(e) => set("titular_dpto", e.target.value)} placeholder="Dpto" className={inputClass} style={inputStyle} />
                </div>
              </Field>
            </div>
            <Field label="Punto de referencia">
              <input value={form.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="Ej. frente a la plaza, casa con portón verde…" className={`${inputClass} sm:col-span-2`} style={inputStyle} />
            </Field>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <button type="submit" disabled={sending}
          className="w-full text-white font-bold py-4 rounded-full text-base shadow-lg transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: CIAN, boxShadow: `0 10px 25px -5px ${CIAN}66` }}
        >
          {sending && <Loader2 size={18} className="animate-spin" />}
          {sending ? "Enviando…" : "Quiero mi conexión"}
        </button>

        <p className="text-xs text-slate-400 text-center leading-relaxed px-4">
          Esta solicitud no implica el perfeccionamiento del contrato hasta que se realice la instalación del servicio en tu domicilio, sujeto a factibilidad técnica del área.
        </p>
      </form>

      {condicionesPlan && condicionesPlan.condiciones && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" onClick={() => setCondicionesPlan(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 sm:p-7"
          >
            <button type="button" onClick={() => setCondicionesPlan(null)} aria-label="Cerrar"
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f1eef6" }}>
                <FileText size={20} style={{ color: TARJETA_MORADO }} />
              </div>
              <div className="pr-6">
                <h3 className="text-base font-extrabold text-slate-900">Condiciones de la promoción – Plan {condicionesPlan.nombre}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-700 leading-relaxed">
                  {condicionesPlan.condiciones.split("\n").map((linea, i) => linea.trim() && (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#7c22d0" }} />
                      <span>{linea.trim()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button type="button" onClick={() => setCondicionesPlan(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#7c22d0" }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function go_tv_style(current: boolean, esteBoton: boolean): React.CSSProperties {
  const activo = current === esteBoton;
  return activo
    ? { backgroundColor: CIAN, color: "#fff" }
    : { backgroundColor: "transparent", color: "#64748b" };
}
