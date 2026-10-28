"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Loader2, AlertCircle, Download, RefreshCw, CheckCircle2, XCircle, ArrowUp, ArrowDown, ArrowUpDown, Calendar } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

interface DetalleRow {
  id_conexion: number;
  cod_sucursal: number;
  sucursal: string;
  estado_servicio: string;
  tiene_ods: boolean;
  id_orden_servicio: number | null;
  estado_incidencia: string | null;
  estado_ods: string | null;
  fecha_reclamo: string | null;
  fecha_asignacion: string | null;
  fecha_solucion: string | null;
  motivo: string | null;
  nap_primer_nivel: string | null;
  nap_segundo_nivel: string | null;
  dias: number | null;
  dias_desde_vencimiento: boolean;
  ont: number;
  iptv: number;
  ott: number;
  antena: number;
  total_dispositivos: number;
}

interface ModeloDispositivo { nombre_dispositivo: string; tiene_ods: boolean; cantidad: number }

interface Resumen {
  porModeloDispositivo: { ONT: ModeloDispositivo[]; IPTV: ModeloDispositivo[]; OTT: ModeloDispositivo[]; ANTENA: ModeloDispositivo[] };
}

interface Data {
  total: number;
  conOds: number;
  sinOds: number;
  porSucursal: { cod_sucursal: number; nombre: string; total: number; conOds: number; sinOds: number }[];
  detalle: DetalleRow[];
  resumen: Resumen;
}

type FiltroOds = "todos" | "si" | "no";
type TipoDispositivo = "OTT" | "IPTV" | "ONT" | "ANTENA";
type SortKey =
  | "id_conexion" | "sucursal" | "tiene_ods" | "id_orden_servicio"
  | "estado_incidencia" | "ott" | "iptv" | "ont" | "antena" | "total_dispositivos"
  | "motivo" | "fecha_reclamo" | "fecha_asignacion" | "fecha_solucion" | "dias";

function compararFilas(a: DetalleRow, b: DetalleRow, key: SortKey, dir: "asc" | "desc"): number {
  const mul = dir === "asc" ? 1 : -1;
  const av: unknown = key === "tiene_ods" ? (a.tiene_ods ? 1 : 0) : a[key];
  const bv: unknown = key === "tiene_ods" ? (b.tiene_ods ? 1 : 0) : b[key];
  if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
  if (bv === null || bv === undefined) return -1;
  if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
  if (key.startsWith("fecha")) return (new Date(String(av)).getTime() - new Date(String(bv)).getTime()) * mul;
  return String(av).localeCompare(String(bv), "es") * mul;
}

