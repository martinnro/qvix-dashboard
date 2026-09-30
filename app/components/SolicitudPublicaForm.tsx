"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Loader2, CheckCircle2, AlertCircle, Wifi, MapPin, Check, Plus } from "lucide-react";

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

interface PlanConexion {
  id: number;
  nombre: string;
  precio: number;
  orden: number;
  tipo: "internet" | "doble_play";
}

function pesos(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

// Paleta tomada de ultranet.com.ar
const MORADO = "#3D1263";
const MORADO_CLARO = "#5B2A8A";
const CIAN = "#22C3DC";

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

// Circulitos decorativos del hero, igual que en ultranet.com.ar
function Decoracion() {
  const puntos = [
    { top: "8%", left: "6%", size: 10 }, { top: "14%", left: "34%", size: 7 },
    { top: "62%", left: "16%", size: 9 }, { top: "10%", left: "88%", size: 8 },
    { top: "44%", left: "92%", size: 11 }, { top: "78%", left: "94%", size: 6 },
    { top: "80%", left: "62%", size: 8 }, { top: "6%", left: "60%", size: 6 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {puntos.map((p, i) => (
        <div key={i} className="absolute rounded-full bg-white/10" style={{ top: p.top, left: p.left, width: p.size * 2, height: p.size * 2 }} />
      ))}
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

  return (
    <div className="min-h-screen bg-[#f7f5fb]">
      {/* Hero morado */}
      <div className="relative overflow-hidden px-4 pt-10 pb-12 sm:pb-16 text-center" style={{ background: `linear-gradient(135deg, ${MORADO}, ${MORADO_CLARO})` }}>
        <Decoracion />
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ultranet-logo.png" alt="Ultranet — Internet a Ultra Velocidad" className="mx-auto" style={{ width: 220 }} />

          {sucursalInicial === null ? (
            <>
              <p className="text-white/80 text-sm mt-7 mb-4">Por favor, seleccioná tu sucursal</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-lg mx-auto">
                {sucursalesDisponibles.map((cod) => (
                  <button key={cod} type="button" onClick={() => set("cod_sucursal", cod)}
                    className={`flex items-center rounded-full overflow-hidden text-left transition-transform hover:scale-[1.03] ${form.cod_sucursal === cod ? "ring-2 ring-white" : ""}`}
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
            </>
          ) : (
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 mt-7">
              <MapPin size={15} style={{ color: CIAN }} />
              <span className="text-white text-sm font-semibold">{SUCURSALES[sucursalInicial]}, Catamarca</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 pt-8 pb-14 space-y-6">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {planesFiltrados.map((plan) => {
                const activo = form.velocidad === plan.nombre;
                const partes = plan.nombre.match(/^(\d+)\s*(.*)$/);
                return (
                  <button key={plan.id} type="button" onClick={() => set("velocidad", activo ? "" : plan.nombre)}
                    className={`relative rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5 ${activo ? "ring-2" : ""}`}
                    style={activo ? ({ "--tw-ring-color": CIAN } as React.CSSProperties) : undefined}
                  >
                    {activo && (
                      <span className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: CIAN }}>
                        <Check size={12} className="text-white" strokeWidth={3} />
                      </span>
                    )}
                    <div className="px-3 pt-3 pb-2" style={{ backgroundColor: MORADO }}>
                      <p className="text-white/60 text-[9px] font-bold tracking-wider uppercase">{form.go_tv ? "Doble Play" : "Internet"}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-white text-3xl font-extrabold">{partes ? partes[1] : plan.nombre}</span>
                        {partes && partes[2] && (
                          <span className="text-white text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: CIAN }}>{partes[2]}</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white px-3 py-2.5 space-y-1">
                      <p className="text-slate-500 text-[10px] leading-snug">FTTH · {form.go_tv ? "Internet + TV" : "Solo Internet"}</p>
                      {form.go_tv && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="/gotv-logo.png" alt="GO TV" style={{ height: 16 }} />
                      )}
                      {plan.precio > 0 && (
                        <p className="text-sm font-extrabold" style={{ color: MORADO }}>{pesos(plan.precio)}</p>
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
    </div>
  );
}

function go_tv_style(current: boolean, esteBoton: boolean): React.CSSProperties {
  const activo = current === esteBoton;
  return activo
    ? { backgroundColor: CIAN, color: "#fff" }
    : { backgroundColor: "transparent", color: "#64748b" };
}
