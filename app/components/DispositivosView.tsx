"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { RefreshCw, Monitor, Wifi, Download, PackageOpen, ChevronDown, ChevronUp, ArrowLeft, ChevronsUpDown } from "lucide-react";
import { getColorById } from "./MapaUtils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { useTheme } from "../lib/useTheme";

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

const SUCURSAL_COLORS: Record<number, string> = {
  0: "#64748b",
  1: "#06b6d4",
  3: "#f97316",
  4: "#6366f1",
  5: "#10b981",
  6: "#f59e0b",
  7: "#f43f5e",
  8: "#a855f7",
};

interface DispositivoRow {
  cod_sucursal: number;
  modelo: string;
  tipo_dispositivo: string;
  Estado_Servicio?: number;
  estado_nombre?: string;
  cantidad: number;
}

interface Data {
  activos: DispositivoRow[];
  stock: DispositivoRow[];
}

interface StockDetalleRow {
  sucursal: string;
  tipo: string;
  modelo: string;
  mac: string;
  mta_mac: string;
  fecha_carga: string;
  estado_stock: string;
  ultima_conexion: string | number;
  ultimo_estado_servicio: string;
  estado_dispositivo: string;
  id_recibo_cm: string;
  id_order_servicio: string;
  fecha_carga_recibo: string;
  tipo_retiro: string;
  nom_usr: string;
}

type EstadoColor = { background: string; color: string; boxShadow: string };

const ESTADO_COLOR_MAP: Record<string, EstadoColor> = {
  "DISPONIBLE": { background: "rgba(5,150,105,0.2)",  color: "#34d399", boxShadow: "0 0 0 1px rgba(52,211,153,0.5)"  },
  "ASIGNADO":   { background: "rgba(37,99,235,0.2)",  color: "#60a5fa", boxShadow: "0 0 0 1px rgba(96,165,250,0.5)"  },
  "CONECTADO":  { background: "rgba(6,182,212,0.2)",  color: "#22d3ee", boxShadow: "0 0 0 1px rgba(34,211,238,0.5)"  },
  "EN ESPERA":  { background: "rgba(217,119,6,0.2)",  color: "#fbbf24", boxShadow: "0 0 0 1px rgba(251,191,36,0.5)"  },
  "DAÑADO":     { background: "rgba(225,29,72,0.2)",  color: "#fb7185", boxShadow: "0 0 0 1px rgba(251,113,133,0.5)" },
  "TRANSFER":   { background: "rgba(124,58,237,0.2)", color: "#a78bfa", boxShadow: "0 0 0 1px rgba(167,139,250,0.5)" },
  "PERDIDO":    { background: "rgba(234,88,12,0.2)",  color: "#fb923c", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)"  },
  "DE BAJA":    { background: "rgba(71,85,105,0.3)",  color: "#94a3b8", boxShadow: "0 0 0 1px rgba(148,163,184,0.4)" },
  "VENDIDO":    { background: "rgba(219,39,119,0.2)", color: "#f472b6", boxShadow: "0 0 0 1px rgba(244,114,182,0.5)" },
};
const ESTADO_COLOR_FALLBACK: EstadoColor = { background: "rgba(51,65,85,0.4)", color: "#94a3b8", boxShadow: "0 0 0 1px rgba(100,116,139,0.3)" };

function getEstadoColor(estado: string): EstadoColor {
  return ESTADO_COLOR_MAP[estado.trim()] ?? ESTADO_COLOR_FALLBACK;
}


type SortCol = "tipo" | "modelo" | "fecha_carga" | "estado_stock" | "estado_dispositivo" | "fecha_carga_recibo";

function parseFechaAR(s: string): number {
  if (!s) return 0;
  const [d, m, y] = s.split("/");
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
}