function SortHeader({ label, icon, align = "left", sticky = false, active, dir, onClick }: {
  label: string; icon?: React.ReactNode; align?: "left" | "right" | "center"; sticky?: boolean; active: boolean; dir: "asc" | "desc"; onClick: () => void;
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th
      className={`py-2 px-3 font-medium whitespace-nowrap bg-slate-800 ${alignClass} ${sticky ? "sticky left-0 z-20" : ""}`}
      title={label}
    >
      <button
        onClick={onClick}
        className={`flex items-center gap-1 ${justify} w-full hover:text-slate-200 transition-colors ${active ? "text-slate-200" : ""}`}
      >
        {icon}
        {label}
        {active ? (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-30" />}
      </button>
    </th>
  );
}

function fmtFecha(f: string | null): string {
  if (!f) return "—";
  return new Date(f).toLocaleDateString("es-AR");
}

const COLOR_TIPO: Record<TipoDispositivo, string> = { OTT: "#6366f1", IPTV: "#22d3ee", ONT: "#10b981", ANTENA: "#f59e0b" };
const PALETTE_OTROS = ["#10b981", "#6366f1", "#22d3ee", "#a78bfa", "#e879f9", "#a3e635"];

function colorMotivo(categoria: string, idxOtros: number): string {
  if (categoria.startsWith("Sin ODS")) return "#f43f5e";
  if (categoria === "Asignada a Cuadrilla") return "#f59e0b";
  return PALETTE_OTROS[idxOtros % PALETTE_OTROS.length];
}

// Misma lógica que se usaba a mano en Excel: sin ODS / ODS abierta (Asignada a Cuadrilla) /
// motivo real de cierre cuando la ODS ya está Cerrada.
function categoriaMotivo(d: DetalleRow, hoy: string): string {
  if (!d.tiene_ods) return `Sin ODS al ${hoy}`;
  if (d.estado_incidencia === "Cerrada") return d.motivo ?? "Cerrada sin motivo";
  return "Asignada a Cuadrilla";
}

const tooltipStyle = { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12, color: "#e2e8f0" };

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

// Tarjeta con torta + lista de categorías a modo de referencia directa (no solo color).
function ResumenPieCard({ titulo, data, extra }: {
  titulo: string;
  data: { label: string; value: number; color: string }[];
  extra?: React.ReactNode;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const conValor = data.filter((d) => d.value > 0);
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-sm font-semibold text-slate-200">{titulo}</p>
        {extra}
      </div>
      {conValor.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">Sin datos.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-28 h-28 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={conValor} dataKey="value" nameKey="label" innerRadius={30} outerRadius={54} paddingAngle={2} stroke="none">
                  {conValor.map((d) => <Cell key={d.label} fill={d.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [`${Number(value).toLocaleString("es-AR")} (${pct(Number(value), total)}%)`, String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 min-w-0 space-y-1.5">
            {conValor.map((d) => (
              <li key={d.label} className="flex items-center gap-2 text-xs min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-slate-300 truncate flex-1" title={d.label}>{d.label}</span>
                <span className="text-slate-400 flex-shrink-0">{d.value.toLocaleString("es-AR")}</span>
                <span className="text-slate-500 flex-shrink-0 w-10 text-right">{pct(d.value, total)}%</span>
              </li>
            ))}
            <li className="flex items-center gap-2 text-xs min-w-0 pt-1.5 mt-1.5 border-t border-slate-700">
              <span className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="text-slate-300 font-semibold flex-1">Total</span>
              <span className="text-slate-200 font-semibold flex-shrink-0">{total.toLocaleString("es-AR")}</span>
              <span className="text-slate-500 flex-shrink-0 w-10 text-right">100%</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sublabel, color, onClick, activo }: {
  label: string; value: string | number; sublabel?: string; color: string; onClick?: () => void; activo?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`text-left bg-slate-800 border rounded-xl p-4 transition-colors ${
        onClick ? "cursor-pointer hover:border-slate-500" : ""
      } ${activo ? "border-indigo-500" : "border-slate-700"}`}
    >
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 truncate">{label}</p>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </Comp>
  );
}

export default function AuditoriaCorteView({ onClose, sucursalesPermitidas }: {
  onClose: () => void; sucursalesPermitidas: number[] | null;
}) {
  const sucursalesDisponibles: number[] = sucursalesPermitidas
    ? Object.keys(SUCURSALES).map(Number).filter((c) => sucursalesPermitidas.includes(c))
    : Object.keys(SUCURSALES).map(Number);

  const [sucSel, setSucSel] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroOds, setFiltroOds] = useState<FiltroOds>("todos");
  const [modeloTipo, setModeloTipo] = useState<TipoDispositivo>("OTT");
  const [sortKey, setSortKey] = useState<SortKey>("id_conexion");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    try {
      const res = await fetch(`/api/auditoria-corte?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sucSel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    if (filtroOds !== "todos") params.set("tieneOds", filtroOds);
    return `/api/export/auditoria-corte?${params}`;
  };

  const filasFiltradas = useMemo(() => (
    data ? data.detalle.filter((d) => filtroOds === "todos" || (filtroOds === "si" ? d.tiene_ods : !d.tiene_ods)) : []
  ), [data, filtroOds]);
  const filasOrdenadas = useMemo(() => (
    [...filasFiltradas].sort((a, b) => compararFilas(a, b, sortKey, sortDir))
  ), [filasFiltradas, sortKey, sortDir]);

  const hoy = useMemo(() => new Date().toLocaleDateString("es-AR"), []);

  // Se recalculan sobre filasFiltradas para que las tarjetas Con ODS / Sin ODS también filtren
  // los gráficos de abajo, no solo la tabla de detalle.
  const porMotivoCierre = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filasFiltradas) {
      const categoria = categoriaMotivo(d, hoy);
      map.set(categoria, (map.get(categoria) ?? 0) + 1);
    }
    return [...map.entries()].map(([categoria, cantidad]) => ({ categoria, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }, [filasFiltradas, hoy]);

  const porTipoDispositivo = useMemo(() => ([
    { tipo: "ONT", cantidad: filasFiltradas.reduce((s, d) => s + d.ont, 0) },
    { tipo: "IPTV", cantidad: filasFiltradas.reduce((s, d) => s + d.iptv, 0) },
    { tipo: "OTT", cantidad: filasFiltradas.reduce((s, d) => s + d.ott, 0) },
    { tipo: "ANTENA", cantidad: filasFiltradas.reduce((s, d) => s + d.antena, 0) },
  ].filter((d) => d.cantidad > 0)), [filasFiltradas]);

  const modeloFiltrado = useMemo(() => {
    const raw = data?.resumen.porModeloDispositivo[modeloTipo] ?? [];
    const filtrado = raw.filter((m) => filtroOds === "todos" || (filtroOds === "si" ? m.tiene_ods : !m.tiene_ods));
    const map = new Map<string, number>();
    for (const m of filtrado) map.set(m.nombre_dispositivo, (map.get(m.nombre_dispositivo) ?? 0) + m.cantidad);
    return [...map.entries()].map(([nombre_dispositivo, cantidad]) => ({ nombre_dispositivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }, [data, modeloTipo, filtroOds]);

  const tiposConDatos = useMemo(() => {
    if (!data) return [];
    return (["OTT", "IPTV", "ONT", "ANTENA"] as TipoDispositivo[]).filter((t) =>
      data.resumen.porModeloDispositivo[t].some((m) => filtroOds === "todos" || (filtroOds === "si" ? m.tiene_ods : !m.tiene_ods))
    );
  }, [data, filtroOds]);

  useEffect(() => {
    if (tiposConDatos.length > 0 && !tiposConDatos.includes(modeloTipo)) setModeloTipo(tiposConDatos[0]);
  }, [tiposConDatos, modeloTipo]);

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Auditoría de Gestión de Corte</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {data ? `${data.total.toLocaleString("es-AR")} suspendidos en Gestión de Corte` : "Suspendidos en Gestión de Corte vs. ODS de Retiro de Equipo"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <X size={15} /> Cerrar
          </button>
        </div>
      </div>

      {sucursalesDisponibles.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSucSel(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              sucSel === null ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
            }`}
          >
            Todas
          </button>
          {sucursalesDisponibles.map((cod) => (
            <button key={cod} onClick={() => setSucSel(sucSel === cod ? null : cod)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                sucSel === cod ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
              }`}
            >
              {SUCURSALES[cod]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label="Total susp. en G. Corte" value={data.total} color="#f8fafc"
              onClick={() => setFiltroOds("todos")} activo={filtroOds === "todos"} />
            <StatTile label="Con ODS de retiro" value={data.conOds}
              sublabel={`${data.total > 0 ? Math.round((data.conOds / data.total) * 100) : 0}%`}
              color="#10b981" onClick={() => setFiltroOds("si")} activo={filtroOds === "si"} />
            <StatTile label="Sin ODS de retiro" value={data.sinOds}
              sublabel={`${data.total > 0 ? Math.round((data.sinOds / data.total) * 100) : 0}% — requieren seguimiento`}
              color="#f43f5e" onClick={() => setFiltroOds("no")} activo={filtroOds === "no"} />
          </div>

          <div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ResumenPieCard
                titulo="Suspendidos por Motivo de Cierre"
                data={porMotivoCierre.map((m, i, arr) => ({
                  label: m.categoria,
                  value: m.cantidad,
                  color: colorMotivo(m.categoria, arr.slice(0, i).filter((x) => !x.categoria.startsWith("Sin ODS") && x.categoria !== "Asignada a Cuadrilla").length),
                }))}
              />
              <ResumenPieCard
                titulo="Distribución por Dispositivo"
                data={modeloFiltrado.map((m, i) => ({
                  label: m.nombre_dispositivo,
                  value: m.cantidad,
                  color: PALETTE_OTROS[i % PALETTE_OTROS.length],
                }))}
                extra={
                  <div className="flex gap-1">
                    {tiposConDatos.map((t) => (
                      <button key={t} onClick={() => setModeloTipo(t)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                          modeloTipo === t ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                }
              />
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                <p className="text-sm font-semibold text-slate-200 mb-3">Dispositivos por Tipo</p>
                {porTipoDispositivo.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">Sin datos.</p>
                ) : (
                  <>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={porTipoDispositivo} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                          <CartesianGrid horizontal={false} stroke="#334155" />
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="tipo" width={52} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            itemStyle={{ color: "#f8fafc" }}
                            labelStyle={{ color: "#f8fafc" }}
                            formatter={(value) => [Number(value).toLocaleString("es-AR"), "Cantidad"]}
                            cursor={{ fill: "rgba(148,163,184,0.08)" }}
                          />
                          <Bar dataKey="cantidad" radius={[0, 4, 4, 0]}>
                            {porTipoDispositivo.map((d) => (
                              <Cell key={d.tipo} fill={COLOR_TIPO[d.tipo as TipoDispositivo] ?? "#64748b"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="flex flex-wrap justify-between gap-x-3 gap-y-1 mt-1 px-1">
                      {porTipoDispositivo.map((d) => (
                        <li key={d.tipo} className="text-xs text-slate-400 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_TIPO[d.tipo as TipoDispositivo] ?? "#64748b" }} />
                          {d.tipo}: <span className="text-slate-200 font-semibold">{d.cantidad.toLocaleString("es-AR")}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Filtrar por</span>
              {([
                ["todos", "Todos"],
                ["si", "Con ODS"],
                ["no", "Sin ODS"],
              ] as [FiltroOds, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setFiltroOds(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filtroOds === key ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {data && (
              <a href={exportUrl()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors"
              >
                <Download size={13} /> Exportar Excel
              </a>
            )}
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <p className="text-[11px] text-slate-500 mb-2 sm:hidden">Deslizá para ver todas las columnas →</p>
            <div className="overflow-auto max-h-[65vh] rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700 sticky top-0 z-10">
                    <SortHeader label="ID Conexión" sticky active={sortKey === "id_conexion"} dir={sortDir} onClick={() => toggleSort("id_conexion")} />
                    <SortHeader label="Sucursal" active={sortKey === "sucursal"} dir={sortDir} onClick={() => toggleSort("sucursal")} />
                    <SortHeader label="ODS Retiro" align="center" active={sortKey === "tiene_ods"} dir={sortDir} onClick={() => toggleSort("tiene_ods")} />
                    <SortHeader label="N° ODS" active={sortKey === "id_orden_servicio"} dir={sortDir} onClick={() => toggleSort("id_orden_servicio")} />
                    <SortHeader label="Estado" active={sortKey === "estado_incidencia"} dir={sortDir} onClick={() => toggleSort("estado_incidencia")} />
                    <SortHeader label="OTT" align="right" active={sortKey === "ott"} dir={sortDir} onClick={() => toggleSort("ott")} />
                    <SortHeader label="IPTV" align="right" active={sortKey === "iptv"} dir={sortDir} onClick={() => toggleSort("iptv")} />
                    <SortHeader label="ONT" align="right" active={sortKey === "ont"} dir={sortDir} onClick={() => toggleSort("ont")} />
                    <SortHeader label="Antena" align="right" active={sortKey === "antena"} dir={sortDir} onClick={() => toggleSort("antena")} />
                    <SortHeader label="Total Disp." align="right" active={sortKey === "total_dispositivos"} dir={sortDir} onClick={() => toggleSort("total_dispositivos")} />
                    <SortHeader label="Motivo" active={sortKey === "motivo"} dir={sortDir} onClick={() => toggleSort("motivo")} />
                    <SortHeader label="Reclamo" icon={<Calendar size={11} />} active={sortKey === "fecha_reclamo"} dir={sortDir} onClick={() => toggleSort("fecha_reclamo")} />
                    <SortHeader label="Asignación" icon={<Calendar size={11} />} active={sortKey === "fecha_asignacion"} dir={sortDir} onClick={() => toggleSort("fecha_asignacion")} />
                    <SortHeader label="Solución" icon={<Calendar size={11} />} active={sortKey === "fecha_solucion"} dir={sortDir} onClick={() => toggleSort("fecha_solucion")} />
                    <SortHeader label="Días" align="right" active={sortKey === "dias"} dir={sortDir} onClick={() => toggleSort("dias")} />
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.map((r) => (
                    <tr key={r.id_conexion} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300 font-mono sticky left-0 z-[5] bg-slate-800">{r.id_conexion}</td>
                      <td className="py-2 px-3 text-slate-400">{r.sucursal}</td>
                      <td className="py-2 px-3 text-center">
                        {r.tiene_ods
                          ? <CheckCircle2 size={15} className="text-emerald-400 mx-auto" />
                          : <XCircle size={15} className="text-rose-400 mx-auto" />}
                      </td>
                      <td className="py-2 px-3 text-slate-300 font-mono">{r.id_orden_servicio ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-300">{r.estado_incidencia ?? "—"}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{r.ott}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{r.iptv}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{r.ont}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{r.antena}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-200">{r.total_dispositivos}</td>
                      <td className="py-2 px-3 text-slate-400 max-w-[180px] truncate" title={r.motivo ?? ""}>{r.motivo ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-400">{fmtFecha(r.fecha_reclamo)}</td>
                      <td className="py-2 px-3 text-slate-400">{fmtFecha(r.fecha_asignacion)}</td>
                      <td className="py-2 px-3 text-slate-400">{fmtFecha(r.fecha_solucion)}</td>
                      <td
                        className={`py-2 px-3 text-right ${r.dias_desde_vencimiento ? "text-amber-400" : "text-slate-300"}`}
                        title={r.dias_desde_vencimiento ? "Calculado desde el vencimiento de la última factura impaga (no hay ODS con fecha de reclamo)" : undefined}
                      >
                        {r.dias ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filasOrdenadas.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-8">Sin resultados para este filtro.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
