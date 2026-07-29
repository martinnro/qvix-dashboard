"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  X, Loader2, ChevronLeft, Radio, AlertCircle,
  Clock, UserCheck, Layers, Network, Calendar, List, History,
} from "lucide-react";
import ReclamosHistorial from "./ReclamosHistorial";
import ReclamosSucursalDashboard from "./ReclamosSucursalDashboard";
import { getColor } from "../lib/dataUtils";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

interface Row {
  conexion: string;
  cod_sucursal: number;
  estado_incidencia: number;
  nap: string | null;
  fecha: string;
  dias: number;
  problema: string | null;
  cuadrilla: string | null;
}

type Panel = "problema" | "cuadrilla" | "nap" | "antiguedad" | "detalle" | "historial";

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function diasColor(dias: number): { bg: string; text: string } {
  if (dias >= 7) return { bg: "bg-red-500/20", text: "text-red-400" };
  if (dias >= 3) return { bg: "bg-amber-500/20", text: "text-amber-400" };
  return { bg: "bg-emerald-500/20", text: "text-emerald-400" };
}

/* ── Tarjeta de acceso rápido ────────────────────────────────── */
function NavCard({
  icon: Icon,
  titulo,
  subtitulo,
  color,
  onClick,
}: {
  icon: React.ElementType;
  titulo: string;
  subtitulo: string;
  color: string;
  onClick: () => void;
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

/* ── Barra de porcentaje ─────────────────────────────────────── */
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

/* ══════════════════════════════════════════════════════════════ */
export default function ReclamosIncidenciasRed({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sucursalesSel, setSucursalesSel] = useState<number[]>([]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [sucursalView, setSucursalView] = useState<number | null>(null);
  const [sucursalesAccesibles, setSucursalesAccesibles] = useState<number[]>([]);
  const restoredRef = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/incidencias-activas").then((r) => r.json()),
      fetch("/api/mis-sucursales").then((r) => r.json()),
    ]).then(([activas, misSuc]) => {
      if (activas.error) throw new Error(activas.error);
      setRows(activas);
      if (!misSuc.error) setSucursalesAccesibles(misSuc.sucursales ?? []);
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const sucursalesDisponibles = useMemo(
    () => sucursalesAccesibles.length > 0 ? sucursalesAccesibles : [...new Set(rows.map((r) => r.cod_sucursal))].sort((a, b) => a - b),
    [rows, sucursalesAccesibles]
  );

  // Restauración inicial: corre una sola vez cuando terminó de cargar.
  // Usar ref para que NO vuelva a correr cuando el usuario hace "Volver al resumen" (sucursalView → null).
  useEffect(() => {
    if (loading || restoredRef.current) return;
    restoredRef.current = true;

    if (sucursalesDisponibles.length === 1) {
      setSucursalView(sucursalesDisponibles[0]);
      return;
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("sucursal");
      if (!fromUrl) return;
      const cod = parseInt(fromUrl, 10);
      if (sucursalesDisponibles.includes(cod)) setSucursalView(cod);
    } catch { /* SSR guard */ }
  }, [loading, sucursalesDisponibles]);

  // Sincronizar URL + localStorage cuando cambia la sucursal seleccionada
  useEffect(() => {
    try {
      if (sucursalView !== null) {
        history.replaceState(null, "", `?sucursal=${sucursalView}`);
        localStorage.setItem("lastSucursal", String(sucursalView));
      } else {
        history.replaceState(null, "", window.location.pathname);
      }
    } catch { /* SSR guard */ }
  }, [sucursalView]);

  const filtered = useMemo(
    () => sucursalesSel.length === 0 ? rows : rows.filter((r) => sucursalesSel.includes(r.cod_sucursal)),
    [rows, sucursalesSel]
  );

  const total      = filtered.length;
  const pendientes = filtered.filter((r) => r.estado_incidencia === 1).length;
  const asignados  = filtered.filter((r) => r.estado_incidencia === 2).length;

  /* ── Derivados para sub-paneles ── */
  const porProblema = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.problema ?? "Sin clasificar", (map.get(r.problema ?? "Sin clasificar") ?? 0) + 1);
    return [...map.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }, [filtered]);

  const porCuadrilla = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      if (!r.cuadrilla) continue;
      map.set(r.cuadrilla, (map.get(r.cuadrilla) ?? 0) + 1);
    }
    return [...map.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }, [filtered]);

  const porNap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      if (!r.nap || r.nap === "N.") continue;
      map.set(r.nap, (map.get(r.nap) ?? 0) + 1);
    }
    return [...map.entries()].map(([nap, cantidad]) => ({ nap, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }, [filtered]);

  const porAntiguedad = useMemo(() => {
    const buckets = [
      { label: "Hoy (0 días)",    min: 0, max: 0 },
      { label: "1–2 días",        min: 1, max: 2 },
      { label: "3–6 días",        min: 3, max: 6 },
      { label: "7–14 días",       min: 7, max: 14 },
      { label: "Más de 14 días",  min: 15, max: Infinity },
    ];
    return buckets.map((b) => ({
      ...b,
      cantidad: filtered.filter((r) => r.dias >= b.min && r.dias <= b.max).length,
    }));
  }, [filtered]);

  const toggleSucursal = (cod: number) =>
    setSucursalesSel((prev) => prev.includes(cod) ? prev.filter((s) => s !== cod) : [...prev, cod]);

  /* ── Filtro de sucursal dentro de un sub-panel (no navega, filtra) ── */
  const FiltroSucursalPanel = () => {
    if (sucursalesDisponibles.length <= 1) return null;
    const conReclamos = new Set(filtered.map((r) => r.cod_sucursal));
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 uppercase tracking-wider mr-1">Sucursal:</span>
        <button
          onClick={() => setSucursalesSel([])}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            sucursalesSel.length === 0
              ? "bg-indigo-600 border-indigo-500 text-white"
              : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
          }`}
        >
          Todas
        </button>
        {sucursalesDisponibles.map((cod) => {
          const activo = sucursalesSel.includes(cod);
          const cant = filtered.filter((r) => r.cod_sucursal === cod).length;
          const tieneDatos = conReclamos.has(cod);
          return (
            <button
              key={cod}
              onClick={() => toggleSucursal(cod)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activo
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : tieneDatos
                  ? "border-slate-600 text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
                  : "border-slate-700 text-slate-600"
              }`}
            >
              {SUCURSALES[cod] ?? `Suc. ${cod}`}
              {tieneDatos && <span className="ml-1 opacity-60">{cant}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  /* ── Header compartido ── */
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
          <Radio size={20} className="text-rose-400" /> {titulo}
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

  /* ── Selector de sucursal: click abre el dashboard de esa sucursal (overview only) ── */
  const FiltroSucursal = () => (
    sucursalesDisponibles.length > 1 ? (
      <section>
        <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-2">
          Dashboard por sucursal
        </h3>
        <div className="flex flex-wrap gap-2">
          {sucursalesDisponibles.map((cod) => {
            const cant = rows.filter((r) => r.cod_sucursal === cod).length;
            return (
              <button
                key={cod}
                onClick={() => setSucursalView(cod)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-600 bg-slate-800 text-slate-200 hover:border-rose-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                {SUCURSALES[cod] ?? `Suc. ${cod}`}
                {cant > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold">{cant}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    ) : null
  );

  /* ────────────────────────────────────────────────────────────
     DASHBOARD DE SUCURSAL
  ──────────────────────────────────────────────────────────── */
  if (sucursalView !== null) {
    return (
      <ReclamosSucursalDashboard
        codSucursal={sucursalView}
        onBack={() => setSucursalView(null)}
        onClose={onClose}
      />
    );
  }

  /* ────────────────────────────────────────────────────────────
     LOADING / ERROR
  ──────────────────────────────────────────────────────────── */
  if (loading || error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Incidencias en Curso" subtitulo="Reclamos activos — pendientes y asignados" />
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Cargando incidencias...
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

  /* ────────────────────────────────────────────────────────────
     SUB-PANEL: PROBLEMA
  ──────────────────────────────────────────────────────────── */
  if (panel === "problema") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Por tipo de problema" subtitulo={`${total} reclamos activos`} />
          <FiltroSucursalPanel />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {porProblema.map((p, i) => (
              <BarRow key={p.nombre} label={p.nombre} cantidad={p.cantidad} total={total} color={getColor(p.nombre, i)} />
            ))}
            {porProblema.length === 0 && <p className="text-slate-500 text-sm">Sin datos</p>}
          </div>
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────
     SUB-PANEL: CUADRILLA
  ──────────────────────────────────────────────────────────── */
  if (panel === "cuadrilla") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Por cuadrilla" subtitulo={`${total} reclamos asignados`} />
          <FiltroSucursalPanel />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {porCuadrilla.map((c, i) => (
              <BarRow key={c.nombre} label={c.nombre} cantidad={c.cantidad} total={total} color={getColor(c.nombre, i)} />
            ))}
            {porCuadrilla.length === 0 && <p className="text-slate-500 text-sm">Sin cuadrillas asignadas</p>}
          </div>
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────
     SUB-PANEL: NAP
  ──────────────────────────────────────────────────────────── */
  if (panel === "nap") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="NAPs con reclamos" subtitulo={`${porNap.length} NAPs afectadas`} />
          <FiltroSucursalPanel />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-3">
            {porNap.map((n, i) => (
              <BarRow key={n.nap} label={n.nap} cantidad={n.cantidad} total={total} color={getColor(n.nap, i)} />
            ))}
            {porNap.length === 0 && <p className="text-slate-500 text-sm">Sin datos de NAP</p>}
          </div>
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────
     SUB-PANEL: ANTIGÜEDAD
  ──────────────────────────────────────────────────────────── */
  if (panel === "antiguedad") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Antigüedad de reclamos" subtitulo="Cuánto tiempo llevan abiertos" />
          <FiltroSucursalPanel />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            {porAntiguedad.map((b, i) => (
              <BarRow key={b.label} label={b.label} cantidad={b.cantidad} total={total}
                color={i === 0 ? "#10b981" : i === 1 ? "#06b6d4" : i === 2 ? "#f59e0b" : i === 3 ? "#f97316" : "#f43f5e"} />
            ))}
          </div>

          {/* Lista de los más viejos */}
          {filtered.filter((r) => r.dias >= 7).length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
              <h3 className="text-slate-200 font-semibold text-sm mb-4">
                Reclamos con 7 o más días abiertos
                <span className="ml-2 text-xs text-red-400 font-normal">({filtered.filter((r) => r.dias >= 7).length})</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                      <th className="text-left py-2 px-3">Conexión</th>
                      <th className="text-left py-2 px-3">Problema</th>
                      <th className="text-left py-2 px-3">Cuadrilla</th>
                      <th className="text-left py-2 px-3">Fecha</th>
                      <th className="text-right py-2 px-3">Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .filter((r) => r.dias >= 7)
                      .map((r, i) => {
                        const { bg, text } = diasColor(r.dias);
                        return (
                          <tr key={i} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                            <td className="py-2 px-3 font-mono text-slate-200">{r.conexion}</td>
                            <td className="py-2 px-3 text-slate-300 max-w-[180px] truncate">{r.problema ?? "—"}</td>
                            <td className="py-2 px-3 text-slate-400">{r.cuadrilla ?? "—"}</td>
                            <td className="py-2 px-3 text-slate-400">{r.fecha}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={`px-2 py-0.5 rounded-full font-semibold ${bg} ${text}`}>{r.dias}d</span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────
     SUB-PANEL: DETALLE COMPLETO
  ──────────────────────────────────────────────────────────── */
  if (panel === "detalle") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
          <Header titulo="Detalle completo" subtitulo={`${filtered.length} reclamos activos`} />
          <FiltroSucursalPanel />
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <th className="text-left py-2 px-3">Conexión</th>
                    <th className="text-left py-2 px-3">NAP</th>
                    <th className="text-left py-2 px-3">Problema</th>
                    <th className="text-left py-2 px-3">Cuadrilla</th>
                    <th className="text-left py-2 px-3">Estado</th>
                    <th className="text-left py-2 px-3">Fecha</th>
                    <th className="text-right py-2 px-3">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((r, i) => {
                    const { bg, text } = diasColor(r.dias);
                    return (
                      <tr key={i} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                        <td className="py-2 px-3 font-mono text-slate-200">{r.conexion}</td>
                        <td className="py-2 px-3 font-mono text-slate-300">{r.nap || "—"}</td>
                        <td className="py-2 px-3 text-slate-300 max-w-[160px] truncate">{r.problema ?? "—"}</td>
                        <td className="py-2 px-3 text-slate-400">{r.cuadrilla ?? "—"}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full ${r.estado_incidencia === 1 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                            {r.estado_incidencia === 1 ? "Pendiente" : "Asignado"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400">{r.fecha}</td>
                        <td className="py-2 px-3 text-right">
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${bg} ${text}`}>{r.dias}d</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > 200 && (
                <p className="text-xs text-slate-500 mt-3 text-center">
                  Mostrando 200 de {filtered.length} — filtrá por sucursal para acotar
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────
     SUB-PANEL: HISTORIAL
  ──────────────────────────────────────────────────────────── */
  if (panel === "historial") {
    return (
      <ReclamosHistorial onBack={() => setPanel(null)} onClose={onClose} />
    );
  }

  /* ────────────────────────────────────────────────────────────
     OVERVIEW (panel === null)
  ──────────────────────────────────────────────────────────── */
  const porSucursal = sucursalesDisponibles.map((cod) => {
    const sRows = filtered.filter((r) => r.cod_sucursal === cod);
    return {
      cod,
      nombre: SUCURSALES[cod] ?? `Suc. ${cod}`,
      total: sRows.length,
      pendientes: sRows.filter((r) => r.estado_incidencia === 1).length,
      asignados: sRows.filter((r) => r.estado_incidencia === 2).length,
      asignadosMas7: sRows.filter((r) => r.estado_incidencia === 2 && r.dias >= 7).length,
    };
  }).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        <Header titulo="Incidencias en Curso" subtitulo="Reclamos activos por red — pendientes y asignados" />

        <FiltroSucursal />

        {/* Resumen global */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-white">{total}</div>
            <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total activos</div>
          </div>
          <div className="bg-slate-800 border border-amber-700/50 rounded-xl p-5 text-center">
            <div className="flex items-center justify-center gap-2">
              <Clock size={16} className="text-amber-400" />
              <div className="text-3xl font-bold text-amber-400">{pendientes}</div>
            </div>
            <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Pendientes</div>
          </div>
          <div className="bg-slate-800 border border-emerald-700/50 rounded-xl p-5 text-center">
            <div className="flex items-center justify-center gap-2">
              <UserCheck size={16} className="text-emerald-400" />
              <div className="text-3xl font-bold text-emerald-400">{asignados}</div>
            </div>
            <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Asignados</div>
          </div>
        </div>

        {/* Tabla por sucursal (solo si hay más de una) */}
        {porSucursal.length > 1 && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700 bg-slate-900/40">
                  <th className="text-left py-3 px-4">Sucursal</th>
                  <th className="text-right py-3 px-4">Pendientes</th>
                  <th className="text-right py-3 px-4">Asignados</th>
                  <th className="text-right py-3 px-4 text-red-400">+7 días</th>
                  <th className="text-right py-3 px-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {porSucursal.map((s) => (
                  <tr key={s.cod} className={`border-b border-slate-800 last:border-0 transition-colors ${s.total === 0 ? "opacity-40" : "hover:bg-slate-700/30"}`}>
                    <td className="py-3 px-4 font-medium">
                      <span className={s.total === 0 ? "text-slate-500" : "text-slate-200"}>{s.nombre}</span>
                      {s.total === 0 && <span className="ml-2 text-[11px] text-emerald-600 font-normal">al día</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-amber-400 font-semibold">{s.pendientes > 0 ? s.pendientes : <span className="text-slate-700">—</span>}</td>
                    <td className="py-3 px-4 text-right text-emerald-400 font-semibold">{s.asignados > 0 ? s.asignados : <span className="text-slate-700">—</span>}</td>
                    <td className="py-3 px-4 text-right">
                      {s.asignadosMas7 > 0 ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold text-xs">
                          {s.asignadosMas7}
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold">
                      {s.total > 0 ? <span className="text-slate-100">{s.total}</span> : <span className="text-emerald-600 text-sm">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tarjetas de acceso rápido */}
        <div>
          <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-3">Ver detalle por</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <NavCard icon={Calendar} titulo="Antigüedad" subtitulo="Cuántos días llevan abiertos" color="#f43f5e" onClick={() => setPanel("antiguedad")} />
            <NavCard icon={Layers} titulo="Tipo de problema" subtitulo="Qué falla en cada reclamo" color="#f97316" onClick={() => setPanel("problema")} />
            <NavCard icon={UserCheck} titulo="Cuadrilla" subtitulo="Quién tiene asignado cada reclamo" color="#06b6d4" onClick={() => setPanel("cuadrilla")} />
            <NavCard icon={Network} titulo="NAPs" subtitulo="Nodos con más reclamos activos" color="#a855f7" onClick={() => setPanel("nap")} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setPanel("detalle")}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <List size={15} /> Ver listado completo de incidencias
          </button>
          <button
            onClick={() => setPanel("historial")}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <History size={15} /> Historial de reclamos
          </button>
        </div>

      </div>
    </div>
  );
}
