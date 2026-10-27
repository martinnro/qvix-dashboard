"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Loader2, CheckCircle2, AlertCircle, Wifi, MapPin, Check, Plus, ArrowDown, ArrowUp, ArrowLeft, FileText, X, Tv, Tag, ChevronRight, Film, Box, Monitor } from "lucide-react";
import BurbujasDecorativas from "./BurbujasDecorativas";

// Misma tipografía y paleta que el sitio institucional nuevo (repo ultranet-web, a cargo del
// diseñador) — ver app/enlaces/page.tsx, portado desde ahí con el mismo criterio.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

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
  4: [-28.458230, -65.716835], // Valle Viejo
  5: [-28.0655005, -67.5644496], // Tinogasta
  6: [-28.2124867, -65.8773962], // Rodeo
  7: [-28.1703819, -65.7914755], // La Puerta
  8: [-27.6921754, -67.6189241], // Fiambalá
};

// El logo del encabezado lleva al sitio institucional.
const SITIO_ULTRANET = "https://www.ultranet.com.ar";

const TIPOS_DOCUMENTO = ["DNI", "LC", "LE"] as const;

type IconoItem = "film" | "box" | "monitor" | "instalacion";

interface PlanItem {
  icono: IconoItem;
  titulo: string;
  texto: string;
}

const ICONO_COMPONENTE: Record<IconoItem, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  film: Film, box: Box, monitor: Monitor, instalacion: Box,
};

interface PlanConexion {
  id: number;
  nombre: string;
  precio: number;
  precio_lista: number | null;
  orden: number;
  tipo: "internet" | "doble_play" | "tv";
  incluye: PlanItem[];
  condiciones: string | null;
}

// Plan preelegido desde la web institucional (ultranet-web): ?plan=int300 (sólo internet) o
// ?plan=dp500 (internet + TV), los mismos códigos que usa su página de legales. Se compara por
// los Mb del nombre del plan, porque en la base los nombres varían ("800Mb", "800MB").
function parsePlanWeb(codigo: string | null): { tipo: "internet" | "doble_play"; mb: number } | null {
  const m = codigo?.match(/^(int|dp)(\d+)$/);
  return m ? { tipo: m[1] === "int" ? "internet" : "doble_play", mb: Number(m[2]) } : null;
}