function StockDetalleModal({ onClose, sucursal, tipo }: {
  onClose: () => void;
  sucursal: number | null;
  tipo: "ont" | "deco" | null;
}) {
  const [allRows, setAllRows]         = useState<StockDetalleRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [modelosFiltro, setModelosFiltro]       = useState<Set<string>>(new Set());
  const [modeloMenuOpen, setModeloMenuOpen]     = useState(false);
  const modeloMenuRef                           = useRef<HTMLDivElement>(null);
  const [estadosFiltro, setEstadosFiltro]       = useState<Set<string>>(new Set());
  const [estadoMenuOpen, setEstadoMenuOpen]     = useState(false);
  const estadoMenuRef                           = useRef<HTMLDivElement>(null);
  const [tipoRetiroFiltro, setTipoRetiroFiltro] = useState<string | null>(null);
  const [tipoFiltro, setTipoFiltro]   = useState<"all" | "ont" | "deco">("all");
  const [sort, setSort]               = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "fecha_carga", dir: "desc" });

  useEffect(() => {
    if (!modeloMenuOpen) return;
    function handler(e: MouseEvent) {
      if (modeloMenuRef.current && !modeloMenuRef.current.contains(e.target as Node))
        setModeloMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modeloMenuOpen]);

  useEffect(() => {
    if (!estadoMenuOpen) return;
    function handler(e: MouseEvent) {
      if (estadoMenuRef.current && !estadoMenuRef.current.contains(e.target as Node))
        setEstadoMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [estadoMenuOpen]);

  useEffect(() => {
    // Sin filtro de tipo para construir el mapa de colores desde todos los estados posibles
    const params = new URLSearchParams();
    if (sucursal !== null) params.set("sucursal", String(sucursal));
    fetch(`/api/dispositivos/stock-detalle?${params}`)
      .then((r) => r.json())
      .then((data) => { if (data.error) throw new Error(data.error); setAllRows(data); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [sucursal]);

  // Rows filtradas por tipo (filtro interno del modal)
  const rowsTipo = useMemo(() =>
    tipoFiltro === "ont"  ? allRows.filter((r) => r.tipo === "ONT")
    : tipoFiltro === "deco" ? allRows.filter((r) => r.tipo !== "ONT")
    : allRows
  , [allRows, tipoFiltro]);

  const modelosPorTipo = useMemo(() => ({
    onts:  Array.from(new Set(rowsTipo.filter((r) => r.tipo === "ONT").map((r) => r.modelo))).sort(),
    decos: Array.from(new Set(rowsTipo.filter((r) => r.tipo !== "ONT").map((r) => r.modelo))).sort(),
  }), [rowsTipo]);
  const tiposRetiro  = useMemo(() => Array.from(new Set(rowsTipo.map((r) => r.tipo_retiro).filter(Boolean))).sort(), [rowsTipo]);
  const estadosTipo  = useMemo(() => Array.from(new Set(rowsTipo.map((r) => r.estado_stock).filter(Boolean))).sort(), [rowsTipo]);

  const filtradas = useMemo(() => {
    const result = rowsTipo.filter((r) => {
      const q = search.toLowerCase();
      if (q && !r.mac.toLowerCase().includes(q) && !r.modelo.toLowerCase().includes(q) && !r.nom_usr.toLowerCase().includes(q)) return false;
      if (modelosFiltro.size > 0 && !modelosFiltro.has(r.modelo))  return false;
      if (estadosFiltro.size > 0 && !estadosFiltro.has(r.estado_stock)) return false;
      if (tipoRetiroFiltro && r.tipo_retiro  !== tipoRetiroFiltro) return false;
      return true;
    });
    result.sort((a, b) => {
      let diff = 0;
      if (sort.col === "fecha_carga" || sort.col === "fecha_carga_recibo") {
        diff = parseFechaAR(a[sort.col]) - parseFechaAR(b[sort.col]);
      } else {
        diff = (a[sort.col] ?? "").localeCompare(b[sort.col] ?? "");
      }
      return sort.dir === "asc" ? diff : -diff;
    });
    return result;
  }, [rowsTipo, search, modelosFiltro, estadosFiltro, tipoRetiroFiltro, sort]);

  const hayFiltros = !!(search || modelosFiltro.size > 0 || estadosFiltro.size > 0 || tipoRetiroFiltro || tipoFiltro !== "all");
  const tipoLabel  = tipoFiltro === "ont" ? "ONTs" : tipoFiltro === "deco" ? "Decos / STB" : "Todos";
  const exportUrl  = (() => {
    const p = new URLSearchParams();
    if (sucursal !== null) p.set("sucursal", String(sucursal));
    if (tipo !== null)     p.set("tipo", tipo);
    return `/api/export/dispositivos?${p}`;
  })();

  function toggleSort(col: SortCol) {
    setSort((s) => ({ col, dir: s.col === col ? (s.dir === "asc" ? "desc" : "asc") : "asc" }));
  }
  function SortBtn({ col, label }: { col: SortCol; label: string }) {
    const active = sort.col === col;
    const Icon = active ? (sort.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
      <button onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 transition-colors ${active ? "text-indigo-400 hover:text-indigo-300" : "text-slate-400 hover:text-slate-200"}`}>
        {label} <Icon size={11} />
      </button>
    );
  }

  const cols: { label: string; sortCol?: SortCol }[] = [
    { label: "Sucursal" },
    { label: "Tipo",             sortCol: "tipo" },
    { label: "Modelo",           sortCol: "modelo" },
    { label: "MAC" },
    { label: "MTA MAC" },
    { label: "Fecha Carga Stock",sortCol: "fecha_carga" },
    { label: "Estado Stock",     sortCol: "estado_stock" },
    { label: "Estado Dispositivo", sortCol: "estado_dispositivo" },
    { label: "Última Conexión" },
    { label: "Último Estado" },
    { label: "Recibo CM" },
    { label: "Order Servicio" },
    { label: "Fecha Recibo",     sortCol: "fecha_carga_recibo" },
    { label: "Tipo Retiro" },
    { label: "Usuario" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3 className="text-sm font-bold text-white">Stock disponible · {tipoLabel}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {loading ? "Cargando…" : `${filtradas.length}${hayFiltros ? ` de ${rowsTipo.length}` : ""} dispositivos`}
            </p>
          </div>
        </div>
        <a href={exportUrl} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs transition-colors">
          <Download size={12} /> Exportar Excel
        </a>
      </div>

      {/* Filtros */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-700 flex flex-wrap gap-2 flex-shrink-0">
        <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
          {([["all", "Todos"], ["ont", "ONTs"], ["deco", "Decos"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setTipoFiltro(val); setModelosFiltro(new Set()); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${tipoFiltro === val ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
              {label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar MAC, modelo, usuario…"
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56"
        />
        <div className="relative" ref={modeloMenuRef}>
          <button
            onClick={() => setModeloMenuOpen((o) => !o)}
            className={`flex items-center gap-2 bg-slate-800 border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none transition-colors ${modelosFiltro.size > 0 ? "border-indigo-500" : "border-slate-700 hover:border-slate-500"}`}
          >
            {modelosFiltro.size === 0 ? "Todos los modelos" : `${modelosFiltro.size} modelo${modelosFiltro.size > 1 ? "s" : ""}`}
            <ChevronDown size={11} className="text-slate-400" />
          </button>
          {modeloMenuOpen && (
            <div className="absolute top-full mt-1 left-0 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-[220px] max-h-72 overflow-y-auto">
              {(["onts", "decos"] as const).map((grupo) => {
                const lista = modelosPorTipo[grupo];
                if (lista.length === 0) return null;
                return (
                  <div key={grupo}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-900/60 border-b border-slate-700/60 sticky top-0">
                      {grupo === "onts" ? "ONTs" : "Decos / STB"}
                    </div>
                    {lista.map((m) => (
                      <label key={m} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-700/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={modelosFiltro.has(m)}
                          onChange={() => setModelosFiltro((prev) => {
                            const next = new Set(prev);
                            if (next.has(m)) next.delete(m); else next.add(m);
                            return next;
                          })}
                          className="accent-indigo-500 w-3.5 h-3.5 flex-shrink-0"
                        />
                        <span className="text-xs text-slate-200 truncate">{m}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {estadosTipo.length > 0 && (
          <div className="relative" ref={estadoMenuRef}>
            <button
              onClick={() => setEstadoMenuOpen((o) => !o)}
              className={`flex items-center gap-2 bg-slate-800 border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none transition-colors ${estadosFiltro.size > 0 ? "border-indigo-500" : "border-slate-700 hover:border-slate-500"}`}
            >
              {estadosFiltro.size === 0 ? "Todos los estados" : `${estadosFiltro.size} estado${estadosFiltro.size > 1 ? "s" : ""}`}
              <ChevronDown size={11} className="text-slate-400" />
            </button>
            {estadoMenuOpen && (
              <div className="absolute top-full mt-1 left-0 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-[200px] max-h-64 overflow-y-auto">
                {estadosTipo.map((e) => (
                  <label key={e} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-700/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={estadosFiltro.has(e)}
                      onChange={() => setEstadosFiltro((prev) => {
                        const next = new Set(prev);
                        if (next.has(e)) next.delete(e); else next.add(e);
                        return next;
                      })}
                      className="accent-indigo-500 w-3.5 h-3.5 flex-shrink-0"
                    />
                    <span className="text-xs text-slate-200">{e}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {tiposRetiro.length > 0 && (
          <select value={tipoRetiroFiltro ?? ""} onChange={(e) => setTipoRetiroFiltro(e.target.value || null)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
            <option value="">Todos los retiros</option>
            {tiposRetiro.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {hayFiltros && (
          <button onClick={() => { setSearch(""); setTipoFiltro("all"); setModelosFiltro(new Set()); setEstadosFiltro(new Set()); setTipoRetiroFiltro(null); }}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors border border-slate-700">
            Limpiar
          </button>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Cargando…</div>}
        {error   && <div className="m-6 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
        {!loading && !error && (
          <table className="w-full text-xs text-slate-300 min-w-max">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-700">
              <tr>
                {cols.map((col) => (
                  <th key={col.label} className="text-left px-3 py-2.5 font-medium whitespace-nowrap">
                    {col.sortCol
                      ? <SortBtn col={col.sortCol} label={col.label} />
                      : <span className="text-slate-400">{col.label}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtradas.length === 0 && (
                <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-slate-500">Sin resultados</td></tr>
              )}
              {filtradas.map((r, i) => {
                const estadoColor = r.estado_stock ? getEstadoColor(r.estado_stock) : null;
                return (
                  <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">{r.sucursal}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.tipo}</td>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" title={r.modelo}>{r.modelo}</td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{r.mac}</td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-500">{r.mta_mac || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.fecha_carga || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.estado_stock && estadoColor ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={estadoColor}>
                          {r.estado_stock}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.estado_dispositivo || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.ultima_conexion || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.ultimo_estado_servicio || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.id_recibo_cm || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.id_order_servicio || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.fecha_carga_recibo || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.tipo_retiro || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.nom_usr || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString("es-AR");
}

function esOnt(tipo: string) {
  return tipo === "B";
}

type ChartRow = { modelo: string; __total: number; [key: string]: number | string };

function buildChartData(data: DispositivoRow[]) {
  const allStates = new Map<number, string>();
  for (const r of data) {
    if (r.Estado_Servicio != null && !allStates.has(r.Estado_Servicio))
      allStates.set(r.Estado_Servicio, r.estado_nombre ?? "Desconocido");
  }
  const porModelo = new Map<string, ChartRow>();
  for (const r of data) {
    if (!porModelo.has(r.modelo)) porModelo.set(r.modelo, { modelo: r.modelo, __total: 0, __label: 0 });
    const entry = porModelo.get(r.modelo)!;
    const key = `s_${r.Estado_Servicio}`;
    entry[key] = ((entry[key] as number) || 0) + r.cantidad;
    entry.__total = (entry.__total as number) + r.cantidad;
  }
  const chartData = Array.from(porModelo.values()).sort((a, b) => (b.__total as number) - (a.__total as number));
  const states = Array.from(allStates.entries()).sort((a, b) => {
    const totA = chartData.reduce((s, row) => s + ((row[`s_${a[0]}`] as number) || 0), 0);
    const totB = chartData.reduce((s, row) => s + ((row[`s_${b[0]}`] as number) || 0), 0);
    return totB - totA;
  });
  return { chartData, allStates, states };
}

function TablaActivos({ rows, sucursalSel, colTitulo, colSubtitulo, excelHref }: {
  rows: DispositivoRow[];
  sucursalSel: number | null;
  colTitulo?: string;
  colSubtitulo?: string;
  excelHref?: string;
}) {
  const filtrados = sucursalSel !== null ? rows.filter((r) => r.cod_sucursal === sucursalSel) : rows;
  if (filtrados.length === 0) return <p className="text-slate-500 text-sm">Sin datos para mostrar.</p>;

  const decos = filtrados.filter((r) => !esOnt(r.tipo_dispositivo));
  const onts  = filtrados.filter((r) =>  esOnt(r.tipo_dispositivo));

  const Seccion = ({ titulo, data, color }: { titulo: string; data: DispositivoRow[]; color: string }) => {
    const { chart } = useTheme();
    if (data.length === 0) return null;
    const total = data.reduce((s, r) => s + r.cantidad, 0);
    const { chartData, allStates, states } = buildChartData(data);
    const chartH = chartData.length * 42 + 10;

    type TEntry = { name: string; value: number; fill: string };
    const EstadoTooltip = ({ active, payload, label }: { active?: boolean; payload?: TEntry[]; label?: string }) => {
      if (!active || !payload?.length) return null;
      const entries = payload
        .filter((p) => p.name !== "__label" && p.value > 0)
        .map((p) => ({ nombre: allStates.get(Number(p.name.replace("s_", ""))) ?? p.name, value: p.value, fill: p.fill }))
        .sort((a, b) => b.value - a.value);
      const tot = entries.reduce((s, e) => s + e.value, 0);
      return (
        <div style={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 10, padding: "10px 14px", minWidth: 200 }}>
          <div style={{ color: chart.tooltipLabel, fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{label}</div>
          {entries.map((e) => (
            <div key={e.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 4, fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: e.fill, flexShrink: 0 }} />
                <span style={{ color: chart.tooltipItem }}>{e.nombre}</span>
              </div>
              <span style={{ color: chart.tooltipLabel, fontWeight: 500 }}>{fmt(e.value)}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${chart.tooltipBorder}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: chart.axis }}>Total</span>
            <span style={{ color: chart.tooltipLabel, fontWeight: 700 }}>{fmt(tot)}</span>
          </div>
        </div>
      );
    };

    return (
      <div>
        <div className="mb-4 flex items-stretch bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="w-1 flex-shrink-0" style={{ backgroundColor: color }} />
          <div className="px-4 py-3 flex items-center justify-between flex-1 gap-3">
            <div>
              {colTitulo && <p className="text-xs font-semibold text-slate-200">{colTitulo}</p>}
              {colSubtitulo && <p className="text-xs text-slate-500 mt-0.5">{colSubtitulo}</p>}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <div className="text-xl font-bold text-white">{fmt(total)}</div>
                <div className="text-xs text-slate-500">dispositivos</div>
              </div>
              {excelHref && (
                <a href={excelHref} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:text-white text-xs transition-colors">
                  <Download size={12} /> Excel
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3 sm:p-5">
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              barSize={20}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="modelo"
                width={160}
                tickLine={false}
                axisLine={false}
                tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => {
                  const { x, y, payload } = props;
                  const text = payload.value.length > 22 ? payload.value.slice(0, 20) + "…" : payload.value;
                  return (
                    <text x={x} y={y} dy={5} textAnchor="end" fill="#94a3b8" fontSize={11}>
                      {text}
                    </text>
                  );
                }}
              />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<EstadoTooltip />} />
              {states.map(([id]) => (
                <Bar key={id} dataKey={`s_${id}`} stackId="a" fill={getColorById(id)} />
              ))}
              <Bar dataKey="__label" stackId="a" fill="transparent" minPointSize={1} isAnimationActive={false}>
                <LabelList dataKey="__total" position="right" style={{ fill: "#94a3b8", fontSize: 11 }} formatter={(v: unknown) => fmt(Number(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
          {states.map(([id, nombre]) => (
            <div key={id} className="flex items-center gap-1.5 text-xs">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getColorById(id) }} />
              <span className="text-slate-400">{nombre}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Seccion titulo="ONTs" data={onts}  color="#06b6d4" />
      <Seccion titulo="Decos / STB" data={decos} color="#a855f7" />
    </div>
  );
}

function TablaStock({ rows, sucursalSel, colTitulo, colSubtitulo, excelHref, onVerDetalle }: {
  rows: DispositivoRow[];
  sucursalSel: number | null;
  colTitulo?: string;
  colSubtitulo?: string;
  excelHref?: string;
  onVerDetalle?: () => void;
}) {
  const filtrados = sucursalSel !== null ? rows.filter((r) => r.cod_sucursal === sucursalSel) : rows;
  if (filtrados.length === 0) return <p className="text-slate-500 text-sm">Sin datos para mostrar.</p>;

  const decos = filtrados.filter((r) => !esOnt(r.tipo_dispositivo));
  const onts  = filtrados.filter((r) =>  esOnt(r.tipo_dispositivo));

  const buildStockChart = (data: DispositivoRow[]) => {
    const sucursales = Array.from(new Set(data.map((r) => r.cod_sucursal))).sort();
    const porModelo = new Map<string, ChartRow>();
    for (const r of data) {
      if (!porModelo.has(r.modelo)) porModelo.set(r.modelo, { modelo: r.modelo, __total: 0, __label: 0 });
      const entry = porModelo.get(r.modelo)!;
      const key = `suc_${r.cod_sucursal}`;
      entry[key] = ((entry[key] as number) || 0) + r.cantidad;
      entry.__total = (entry.__total as number) + r.cantidad;
    }
    const chartData = Array.from(porModelo.values()).sort((a, b) => (b.__total as number) - (a.__total as number));
    return { chartData, sucursales };
  };

  const Seccion = ({ titulo, data, color }: { titulo: string; data: DispositivoRow[]; color: string }) => {
    const { chart } = useTheme();
    if (data.length === 0) return null;
    const total = data.reduce((s, r) => s + r.cantidad, 0);
    const { chartData, sucursales } = buildStockChart(data);
    const chartH = chartData.length * 42 + 10;

    type TEntry = { name: string; value: number; fill: string };
    const SucursalTooltip = ({ active, payload, label }: { active?: boolean; payload?: TEntry[]; label?: string }) => {
      if (!active || !payload?.length) return null;
      const entries = payload
        .filter((p) => p.name !== "__label" && p.value > 0)
        .map((p) => ({ nombre: SUCURSALES[Number(p.name.replace("suc_", ""))] ?? p.name, value: p.value, fill: p.fill }))
        .sort((a, b) => b.value - a.value);
      const tot = entries.reduce((s, e) => s + e.value, 0);
      return (
        <div style={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 10, padding: "10px 14px", minWidth: 200 }}>
          <div style={{ color: chart.tooltipLabel, fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{label}</div>
          {entries.map((e) => (
            <div key={e.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 4, fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: e.fill, flexShrink: 0 }} />
                <span style={{ color: chart.tooltipItem }}>{e.nombre}</span>
              </div>
              <span style={{ color: chart.tooltipLabel, fontWeight: 500 }}>{fmt(e.value)}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${chart.tooltipBorder}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: chart.axis }}>Total</span>
            <span style={{ color: chart.tooltipLabel, fontWeight: 700 }}>{fmt(tot)}</span>
          </div>
        </div>
      );
    };

    return (
      <div>
        <div
          className={`mb-4 flex items-stretch bg-slate-800 border border-slate-700 rounded-xl overflow-hidden transition-colors ${onVerDetalle ? "cursor-pointer hover:border-slate-500 hover:bg-slate-700/60" : ""}`}
          onClick={onVerDetalle}
        >
          <div className="w-1 flex-shrink-0" style={{ backgroundColor: color }} />
          <div className="px-4 py-3 flex items-center justify-between flex-1 gap-3">
            <div>
              {colTitulo && <p className="text-xs font-semibold text-slate-200">{colTitulo}</p>}
              {colSubtitulo && <p className="text-xs text-slate-500 mt-0.5">{colSubtitulo}</p>}
              {onVerDetalle && <p className="text-xs text-indigo-400 mt-1">Ver detalle →</p>}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <div className="text-xl font-bold text-white">{fmt(total)}</div>
                <div className="text-xs text-slate-500">dispositivos</div>
              </div>
              {excelHref && (
                <a href={excelHref} onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:text-white text-xs transition-colors">
                  <Download size={12} /> Excel
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3 sm:p-5">
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              barSize={20}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="modelo"
                width={160}
                tickLine={false}
                axisLine={false}
                tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => {
                  const { x, y, payload } = props;
                  const text = payload.value.length > 22 ? payload.value.slice(0, 20) + "…" : payload.value;
                  return (
                    <text x={x} y={y} dy={5} textAnchor="end" fill="#94a3b8" fontSize={11}>
                      {text}
                    </text>
                  );
                }}
              />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<SucursalTooltip />} />
              {sucursales.map((id) => (
                <Bar key={id} dataKey={`suc_${id}`} stackId="a" fill={sucursales.length === 1 ? color : (SUCURSAL_COLORS[id] ?? "#94a3b8")} />
              ))}
              <Bar dataKey="__label" stackId="a" fill="transparent" minPointSize={1} isAnimationActive={false}>
                <LabelList dataKey="__total" position="right" style={{ fill: "#94a3b8", fontSize: 11 }} formatter={(v: unknown) => fmt(Number(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {sucursales.length > 1 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
            {sucursales.map((id) => (
              <div key={id} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SUCURSAL_COLORS[id] ?? "#94a3b8" }} />
                <span className="text-slate-400">{SUCURSALES[id] ?? id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <Seccion titulo="ONTs" data={onts}  color="#06b6d4" />
      <Seccion titulo="Decos / STB" data={decos} color="#a855f7" />
    </div>
  );
}

export default function DispositivosView({
  onClose,
  sucursalesPermitidas = null,
}: {
  onClose: () => void;
  sucursalesPermitidas?: number[] | null;
}) {
  const sucursalesDisponibles = sucursalesPermitidas
    ? Object.entries(SUCURSALES).filter(([cod]) => sucursalesPermitidas.includes(Number(cod)))
    : Object.entries(SUCURSALES);

  const [sucursal, setSucursal]     = useState<number | null>(sucursalesPermitidas?.length === 1 ? sucursalesPermitidas[0] : null);
  const [seccionSel, setSeccionSel] = useState<"all" | "activos" | "stock">("all");
  const [tipoSel, setTipoSel]       = useState<"all" | "ont" | "deco">("all");
  const [modelosSel, setModelosSel] = useState<Set<string> | null>(null);
  const [modeloOpen, setModeloOpen] = useState(false);
  const [data, setData]             = useState<Data | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [detalleOpen, setDetalleOpen]   = useState(false);
  const [detalleTipo, setDetalleTipo]   = useState<"ont" | "deco" | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sucursal !== null) params.set("sucursal", String(sucursal));
      const res  = await fetch(`/api/dispositivos?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sucursal]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setModelosSel(null); setModeloOpen(false); }, [tipoSel]);
  useEffect(() => { setModelosSel(null); }, [seccionSel]);

  const sucFiltro = (r: DispositivoRow) => sucursal === null || r.cod_sucursal === sucursal;

  // KPIs — solo filtro de sucursal, sin tipo ni modelo
  const totalOntsActivas  = data ? data.activos.filter((r) =>  esOnt(r.tipo_dispositivo) && sucFiltro(r)).reduce((s, r) => s + r.cantidad, 0) : 0;
  const totalDecosActivos = data ? data.activos.filter((r) => !esOnt(r.tipo_dispositivo) && sucFiltro(r)).reduce((s, r) => s + r.cantidad, 0) : 0;
  const totalStockOnts    = data ? data.stock.filter((r) =>   esOnt(r.tipo_dispositivo) && sucFiltro(r)).reduce((s, r) => s + r.cantidad, 0) : 0;
  const totalStockDecos   = data ? data.stock.filter((r) =>  !esOnt(r.tipo_dispositivo) && sucFiltro(r)).reduce((s, r) => s + r.cantidad, 0) : 0;

  const filtrarTipo = (rows: DispositivoRow[]) =>
    tipoSel === "ont"  ? rows.filter((r) =>  esOnt(r.tipo_dispositivo)) :
    tipoSel === "deco" ? rows.filter((r) => !esOnt(r.tipo_dispositivo)) :
    rows;

  // Modelos disponibles según la sección activa
  const allRows        = [...(data?.activos ?? []), ...(data?.stock ?? [])];
  const seccionRows    = seccionSel === "activos" ? (data?.activos ?? []) : seccionSel === "stock" ? (data?.stock ?? []) : allRows;
  const rowsFiltroBase = filtrarTipo(seccionRows.filter(sucFiltro));
  const modelosOnt     = Array.from(new Set(rowsFiltroBase.filter((r) =>  esOnt(r.tipo_dispositivo)).map((r) => r.modelo))).sort();
  const modelosDeco    = Array.from(new Set(rowsFiltroBase.filter((r) => !esOnt(r.tipo_dispositivo)).map((r) => r.modelo))).sort();
  const modelosDisponibles = [...modelosOnt, ...modelosDeco];

  const toggleModelo = (modelo: string) => {
    setModelosSel((prev) => {
      const base = prev ?? new Set(modelosDisponibles);
      const next = new Set(base);
      next.has(modelo) ? next.delete(modelo) : next.add(modelo);
      if (next.size === modelosDisponibles.length) return null;
      return next;
    });
  };
  const toggleTodos = () => setModelosSel((prev) => prev === null ? new Set() : null);

  const modeloLabel = modelosSel === null ? "Todos los modelos"
    : modelosSel.size === 0 ? "Ningún modelo"
    : `${modelosSel.size} modelo${modelosSel.size !== 1 ? "s" : ""}`;

  const activosVista = filtrarTipo(data?.activos ?? []).filter((r) => modelosSel === null || modelosSel.has(r.modelo));
  const stockVista   = filtrarTipo(data?.stock   ?? []).filter((r) => modelosSel === null || modelosSel.has(r.modelo));

  const ontActivos  = activosVista.filter((r) =>  esOnt(r.tipo_dispositivo));
  const decoActivos = activosVista.filter((r) => !esOnt(r.tipo_dispositivo));
  const ontStock    = stockVista.filter((r) =>    esOnt(r.tipo_dispositivo));
  const decoStock   = stockVista.filter((r) =>   !esOnt(r.tipo_dispositivo));

  const showOnts  = (seccionSel !== "stock"   && ontActivos.some((r) => sucursal === null || r.cod_sucursal === sucursal))
                 || (seccionSel !== "activos" && ontStock.some((r) => sucursal === null || r.cod_sucursal === sucursal));
  const showDecos = (seccionSel !== "stock"   && decoActivos.some((r) => sucursal === null || r.cod_sucursal === sucursal))
                 || (seccionSel !== "activos" && decoStock.some((r) => sucursal === null || r.cod_sucursal === sucursal));

  const buildExportUrl = (base: string) => {
    const params = new URLSearchParams();
    if (sucursal !== null) params.set("sucursal", String(sucursal));
    if (tipoSel !== "all") params.set("tipo", tipoSel);
    if (modelosSel !== null && modelosSel.size > 0) params.set("modelos", [...modelosSel].join(","));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const ModeloDropdown = (
    <div className="relative">
      <button onClick={() => setModeloOpen((o) => !o)}
        className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 hover:text-white transition-colors">
        {modeloLabel}
        <ChevronDown size={12} className={`transition-transform ${modeloOpen ? "rotate-180" : ""}`} />
      </button>
      {modeloOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setModeloOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-20 bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-72 max-h-72 overflow-y-auto p-2">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer text-xs text-slate-200 font-medium">
              <input type="checkbox" checked={modelosSel === null} onChange={toggleTodos} className="accent-indigo-500" />
              Todos los modelos
            </label>
            <div className="border-t border-slate-700 my-1.5" />
            {modelosOnt.length > 0 && (<>
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-500">ONTs</div>
              {modelosOnt.map((m) => (
                <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer text-xs text-slate-300">
                  <input type="checkbox" checked={modelosSel === null || modelosSel.has(m)} onChange={() => toggleModelo(m)} className="accent-indigo-500" />
                  {m}
                </label>
              ))}
            </>)}
            {modelosOnt.length > 0 && modelosDeco.length > 0 && <div className="border-t border-slate-700 my-1.5" />}
            {modelosDeco.length > 0 && (<>
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-violet-400">Deco/STB</div>
              {modelosDeco.map((m) => (
                <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700 cursor-pointer text-xs text-slate-300">
                  <input type="checkbox" checked={modelosSel === null || modelosSel.has(m)} onChange={() => toggleModelo(m)} className="accent-indigo-500" />
                  {m}
                </label>
              ))}
            </>)}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Dispositivos</h2>
          <p className="text-slate-400 text-sm mt-0.5">Decos y ONTs activos y en stock</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm transition-colors">← Volver</button>
        </div>
      </div>

      {/* Filtros globales */}
      <div className="space-y-3">
        {sucursalesDisponibles.length > 1 && (
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit flex-wrap">
            <button onClick={() => setSucursal(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sucursal === null ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
              Todas
            </button>
            {sucursalesDisponibles.map(([cod, nombre]) => (
              <button key={cod} onClick={() => setSucursal(Number(cod))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sucursal === Number(cod) ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {nombre}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro: sección */}
          <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
            {([["all", "Todos"], ["activos", "Activos en conexiones"], ["stock", "Stock disponible"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => setSeccionSel(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${seccionSel === val ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
          {/* Filtro: tipo */}
          <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
            {([["all", "Todos"], ["ont", "ONTs"], ["deco", "Deco/STB"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => setTipoSel(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tipoSel === val ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
          {ModeloDropdown}
          {/* Exportar */}
          <div className="pl-1 border-l border-slate-700">
            <a href={buildExportUrl(
                seccionSel === "activos" ? "/api/export/dispositivos-activos"
              : seccionSel === "stock"   ? "/api/export/dispositivos"
              :                            "/api/export/dispositivos-completo"
            )}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors">
              <Download size={11} /> Exportar Excel
            </a>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Activos en conexiones */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Activos en conexiones</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Wifi size={12} className="text-cyan-400" />
                  <span className="text-xs text-cyan-400 font-medium">ONTs</span>
                </div>
                <div className="text-2xl font-bold text-white">{fmt(totalOntsActivas)}</div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Monitor size={12} className="text-violet-400" />
                  <span className="text-xs text-violet-400 font-medium">Decos / STB</span>
                </div>
                <div className="text-2xl font-bold text-white">{fmt(totalDecosActivos)}</div>
              </div>
            </div>
          </div>
          {/* Stock disponible */}
          <div
            className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 space-y-3 cursor-pointer hover:border-slate-500 hover:bg-slate-800/70 transition-colors"
            onClick={() => { setDetalleTipo(null); setDetalleOpen(true); }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stock disponible</p>
              <span className="text-xs text-indigo-400">Ver detalle →</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Wifi size={12} className="text-cyan-400" />
                  <span className="text-xs text-cyan-400 font-medium">ONTs</span>
                </div>
                <div className="text-2xl font-bold text-white">{fmt(totalStockOnts)}</div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Monitor size={12} className="text-violet-400" />
                  <span className="text-xs text-violet-400 font-medium">Decos / STB</span>
                </div>
                <div className="text-2xl font-bold text-white">{fmt(totalStockDecos)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

      {loading && !data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-slate-800/50 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {/* Gráficos: una tarjeta por tipo con activos | stock adentro */}
      {data && (
        <div className="space-y-6">

          {/* Tarjeta ONTs */}
          {showOnts && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-3 sm:p-5">
              <div className="flex items-center gap-2 pb-4 mb-5 border-b border-slate-700/60">
                <Wifi size={13} className="text-cyan-400" />
                <span className="text-sm font-semibold text-cyan-400">ONTs</span>
              </div>
              <div className={`grid grid-cols-1 ${seccionSel === "all" ? "lg:grid-cols-2" : ""} gap-6 items-start`}>
                {seccionSel !== "stock" && (
                  <TablaActivos rows={ontActivos} sucursalSel={sucursal}
                    colTitulo="Activos en conexiones" colSubtitulo="Dispositivos en uso" />
                )}
                {seccionSel !== "activos" && (
                  <TablaStock rows={ontStock} sucursalSel={sucursal}
                    colTitulo="Stock disponible" colSubtitulo="Dispositivos sin asignar" />
                )}
              </div>
            </div>
          )}

          {/* Tarjeta Decos / STB */}
          {showDecos && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-3 sm:p-5">
              <div className="flex items-center gap-2 pb-4 mb-5 border-b border-slate-700/60">
                <Monitor size={13} className="text-violet-400" />
                <span className="text-sm font-semibold text-violet-400">Decos / STB</span>
              </div>
              <div className={`grid grid-cols-1 ${seccionSel === "all" ? "lg:grid-cols-2" : ""} gap-6 items-start`}>
                {seccionSel !== "stock" && (
                  <TablaActivos rows={decoActivos} sucursalSel={sucursal}
                    colTitulo="Activos en conexiones" colSubtitulo="Dispositivos en uso" />
                )}
                {seccionSel !== "activos" && (
                  <TablaStock rows={decoStock} sucursalSel={sucursal}
                    colTitulo="Stock disponible" colSubtitulo="Dispositivos sin asignar" />
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {detalleOpen && (
        <StockDetalleModal
          onClose={() => setDetalleOpen(false)}
          sucursal={sucursal}
          tipo={detalleTipo}
        />
      )}
    </div>
  );
}
