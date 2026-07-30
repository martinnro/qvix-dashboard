"use client";
import { useState, useCallback, useEffect } from "react";
import { ChevronLeft, X, Loader2, AlertCircle, Tv, Tag, TrendingUp, List, HardHat } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const SUCURSALES: Record<number, string> = {
  0: "Central",
  1: "Chumbicha",
  3: "SonoVision",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ModeloRow  { modelo: string; tipo: string; cantidad: number }
interface MesRow     { mes: string;     cantidad: number }
interface SubtipoRow   { subtipo: string;   cantidad: number }
interface SucursalRow  { cod_sucursal: number; nombre: string; cantidad: number }
interface CuadrillaRow  { cuadrilla: string; cantidad: number }
interface PendienteRow  {
  sucursal: string; modelo: string; tipo: string; mac: string;
  id_conexion: number | null; fecha_reclamo: string; dias_demora: number;
  subtipo: string; cuadrilla: string | null;
}
interface DetalleRow {
  sucursal: string; modelo: string; mac: string;
  id_conexion: number | null;
  fecha_reclamo: string; fecha_solucion: string;
  estado_servicio: string; subtipo: string;
  cuadrilla: string | null;
}
interface Data {
  total: number;
  porModelo:        ModeloRow[];
  porMes:           MesRow[];
  porSubtipo:       SubtipoRow[];
  porSucursal:      SucursalRow[];
  porCuadrilla:     CuadrillaRow[];
  pendientesTotal:  number;
  pendientesDetalle: PendienteRow[];
  detalle:          DetalleRow[];
}

type PanelType = "modelo" | "subtipo" | "tendencia" | "cuadrilla" | "pendientes" | "detalle";

function hoy()      { return new Date().toISOString().slice(0, 10); }
function inicioAnio() { return `${new Date().getFullYear()}-01-01`; }
function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

// ── Barra de porcentaje (igual que Reclamos) ───────────────────────────────────
function BarRow({ label, cantidad, total, color }: { label: string; cantidad: number; total: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-300 truncate flex-1 pr-3">{label}</span>
        <span className="text-xs font-semibold text-slate-100 flex-shrink-0">
          {cantidad} <span className="text-slate-500 font-normal">({pct(cantidad, total)}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct(cantidad, total)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Tarjeta de navegación (igual que Reclamos) ─────────────────────────────────
function NavCard({ icon: Icon, titulo, subtitulo, color, onClick }: {
  icon: React.ElementType; titulo: string; subtitulo: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-2xl p-5 text-left transition-all w-full"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "22" }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-100 font-semibold text-sm">{titulo}</p>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{subtitulo}</p>
      </div>
    </button>
  );
}

const COLORS = ["#06b6d4","#a855f7","#f59e0b","#10b981","#f43f5e","#3b82f6","#ec4899","#84cc16"];

// ══════════════════════════════════════════════════════════════════════════════
export default function InstalacionesView({
  onClose,
  sucursalesPermitidas,
}: {
  onClose: () => void;
  sucursalesPermitidas: number[] | null;
}) {
  const [desde,    setDesde]    = useState(inicioAnio);
  const [hasta,    setHasta]    = useState(hoy);
  const [data,     setData]     = useState<Data | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [panel,    setPanel]    = useState<PanelType | null>(null);
  const [sucSel,   setSucSel]   = useState<number | null>(null);
  const [hoveredKpi, setHoveredKpi] = useState<"realizadas" | "pendientes" | null>(null);

  const fetchData = useCallback(async (suc: number | null = null) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ desde, hasta });
    if (suc !== null) params.set("sucursal", String(suc));
    try {
      const res = await fetch(`/api/instalaciones?${params}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => { fetchData(sucSel); }, [fetchData, sucSel]);

  const SUCURSALES_OCULTAS = [0, 3];
  const sucursalesDisponibles: number[] = (sucursalesPermitidas ?? Object.keys(SUCURSALES).map(Number))
    .filter(cod => !SUCURSALES_OCULTAS.includes(cod));

  // ── Header compartido ──────────────────────────────────────────────────────
  const Header = ({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) => (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        {panel && (
          <button
            onClick={() => setPanel(null)}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mb-3"
          >
            <ChevronLeft size={15} /> Volver al resumen
          </button>
        )}
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Tv size={20} className="text-amber-400" /> {titulo}
        </h2>
        {subtitulo && <p className="text-sm text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
      {!panel && (
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
        >
          <X size={15} /> Cerrar
        </button>
      )}
    </div>
  );

  // ── Loading / Error ────────────────────────────────────────────────────────
  if (loading || (error && !data)) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Instalaciones Realizadas" />
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Cargando instalaciones…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const total      = data.total;
  const totalOnts       = data.porModelo.filter(r => r.tipo === 'B').reduce((s, r) => s + r.cantidad, 0);
  const totalDecos      = data.porModelo.filter(r => r.tipo === 'T' || r.tipo === 'M').reduce((s, r) => s + r.cantidad, 0);
  const pendientesOnts  = data.pendientesDetalle.filter(r => r.tipo === 'B').length;
  const pendientesDecos = data.pendientesDetalle.filter(r => r.tipo === 'T' || r.tipo === 'M').length;

  const subtipoPendientesMap = new Map<string, number>();
  for (const r of data.pendientesDetalle)
    subtipoPendientesMap.set(r.subtipo, (subtipoPendientesMap.get(r.subtipo) ?? 0) + 1);
  const subtipoPendientes = [...subtipoPendientesMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // ── Sub-panel: Por Modelo ──────────────────────────────────────────────────
  if (panel === "modelo") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Por modelo de dispositivo" subtitulo={`${total} instalaciones`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {data.porModelo.map((r, i) => (
              <BarRow key={r.modelo} label={r.modelo} cantidad={r.cantidad} total={total} color={COLORS[i % COLORS.length]} />
            ))}
            {data.porModelo.length === 0 && <p className="text-slate-500 text-sm">Sin datos</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Por Subtipo ─────────────────────────────────────────────────
  if (panel === "subtipo") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Por tipo de instalación" subtitulo={`${total} instalaciones`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {data.porSubtipo.map((r, i) => (
              <BarRow key={r.subtipo} label={r.subtipo} cantidad={r.cantidad} total={total} color={COLORS[i % COLORS.length]} />
            ))}
            {data.porSubtipo.length === 0 && <p className="text-slate-500 text-sm">Sin datos</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Tendencia Mensual ───────────────────────────────────────────
  if (panel === "tendencia") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Tendencia mensual" subtitulo={`${total} instalaciones en el período`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.porMes} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }}
                  labelStyle={{ color: "#e2e8f0" }}
                  itemStyle={{ color: "#f59e0b" }}
                />
                <Bar dataKey="cantidad" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Pendientes ─────────────────────────────────────────────────
  if (panel === "pendientes") {
    const pend = data.pendientesDetalle;
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Instalaciones pendientes" subtitulo={`${data.pendientesTotal} sin fecha de solución`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <th className="text-left py-2 px-3">Sucursal</th>
                    <th className="text-left py-2 px-3">Tipo Instalación</th>
                    <th className="text-left py-2 px-3">ID Conexión</th>
                    <th className="text-left py-2 px-3">Modelo</th>
                    <th className="text-left py-2 px-3">MAC</th>
                    <th className="text-left py-2 px-3">Cuadrilla</th>
                    <th className="text-left py-2 px-3">F. Reclamo</th>
                    <th className="text-right py-2 px-3">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {pend.map((r, i) => {
                    const d = r.dias_demora;
                    const chip = d >= 7
                      ? "bg-red-500/20 text-red-400"
                      : d >= 3
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-emerald-500/20 text-emerald-400";
                    return (
                    <tr key={i} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300">{r.sucursal}</td>
                      <td className="py-2 px-3 text-slate-400">{r.subtipo}</td>
                      <td className="py-2 px-3 text-slate-400">{r.id_conexion ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-300">{r.modelo}</td>
                      <td className="py-2 px-3 font-mono text-slate-400">{r.mac}</td>
                      <td className="py-2 px-3 text-slate-400">{r.cuadrilla ?? <span className="text-slate-600">Sin asignar</span>}</td>
                      <td className="py-2 px-3 text-slate-400">{r.fecha_reclamo}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-semibold text-xs ${chip}`}>{d}d</span>
                      </td>
                    </tr>
                    );
                  })}
                  {pend.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-slate-500">Sin instalaciones pendientes</td></tr>
                  )}
                </tbody>
              </table>
              {pend.length >= 500 && (
                <p className="text-xs text-slate-500 mt-3 text-center">Mostrando 500 registros</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Por Cuadrilla ───────────────────────────────────────────────
  if (panel === "cuadrilla") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Por cuadrilla" subtitulo={`${total} instalaciones`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {data.porCuadrilla.map((r, i) => (
              <BarRow key={r.cuadrilla} label={r.cuadrilla} cantidad={r.cantidad} total={total} color={COLORS[i % COLORS.length]} />
            ))}
            {data.porCuadrilla.length === 0 && <p className="text-slate-500 text-sm">Sin datos de cuadrilla</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-panel: Detalle completo ────────────────────────────────────────────
  if (panel === "detalle") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Detalle completo" subtitulo={`${data.detalle.length} registros`} />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <th className="text-left py-2 px-3">Sucursal</th>
                    <th className="text-left py-2 px-3">Modelo</th>
                    <th className="text-left py-2 px-3">MAC</th>
                    <th className="text-left py-2 px-3">ID Conexión</th>
                    <th className="text-left py-2 px-3">F. Reclamo</th>
                    <th className="text-left py-2 px-3">F. Solución</th>
                    <th className="text-left py-2 px-3">Cuadrilla</th>
                    <th className="text-left py-2 px-3">Estado</th>
                    <th className="text-left py-2 px-3">Subtipo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detalle.map((r, i) => (
                    <tr key={i} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300">{r.sucursal}</td>
                      <td className="py-2 px-3 text-slate-300">{r.modelo}</td>
                      <td className="py-2 px-3 font-mono text-slate-400">{r.mac}</td>
                      <td className="py-2 px-3 text-slate-400">{r.id_conexion ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-400">{r.fecha_reclamo}</td>
                      <td className="py-2 px-3 text-slate-300">{r.fecha_solucion}</td>
                      <td className="py-2 px-3 text-slate-400">{r.cuadrilla ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-400">{r.estado_servicio}</td>
                      <td className="py-2 px-3 text-slate-400">{r.subtipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.detalle.length >= 500 && (
                <p className="text-xs text-slate-500 mt-3 text-center">
                  Mostrando 500 registros — filtrá por sucursal para acotar
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        <Header
          titulo="Instalaciones Realizadas"
          subtitulo={`${total} dispositivos instalados en el período`}
        />

        {/* Filtros de fecha */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Desde</label>
            <input
              type="date" value={desde} max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Hasta</label>
            <input
              type="date" value={hasta} min={desde} max={hoy()}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm"
            />
          </div>
          <button
            onClick={() => fetchData(sucSel)}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded transition-colors"
          >
            Actualizar
          </button>
        </div>

        {/* Pills de sucursal */}
        {sucursalesDisponibles.length > 1 && (
          <section>
            <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-2">
              Filtrar por sucursal
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSucSel(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  sucSel === null
                    ? "bg-amber-600 border-amber-500 text-white"
                    : "border-slate-600 text-slate-400 hover:border-amber-500 hover:text-amber-300"
                }`}
              >
                Todas
              </button>
              {sucursalesDisponibles.map((cod) => {
                const sRow = data.porSucursal.find((s) => s.cod_sucursal === cod);
                const activo = sucSel === cod;
                return (
                  <button
                    key={cod}
                    onClick={() => setSucSel(activo ? null : cod)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      activo
                        ? "bg-amber-600 border-amber-500 text-white"
                        : sRow
                        ? "border-slate-600 text-slate-300 hover:border-amber-500 hover:text-amber-300"
                        : "border-slate-700 text-slate-600"
                    }`}
                  >
                    {SUCURSALES[cod] ?? `Suc. ${cod}`}
                    {sRow && <span className="ml-1 opacity-70">{sRow.cantidad}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* KPI — Realizadas (con tooltip donut) */}
        <div
          className="relative"
          onMouseEnter={() => setHoveredKpi("realizadas")}
          onMouseLeave={() => setHoveredKpi(null)}
        >
          <div className="bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl p-5 cursor-pointer transition-colors" onClick={() => setPanel("subtipo")}>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Instalaciones realizadas ↗</p>
            <div className="grid grid-cols-3 divide-x divide-slate-700">
              <div className="text-center px-4">
                <div className="text-3xl font-bold text-white">{total}</div>
                <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total</div>
              </div>
              <div className="text-center px-4">
                <div className="text-3xl font-bold text-cyan-400">{totalOnts}</div>
                <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">ONTs</div>
              </div>
              <div className="text-center px-4">
                <div className="text-3xl font-bold text-purple-400">{totalDecos}</div>
                <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Decos</div>
              </div>
            </div>
          </div>
          <div className={`overflow-hidden transition-all duration-300 ${hoveredKpi === "realizadas" && data.porSubtipo.length > 0 ? "max-h-[320px] mt-2" : "max-h-0"}`}>
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 shadow-2xl flex items-center gap-6">
              <div className="w-[200px] h-[220px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.porSubtipo.map(r => ({ name: r.subtipo, value: r.cantidad }))}
                      cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {data.porSubtipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }} itemStyle={{ color: "#e2e8f0" }} formatter={(v: number, n: string) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2 min-w-0">
                {data.porSubtipo.map((r, i) => (
                  <li key={r.subtipo} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-slate-300 truncate">{r.subtipo}</span>
                    <span className="text-slate-100 font-semibold flex-shrink-0">{r.cantidad}</span>
                    <span className="text-slate-500 w-9 text-right flex-shrink-0">{pct(r.cantidad, total)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* KPI — Pendientes (con tooltip donut) */}
        <div
          className="relative"
          onMouseEnter={() => setHoveredKpi("pendientes")}
          onMouseLeave={() => setHoveredKpi(null)}
        >
          <button
            onClick={() => setPanel("pendientes")}
            className="w-full bg-slate-800 border border-amber-700/40 hover:border-amber-500 rounded-xl p-5 text-left transition-colors"
          >
            <p className="text-xs text-amber-500/70 uppercase tracking-wider mb-4">Instalaciones pendientes ↗</p>
            <div className="grid grid-cols-3 divide-x divide-slate-700">
              <div className="text-center px-4">
                <div className="text-3xl font-bold text-amber-400">{data.pendientesTotal}</div>
                <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total</div>
              </div>
              <div className="text-center px-4">
                <div className="text-3xl font-bold text-cyan-400">{pendientesOnts}</div>
                <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">ONTs</div>
              </div>
              <div className="text-center px-4">
                <div className="text-3xl font-bold text-purple-400">{pendientesDecos}</div>
                <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Decos</div>
              </div>
            </div>
          </button>
          <div className={`overflow-hidden transition-all duration-300 ${hoveredKpi === "pendientes" && subtipoPendientes.length > 0 ? "max-h-[320px] mt-2" : "max-h-0"}`}>
            <div className="bg-slate-800 border border-amber-700/50 rounded-xl p-5 shadow-2xl flex items-center gap-6">
              <div className="w-[200px] h-[220px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={subtipoPendientes} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {subtipoPendientes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }} itemStyle={{ color: "#e2e8f0" }} formatter={(v: number, n: string) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2 min-w-0">
                {subtipoPendientes.map((r, i) => (
                  <li key={r.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-slate-300 truncate">{r.name}</span>
                    <span className="text-slate-100 font-semibold flex-shrink-0">{r.value}</span>
                    <span className="text-slate-500 w-9 text-right flex-shrink-0">{pct(r.value, data.pendientesTotal)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Tabla resumen por sucursal */}
        {data.porSucursal.length > 1 && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700 bg-slate-900/40">
                  <th className="text-left py-3 px-4">Sucursal</th>
                  <th className="text-right py-3 px-4">Instalaciones</th>
                  <th className="text-right py-3 px-4">% del total</th>
                </tr>
              </thead>
              <tbody>
                {data.porSucursal.map((s) => (
                  <tr
                    key={s.cod_sucursal}
                    className="border-b border-slate-800 last:border-0 hover:bg-slate-700/30 transition-colors cursor-pointer"
                    onClick={() => setSucSel(sucSel === s.cod_sucursal ? null : s.cod_sucursal)}
                  >
                    <td className="py-3 px-4 font-medium text-slate-200">{s.nombre}</td>
                    <td className="py-3 px-4 text-right text-amber-400 font-semibold">{s.cantidad}</td>
                    <td className="py-3 px-4 text-right text-slate-400">{pct(s.cantidad, total)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* NavCards */}
        <div>
          <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-3">Ver detalle por</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <NavCard icon={Tv}        titulo="Por modelo"    subtitulo="Dispositivos más instalados"       color="#06b6d4" onClick={() => setPanel("modelo")}    />
            <NavCard icon={Tag}       titulo="Por subtipo"   subtitulo="Tipo de instalación realizada"     color="#a855f7" onClick={() => setPanel("subtipo")}   />
            <NavCard icon={HardHat}   titulo="Por cuadrilla" subtitulo="Cuadrillas que más instalaron"     color="#f43f5e" onClick={() => setPanel("cuadrilla")} />
            <NavCard icon={TrendingUp} titulo="Tendencia"    subtitulo="Evolución mensual"                 color="#f59e0b" onClick={() => setPanel("tendencia")} />
            <NavCard icon={List}      titulo="Detalle"       subtitulo="Listado completo de registros"     color="#10b981" onClick={() => setPanel("detalle")}   />
          </div>
        </div>

      </div>
    </div>
  );
}