function pesos(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

// Misma paleta que app/enlaces/page.tsx, tomada del repo real ultranet-web (variables :root de
// su CSS) — ya no la paleta del mockup suelto que se usó antes de tener el repo del diseñador.
const PURPLE_DARK = "#2E1252";
const PURPLE = "#6B3FA0";
const ACCENT = "#3FE0F5";
const TEAL_SOFT = "#D3F4FA";
const TEAL_DARK = "#008AAA";
const LILAC_SOFT = "#EBE1F7";

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
const inputStyle = { "--tw-ring-color": ACCENT } as React.CSSProperties;
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
  planInicial = null,
  sucursalesDisponibles = SUCURSALES_VALIDAS,
  onSubmitted,
}: {
  sucursalInicial?: number | null;
  /** Código de plan que manda la web institucional (ej. "int300", "dp500"). */
  planInicial?: string | null;
  /** Restringe qué sucursales puede elegir (ej. las permitidas para un vendedor logueado). Por defecto, todas. */
  sucursalesDisponibles?: number[];
  onSubmitted?: () => void;
}) {
  const planWebInicial = parsePlanWeb(planInicial);
  const [form, setForm] = useState<FormState>({
    ...initialState,
    cod_sucursal: sucursalInicial,
    go_tv: planWebInicial ? planWebInicial.tipo === "doble_play" : initialState.go_tv,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const [planes, setPlanes] = useState<PlanConexion[]>([]);
  const [planesLoading, setPlanesLoading] = useState(true);
  const [condicionesPlan, setCondicionesPlan] = useState<PlanConexion | null>(null);
  const [soloTv, setSoloTv] = useState(false);

  useEffect(() => {
    fetch("/api/planes-conexion")
      .then((r) => r.json())
      .then((json) => setPlanes(json.planes ?? []))
      .catch(() => setPlanes([]))
      .finally(() => setPlanesLoading(false));
  }, []);

  // Con un plan preelegido desde la web, se marca su tarjeta apenas llegan los planes
  // (sin pisar una elección que el usuario ya haya hecho).
  useEffect(() => {
    const planWeb = parsePlanWeb(planInicial);
    if (!planWeb) return;
    const plan = planes.find((p) => p.tipo === planWeb.tipo && parseInt(p.nombre, 10) === planWeb.mb);
    if (plan) setForm((f) => (f.velocidad ? f : { ...f, velocidad: plan.nombre }));
  }, [planes, planInicial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // El toggle Internet+TV / Sólo Internet no es solo un rótulo: son dos catálogos de planes
  // con precios distintos (Doble Play suele costar más que el mismo ancho de banda sin TV).
  const planesFiltrados = planes.filter((p) => p.tipo === (soloTv ? "tv" : form.go_tv ? "doble_play" : "internet"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.cod_sucursal) return setError("Elegí tu sucursal más cercana.");
    if (!form.titular_apellido_nombre.trim()) return setError("Falta tu nombre completo.");
    if (!form.titular_numero_documento.trim()) return setError("Falta tu número de documento.");
    if (!form.titular_telefono.trim()) return setError("Falta un teléfono para contactarte.");
    const planSeleccionado = planesFiltrados.find((p) => p.nombre === form.velocidad);
    if (soloTv && !planSeleccionado) return setError("Elegí el plan de TV.");
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
          cliente_existente: soloTv,
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
      <div className={`${jakarta.className} min-h-screen flex items-center justify-center px-6`} style={{ background: PURPLE_DARK }}>
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
      <div className={`${jakarta.className} relative overflow-hidden min-h-screen flex items-center`} style={{ background: PURPLE_DARK }}>
        <BurbujasDecorativas />
        <a href="/enlaces" aria-label="Volver a enlaces"
          className="absolute top-5 left-5 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        >
          <ArrowLeft size={18} />
        </a>
        <div className="relative px-4 py-14 text-center w-full">
          <div className="relative">
            <a href={SITIO_ULTRANET} className="block w-fit mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ultranet-logo-blanco.svg" alt="Ultranet — Internet a Ultra Velocidad" className="mx-auto" style={{ width: 220 }} />
            </a>
            <p className="text-white/80 text-sm mt-7 mb-4">Por favor, seleccioná tu localidad para continuar</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-lg mx-auto">
              {sucursalesDisponibles.map((cod) => (
                <button key={cod} type="button" onClick={() => set("cod_sucursal", cod)}
                  className="flex items-center rounded-full overflow-hidden text-left transition-transform hover:scale-[1.03]"
                >
                  <span className="flex items-center justify-center px-3 py-3" style={{ backgroundColor: ACCENT }}>
                    <MapPin size={16} style={{ color: PURPLE_DARK }} />
                  </span>
                  <span className="flex-1 px-3 py-2 text-left" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
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
    <div className={`${jakarta.className} min-h-screen bg-white`}>
      {/* Hero morado */}
      <div className="relative overflow-hidden px-4 pt-10 pb-12 sm:pb-16 text-center" style={{ background: PURPLE_DARK }}>
        <BurbujasDecorativas />
        <div className="relative">
          <a href={SITIO_ULTRANET} className="block w-fit mx-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ultranet-logo-blanco.svg" alt="Ultranet — Internet a Ultra Velocidad" className="mx-auto" style={{ width: 220 }} />
          </a>

          {sucursalInicial === null ? (
            <button type="button" onClick={() => set("cod_sucursal", null)}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-full px-4 py-2 mt-7 transition-colors"
            >
              <MapPin size={15} style={{ color: ACCENT }} />
              <span className="text-white text-sm font-semibold">{SUCURSALES[form.cod_sucursal as number]}, Catamarca</span>
              <span className="text-white/60 text-xs underline underline-offset-2">Cambiar</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 mt-7">
              <MapPin size={15} style={{ color: ACCENT }} />
              <span className="text-white text-sm font-semibold">{SUCURSALES[form.cod_sucursal as number]}, Catamarca</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 pt-8 pb-14 space-y-6">
        {/* Servicios */}
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 text-center mb-4">{soloTv ? "Sumá la TV a tu internet" : "Elegí tu plan"}</h2>

          <div className="flex justify-center mb-5">
            <div className="inline-flex rounded-full p-1" style={{ backgroundColor: "#F1F1F1" }}>
              <button type="button" onClick={() => { setSoloTv(false); setForm((f) => ({ ...f, go_tv: true, velocidad: "" })); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-colors"
                style={go_tv_style(form.go_tv && !soloTv, true)}
              >
                <Wifi size={14} /> Internet + TV
              </button>
              <button type="button" onClick={() => { setSoloTv(false); setForm((f) => ({ ...f, go_tv: false, velocidad: "" })); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-colors"
                style={go_tv_style(!form.go_tv && !soloTv, true)}
              >
                <Wifi size={14} /> Sólo Internet
              </button>
              <button type="button" onClick={() => { setSoloTv(true); setForm((f) => ({ ...f, go_tv: true, velocidad: "" })); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-colors"
                style={go_tv_style(soloTv, true)}
              >
                <Tv size={14} /> TV (ya soy cliente)
              </button>
            </div>
          </div>

          {soloTv && (
            <p className="text-center text-sm text-slate-600 mb-4 px-4">
              Si ya tenés internet con nosotros, elegí el plan de TV y te contactamos para sumarlo.
            </p>
          )}
          {planesLoading ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
              <Loader2 size={16} className="animate-spin" /> Cargando planes…
            </div>
          ) : planesFiltrados.length > 0 && (
            <div className={`grid gap-4 ${soloTv ? "grid-cols-1 sm:grid-cols-1 max-w-md mx-auto w-full" : "grid-cols-1 sm:grid-cols-2"}`}>
              {planesFiltrados.map((plan) => {
                const activo = form.velocidad === plan.nombre;
                const esTv = plan.tipo === "tv";
                const partes = esTv ? null : plan.nombre.match(/^(\d+)\s*(.*)$/);
                const itemsGrid = plan.incluye.filter((it) => it.icono !== "instalacion");
                const instalacion = plan.incluye.find((it) => it.icono === "instalacion");
                return (
                  <button key={plan.id} type="button" onClick={() => set("velocidad", activo ? "" : plan.nombre)}
                    className={`relative w-full rounded-[20px] overflow-hidden text-left flex flex-col transform-gpu transition-all duration-200 ease-out hover:-translate-y-1.5 active:scale-[0.98] active:duration-75 ${
                      activo ? "-translate-y-1.5" : "shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_24px_40px_-24px_rgba(46,18,82,0.45)]"
                    }`}
                    style={{
                      boxShadow: activo ? `0 24px 40px -24px ${PURPLE_DARK}73` : undefined,
                      outline: activo ? `2px solid ${PURPLE}` : "2px solid transparent",
                      outlineOffset: 2,
                      WebkitTransform: "translateZ(0)",
                      WebkitBackfaceVisibility: "hidden",
                    }}
                  >
                    <div className="relative w-full px-5 pt-3 pb-2" style={{ backgroundColor: PURPLE_DARK }}>
                      <div className="flex items-center justify-between">
                        <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: ACCENT, color: PURPLE_DARK }}>
                          {esTv ? "TV" : form.go_tv ? <>Internet + <strong>GOtv</strong></> : "Internet"}
                        </span>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${activo ? "scale-110" : "scale-100"}`}
                          style={{ border: `2px solid ${activo ? ACCENT : "rgba(255,255,255,0.5)"}`, backgroundColor: activo ? ACCENT : "transparent" }}
                        >
                          {activo && <Check size={12} style={{ color: PURPLE_DARK }} strokeWidth={3} />}
                        </span>
                      </div>
                      <h3 className="text-white font-semibold text-lg mt-1.5">
                        {esTv ? plan.nombre : `Fibra ${partes ? partes[1] : plan.nombre}${partes?.[2] ? ` ${partes[2]}` : ""}`}
                      </h3>
                    </div>

                    <div className="relative w-full px-5 pt-4 pb-4 flex-1 flex flex-col transform-gpu" style={{ backgroundColor: LILAC_SOFT, WebkitTransform: "translateZ(0)", WebkitBackfaceVisibility: "hidden" }}>
                      {partes && (
                        <div className="flex items-center gap-2 mb-3 text-sm font-bold" style={{ color: PURPLE_DARK }}>
                          <span className="inline-flex items-center gap-0.5"><ArrowDown size={14} />{partes[1]} Mb</span>
                          <span className="w-px h-4" style={{ backgroundColor: "rgba(46,18,82,0.2)" }} />
                          <span className="inline-flex items-center gap-0.5"><ArrowUp size={14} />{Math.round(Number(partes[1]) * 0.1)} Mb</span>
                        </div>
                      )}

                      {itemsGrid.length > 0 && (
                        <ul className="space-y-1.5 mb-3">
                          {itemsGrid.map((item, i) => {
                            const Icono = ICONO_COMPONENTE[item.icono];
                            return (
                              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: PURPLE_DARK }}>
                                <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#fff" }}>
                                  <Icono size={11} style={{ color: PURPLE_DARK }} />
                                </span>
                                <span><strong>{item.titulo}</strong>{item.texto ? `: ${item.texto}` : ""}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {instalacion && (
                        <span className="inline-flex self-start items-center gap-1.5 text-xs font-semibold px-3.5 py-1 rounded-full mb-3" style={{ backgroundColor: ACCENT, color: PURPLE_DARK }}>
                          − {instalacion.titulo}
                        </span>
                      )}

                      {plan.precio > 0 && (
                        <div className="mt-auto">
                          <div className="flex items-end justify-center gap-1 pt-1 pb-1">
                            <span className="text-xl font-extrabold mt-2.5" style={{ color: PURPLE_DARK }}>$</span>
                            <span className="text-5xl font-extrabold leading-none" style={{ color: PURPLE_DARK, letterSpacing: "-2px" }}>
                              {Math.round(plan.precio).toLocaleString("es-AR")}
                            </span>
                            <span className="text-sm font-medium mt-2.5" style={{ color: PURPLE_DARK }}>/mes</span>
                          </div>
                          {plan.precio_lista !== null && plan.precio_lista > plan.precio && (
                            <div className="flex items-center justify-center gap-2 text-xs mb-2" style={{ color: "#8A8798" }}>
                              Precio de lista <span className="line-through">{pesos(plan.precio_lista)}</span>
                              <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: TEAL_SOFT, color: TEAL_DARK }}>
                                <Tag size={11} /> ahorrás {pesos(plan.precio_lista - plan.precio)}
                              </span>
                            </div>
                          )}
                          {plan.condiciones && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setCondicionesPlan(plan); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); setCondicionesPlan(plan); } }}
                              className="flex items-center justify-center gap-1 text-[13.5px] font-semibold cursor-pointer hover:opacity-75 transition-opacity"
                              style={{ color: PURPLE_DARK }}
                            >
                              Ver tarifas y condiciones
                              <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#8A8798" }}>
                                <ChevronRight size={12} className="text-white" />
                              </span>
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

          {!soloTv && (<>
          {/* "Otra velocidad": franja completa debajo de los planes, con el mismo peso visual
              que una tarjeta — para que no pase desapercibida como un link chico */}
          <button type="button" onClick={() => set("velocidad", form.velocidad === "Otra" ? "" : "Otra")}
            className={`relative w-full flex items-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-3.5 mt-3 transition-colors ${form.velocidad === "Otra" ? "" : "border-slate-300 hover:border-slate-400"}`}
            style={form.velocidad === "Otra" ? { borderColor: PURPLE_DARK, backgroundColor: "#faf8fc" } : undefined}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: form.velocidad === "Otra" ? ACCENT : "#e2e8f0" }}>
              <Plus size={18} className="text-slate-500" style={form.velocidad === "Otra" ? { color: PURPLE_DARK } : undefined} />
            </span>
            <span className="text-sm font-bold" style={{ color: form.velocidad === "Otra" ? PURPLE_DARK : "#475569" }}>
              ¿Necesitás otra velocidad? Contanos cuál
            </span>
            {form.velocidad === "Otra" && (
              <span className="ml-auto w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                <Check size={12} style={{ color: PURPLE_DARK }} strokeWidth={3} />
              </span>
            )}
          </button>
          {form.velocidad === "Otra" && (
            <div className="mt-3">
              <label className={labelClass}>¿Qué velocidad necesitás?</label>
              <input value={form.velocidadOtra} onChange={(e) => set("velocidadOtra", e.target.value)} placeholder="Ej. 700MB" className={inputClass} style={inputStyle} autoFocus />
            </div>
          )}
          </>)}
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
            {!soloTv && (
              <Field label="Correo electrónico">
                <input type="email" value={form.titular_email} onChange={(e) => set("titular_email", e.target.value)} className={inputClass} style={inputStyle} />
              </Field>
            )}
          </div>
        </div>

        {/* Domicilio */}
        {!soloTv && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h2 className="text-slate-900 font-extrabold text-base">¿Dónde instalamos?</h2>
          <UbicacionMapPicker
            lat={form.inm_lat}
            lng={form.inm_lng}
            onChange={(lat, lng) => setForm((f) => ({ ...f, inm_lat: lat, inm_lng: lng }))}
            color={PURPLE_DARK}
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
        )}

        {error && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <button type="submit" disabled={sending}
          className="w-full font-bold py-4 rounded-full text-base shadow-lg transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: ACCENT, color: PURPLE_DARK, boxShadow: `0 10px 25px -5px ${ACCENT}66` }}
        >
          {sending && <Loader2 size={18} className="animate-spin" />}
          {sending ? "Enviando…" : "Quiero mi conexión"}
        </button>

        <p className="text-xs text-slate-400 text-center leading-relaxed px-4">
          Esta solicitud no implica el perfeccionamiento del contrato hasta que se realice la instalación del servicio en tu domicilio, sujeto a factibilidad técnica del área.{" "}
          {/* Aviso de la Ley 25.326 de Protección de Datos Personales */}
          Al enviar esta solicitud aceptás que Ultranet use tus datos para gestionarla y contactarte. Podés pedir acceso, corrección o eliminación de tus datos escribiendo a contacto@ultranet.com.ar.{" "}
          <a href="/privacidad" className="underline underline-offset-2 hover:text-slate-600">Política de privacidad</a>
        </p>
      </form>

      {condicionesPlan && condicionesPlan.condiciones && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/50" onClick={() => setCondicionesPlan(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 sm:p-7"
          >
            <button type="button" onClick={() => setCondicionesPlan(null)} aria-label="Cerrar"
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: LILAC_SOFT }}>
                <FileText size={20} style={{ color: PURPLE_DARK }} />
              </div>
              <div className="pr-6">
                <h3 className="text-base font-extrabold text-slate-900">Condiciones de la promoción – Plan {condicionesPlan.nombre}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-700 leading-relaxed">
                  {condicionesPlan.condiciones.split("\n").map((linea, i) => linea.trim() && (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PURPLE }} />
                      <span>{linea.trim()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button type="button" onClick={() => setCondicionesPlan(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: PURPLE_DARK }}
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
    ? { backgroundColor: PURPLE_DARK, color: ACCENT }
    : { backgroundColor: "transparent", color: "#8A8798" };
}
