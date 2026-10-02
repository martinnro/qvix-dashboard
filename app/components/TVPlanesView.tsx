"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, X, Loader2, AlertCircle, Download, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type PlanEstado = "bonificado" | "con_cargo" | "sin_plan_con_cargo" | "sin_plan_sin_cargo" | "proximo_vencer";
const PLAN_ESTADO_LABELS: Record<PlanEstado, string> = {
  bonificado: "Bonificado",
  con_cargo: "Con cargo",
  sin_plan_con_cargo: "Sin plan — con cargo",
  sin_plan_sin_cargo: "Sin plan — sin cargo",
  proximo_vencer: "Próximo a vencer",
};

// Independiente de PlanEstado: no mira el plan base sino el neto total facturado en video
// (mismo criterio que la tarjeta "TV Sin Cargo" / bonificadoGlobal-conCargoGlobal del backend).
type NetoGlobalEstado = "bonificado" | "con_cargo";
const NETO_GLOBAL_LABELS: Record<NetoGlobalEstado, string> = {
  bonificado: "TV sin cargo (global)",
  con_cargo: "TV con cargo (global)",
};

// Filtro de detalle por adicional (HBO/Universal/Fútbol/App) — "bonificado" para la App significa
// sin cargo, igual que en PackCard/labelVerde, pero el valor que viaja al backend es el mismo.
type PackTipo = "hbo" | "univ" | "futbol" | "app";
type PackEstado = "bonificado" | "paga" | "proximo_vencer";
const PACK_LABELS: Record<PackTipo, string> = {
  hbo: "HBO+", univ: "Universal+", futbol: "Fútbol", app: "App GO TV",
};
function packEstadoLabel(pack: PackTipo, estado: PackEstado): string {
  if (estado === "proximo_vencer") return "Próximo a vencer";
  if (pack === "app") return estado === "bonificado" ? "Sin cargo" : "Con cargo";
  return estado === "bonificado" ? "Bonificado" : "Paga";
}

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

type PanelType = "detalle" | null;

interface DetalleRow {
  id_conexion: number;
  cod_sucursal: number;
  decos_iptv: number;
  decos_ott: number;
  plan_base: string | null;
  abono_base: number;
  bonif_base: number;
  base_bonificado: number;
  base_cant_cuotas: number | null;
  base_cuotas_generadas: number | null;
  tiene_hbo: number;
  neto_hbo: number;
  hbo_bonificado: number;
  hbo_cant_cuotas: number | null;
  hbo_cuotas_generadas: number | null;
  tiene_univ: number;
  neto_univ: number;
  univ_bonificado: number;
  univ_cant_cuotas: number | null;
  univ_cuotas_generadas: number | null;
  tiene_futbol: number;
  neto_futbol: number;
  futbol_bonificado: number;
  futbol_cant_cuotas: number | null;
  futbol_cuotas_generadas: number | null;
  tiene_app: number;
  neto_app: number;
  app_cant_cuotas: number | null;
  app_cuotas_generadas: number | null;
  total_neto: number;
}

// Cuotas restantes de una bonificación: null si no hay cuotas cargadas (ej. descuento manual
// sin plazo) o si ya no quedan (se vence/venció en la próxima factura).
function cuotasRestantes(cantCuotas: number | null, generadas: number | null): number | null {
  if (!cantCuotas || generadas === null) return null;
  return Math.max(0, cantCuotas - generadas);
}
interface PackStat { tiene: number; bonificado: number; paga: number }
interface Data {
  total: number;
  decosIptvTotal: number;
  decosOttTotal: number;
  porSucursal: { cod_sucursal: number; nombre: string; cantidad: number }[];
  porPlanBase: { plan: string; cantidad: number; precioProm: number; precioMin: number; precioMax: number }[];
  planBase: {
    conPlan: number; conBonif: number; sinPlanConCargo: number; sinPlanSinCargo: number;
    bonificadoGlobal: number; conCargoGlobal: number;
  };
  hbo: PackStat;
  univ: PackStat;
  futbol: PackStat;
  app: { tiene: number; conCargo: number; sinCargo: number };
  detalle: DetalleRow[];
  detalleTotal: number;
  detallePorSucursal: Record<number, number>;
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function pesos(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

// ── Orden de la tabla de detalle ────────────────────────────────────────────
type SortKey =
  | "id_conexion" | "sucursal" | "decos_iptv" | "decos_ott" | "plan_base"
  | "base_bonificado" | "hbo" | "univ" | "futbol" | "app" | "total_neto";

function sortValue(r: DetalleRow, key: SortKey): string | number {
  switch (key) {
    case "id_conexion":     return r.id_conexion;
    case "sucursal":        return SUCURSALES[r.cod_sucursal] ?? String(r.cod_sucursal);
    case "decos_iptv":      return r.decos_iptv;
    case "decos_ott":       return r.decos_ott;
    case "plan_base":       return r.plan_base ?? "";
    case "base_bonificado": return r.base_bonificado;
    // 0 = no tiene el pack, 1 = lo paga, 2 = bonificado
    case "hbo":    return r.tiene_hbo    === 0 ? 0 : r.hbo_bonificado    === 1 ? 2 : 1;
    case "univ":   return r.tiene_univ   === 0 ? 0 : r.univ_bonificado   === 1 ? 2 : 1;
    case "futbol": return r.tiene_futbol === 0 ? 0 : r.futbol_bonificado === 1 ? 2 : 1;
    // 0 = no tiene app, 1 = con cargo, 2 = sin cargo
    case "app":    return r.tiene_app === 0 ? 0 : r.neto_app > 0 ? 1 : 2;
    case "total_neto": return r.total_neto;
  }
}

function Th({ label, sortKey, active, sortAsc, onSort, align = "left" }: {
  label: string; sortKey: SortKey; active: SortKey;
  sortAsc: boolean; onSort: (key: SortKey) => void; align?: "left" | "right" | "center";
}) {
  const isActive = active === sortKey;
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const justifyClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`${alignClass} py-2 px-3 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap`}
    >
      <span className={`flex items-center gap-1 ${justifyClass}`}>
        {label}
        {isActive ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronsUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  );
}

// ── Tile de KPI compacto (mismo patrón que Instalaciones) ──────────────────────
function StatTile({ label, value, sublabel, color }: {
  label: string; value: string | number; sublabel?: string; color: string;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 truncate">{label}</p>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

// ── Tarjeta chica con donut: bonificado vs. con cargo global, sin importar si tiene plan base ──
function GlobalDonutTile({ total, bonificado, conCargo, onSelect, centrado = false }: {
  total: number; bonificado: number; conCargo: number; onSelect: (estado: NetoGlobalEstado) => void; centrado?: boolean;
}) {
  const data = [
    { name: "No paga nada", value: bonificado, color: "#10b981" },
    { name: "Paga",         value: conCargo,   color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  return (
    <div
      onClick={() => onSelect("bonificado")}
      className={`bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors ${centrado ? "justify-center text-center" : ""}`}
    >
      <div className="w-16 h-16 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={20} outerRadius={32} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => {
                const num = Number(value);
                return [`${num.toLocaleString("es-AR")} (${pct(num, total)}%)`, String(name)];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 truncate">TV Sin Cargo</p>
        <div className="text-xl font-bold text-emerald-400">{pct(bonificado, total)}%</div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onSelect("bonificado"); }}
            className="text-emerald-400 hover:underline"
          >
            {bonificado.toLocaleString("es-AR")} no paga
          </button>
          {" · "}
          <button
            onClick={(e) => { e.stopPropagation(); onSelect("con_cargo"); }}
            className="text-amber-400 hover:underline"
          >
            {conCargo.toLocaleString("es-AR")} paga
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Fila de ranking ─────────────────────────────────────────────────────────
function RankRow({ label, cantidad, max, color, sublabel, precioInfo }: {
  label: string; cantidad: number; max: number; color: string; sublabel?: string; precioInfo?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-300 truncate flex-1 pr-3">
          {label}
          {precioInfo && <span className="block text-[11px] text-slate-500 font-normal mt-0.5">{precioInfo}</span>}
        </span>
        <span className="text-xs font-semibold text-slate-100 flex-shrink-0">
          {cantidad}{sublabel && <span className="text-slate-500 font-normal ml-1.5">{sublabel}</span>}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct(cantidad, max)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Split de plan base: bonificado / con cargo / sin plan — suma el total de conexiones TV ──
// Clickeable: la tarjeta entera lleva al detalle sin filtrar, y cada segmento lleva al detalle filtrado a ese estado.
function PlanBaseSplit({ total, bonificado, conCargo, sinPlanConCargo, sinPlanSinCargo, onSelect }: {
  total: number; bonificado: number; conCargo: number; sinPlanConCargo: number; sinPlanSinCargo: number;
  onSelect: (estado: PlanEstado | null) => void;
}) {
  const segmentos: { label: string; value: number; color: string; estado: PlanEstado }[] = [
    { label: "Bonificado",           value: bonificado,      color: "#10b981", estado: "bonificado" },
    { label: "Con cargo",            value: conCargo,        color: "#f59e0b", estado: "con_cargo" },
    { label: "Sin plan — con cargo", value: sinPlanConCargo, color: "#64748b", estado: "sin_plan_con_cargo" },
    { label: "Sin plan — sin cargo", value: sinPlanSinCargo, color: "#334155", estado: "sin_plan_sin_cargo" },
  ];
  return (
    <div
      onClick={() => onSelect(null)}
      className="bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl p-5 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <h3 className="text-slate-300 font-medium text-sm">Plan base — bonificado vs. con cargo</h3>
        <span className="text-xs text-slate-500">{total.toLocaleString("es-AR")} conexiones TV · ver detalle ↗</span>
      </div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
        {segmentos.map((s) => s.value > 0 && (
          <button
            key={s.label}
            onClick={(e) => { e.stopPropagation(); onSelect(s.estado); }}
            title={`Ver ${s.label.toLowerCase()}`}
            style={{ width: `${pct(s.value, total)}%`, backgroundColor: s.color }}
            className="hover:opacity-75 transition-opacity"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-3">
        {segmentos.map((s) => (
          <button
            key={s.label}
            onClick={(e) => { e.stopPropagation(); onSelect(s.estado); }}
            className="flex items-center gap-1.5 text-xs hover:opacity-75 transition-opacity"
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-slate-300">{s.label}</span>
            <span className="font-semibold text-white">{s.value.toLocaleString("es-AR")}</span>
            <span className="text-slate-500">({pct(s.value, total)}%)</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Card de adicional (HBO / Universal / Fútbol) con split bonificado vs paga ──
function PackCard({ nombre, stat, labelVerde = "bonificado", labelAmbar = "paga", onSelect }: {
  nombre: string; stat: PackStat; labelVerde?: string; labelAmbar?: string; onSelect: (estado: PackEstado) => void;
}) {
  const pctBonif = pct(stat.bonificado, stat.tiene);
  return (
    <div
      onClick={() => onSelect("bonificado")}
      className="bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl p-4 cursor-pointer transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-200">{nombre}</span>
        <span className="text-xs text-slate-500">{stat.tiene} conexiones</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
        {pctBonif > 0 && <div style={{ width: `${pctBonif}%`, backgroundColor: "#10b981" }} />}
        {pctBonif < 100 && <div style={{ width: `${100 - pctBonif}%`, backgroundColor: "#f59e0b" }} />}
      </div>
      <div className="flex justify-between mt-2 text-xs">
        <button onClick={(e) => { e.stopPropagation(); onSelect("bonificado"); }} className="text-emerald-400 hover:underline">
          {stat.bonificado} {labelVerde} ({pctBonif}%)
        </button>
        <button onClick={(e) => { e.stopPropagation(); onSelect("paga"); }} className="text-amber-400 hover:underline">
          {stat.paga} {labelAmbar}
        </button>
      </div>
    </div>
  );
}

function PackCell({ tiene, bonificado, neto, cantCuotas, cuotasGeneradas }: {
  tiene: number; bonificado: number; neto: number; cantCuotas: number | null; cuotasGeneradas: number | null;
}) {
  if (tiene !== 1) return <td className="py-2 px-3 text-center text-slate-600">—</td>;
  const restantes = bonificado === 1 ? cuotasRestantes(cantCuotas, cuotasGeneradas) : null;
  return (
    <td className="py-2 px-3 text-center">
      <div className="flex flex-col items-center gap-0.5">
        {bonificado === 1
          ? <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">Bonificado</span>
          : <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold">Paga</span>}
        <span className="text-[10px] text-slate-500">{pesos(neto)}</span>
        {restantes !== null && (
          <span className={`text-[10px] ${restantes === 0 ? "text-rose-400" : "text-slate-500"}`}>
            {restantes === 0 ? "vence próx. factura" : `vence en ${restantes} cuota${restantes === 1 ? "" : "s"}`}
          </span>
        )}
      </div>
    </td>
  );
}

export default function TVPlanesView({ onClose, sucursalesPermitidas }: {
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
  const [filtroPlanEstado, setFiltroPlanEstado] = useState<PlanEstado | null>(null);
  const [filtroNetoGlobal, setFiltroNetoGlobal] = useState<NetoGlobalEstado | null>(null);
  const [filtroPack, setFiltroPack] = useState<{ pack: PackTipo; estado: PackEstado } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("id_conexion");
  const [sortAsc, setSortAsc] = useState(true);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const abrirDetalle = (estado: PlanEstado | null) => {
    setFiltroPlanEstado(estado);
    setFiltroNetoGlobal(null);
    setFiltroPack(null);
    setPanel("detalle");
  };

  const abrirDetalleGlobal = (estado: NetoGlobalEstado) => {
    setFiltroPlanEstado(null);
    setFiltroNetoGlobal(estado);
    setFiltroPack(null);
    setPanel("detalle");
  };

  const abrirDetallePack = (pack: PackTipo, estado: PackEstado) => {
    setFiltroPlanEstado(null);
    setFiltroNetoGlobal(null);
    setFiltroPack({ pack, estado });
    setPanel("detalle");
  };

  useEffect(() => { window.scrollTo(0, 0); }, [panel]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    if (filtroPlanEstado) params.set("planEstado", filtroPlanEstado);
    if (filtroNetoGlobal) params.set("netoGlobal", filtroNetoGlobal);
    if (filtroPack) { params.set("pack", filtroPack.pack); params.set("packEstado", filtroPack.estado); }
    try {
      const res = await fetch(`/api/tv-planes?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sucSel, filtroPlanEstado, filtroNetoGlobal, filtroPack]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    if (filtroPlanEstado) params.set("planEstado", filtroPlanEstado);
    if (filtroNetoGlobal) params.set("netoGlobal", filtroNetoGlobal);
    if (filtroPack) { params.set("pack", filtroPack.pack); params.set("packEstado", filtroPack.estado); }
    return `/api/export/tv-planes?${params}`;
  };

  // ── Header compartido entre el resumen y el panel de detalle ──────────────
  const Header = ({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) => (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        {panel && (
          <button
            onClick={() => setPanel(null)}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mb-3"
          >
            <ArrowLeft size={15} /> Volver al resumen
          </button>
        )}
        <h2 className="text-xl font-bold text-white">{titulo}</h2>
        {subtitulo && <p className="text-slate-400 text-sm mt-0.5">{subtitulo}</p>}
      </div>
      <div className="flex items-center gap-2">
        {data && (
          <a href={exportUrl()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors"
          >
            <Download size={13} /> Exportar Excel
          </a>
        )}
        <button onClick={fetchData} disabled={loading}
          className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
        {!panel && (
          <button onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <X size={15} /> Cerrar
          </button>
        )}
      </div>
    </div>
  );

  // `conteos` opcional: cuando se pasa (panel de detalle), cada chip muestra cuántas conexiones
  // hay de esa sucursal dentro del filtro activo ("esa situación" — TV sin cargo, HBO bonificado, etc.)
  const sucursalFiltro = (conteos?: Record<number, number>, total?: number) => sucursalesDisponibles.length > 1 && (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setSucSel(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          sucSel === null ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
        }`}
      >
        Todas{total !== undefined ? ` (${total.toLocaleString("es-AR")})` : ""}
      </button>
      {sucursalesDisponibles.map((cod) => (
        <button
          key={cod}
          onClick={() => setSucSel(sucSel === cod ? null : cod)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            sucSel === cod ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
          }`}
        >
          {SUCURSALES[cod]}{conteos ? ` (${(conteos[cod] ?? 0).toLocaleString("es-AR")})` : ""}
        </button>
      ))}
    </div>
  );

  const errorBox = error && (
    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
      <AlertCircle size={16} /> {error}
    </div>
  );

  // ── Panel: Detalle de conexiones ──────────────────────────────────────────
  if (panel === "detalle") {
    return (
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <Header
          titulo="Detalle de conexiones"
          subtitulo={data ? `${data.detalleTotal.toLocaleString("es-AR")} conexiones${
            filtroPlanEstado ? ` — ${PLAN_ESTADO_LABELS[filtroPlanEstado]}`
            : filtroNetoGlobal ? ` — ${NETO_GLOBAL_LABELS[filtroNetoGlobal]}`
            : filtroPack ? ` — ${PACK_LABELS[filtroPack.pack]}: ${packEstadoLabel(filtroPack.pack, filtroPack.estado).toLowerCase()}`
            : ""
          }` : undefined}
        />

        {sucursalFiltro(data?.detallePorSucursal, data?.detalleTotal)}

        {/* Selector de paquete: permite saltar de HBO+ a Universal+/Fútbol/App sin volver al resumen */}
        {filtroPack && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Paquete</span>
            {(Object.keys(PACK_LABELS) as PackTipo[]).map((pack) => (
              <button
                key={pack}
                onClick={() => abrirDetallePack(pack, filtroPack.estado)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filtroPack.pack === pack ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                }`}
              >
                {PACK_LABELS[pack]}
              </button>
            ))}
          </div>
        )}

        {/* Filtro por estado — simplificado a solo 2 opciones cuando se entra por "TV Sin Cargo (global)" o por un adicional */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Filtrar por</span>
            {filtroNetoGlobal ? (
              (Object.entries(NETO_GLOBAL_LABELS) as [NetoGlobalEstado, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => abrirDetalleGlobal(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filtroNetoGlobal === key ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                  }`}
                >
                  {label}
                </button>
              ))
            ) : filtroPack ? (
              (["bonificado", "paga"] as PackEstado[]).map((estado) => {
                // "Próximo a vencer" es siempre un subconjunto de "Bonificado" — al elegirlo,
                // "Bonificado" se marca como activo también para que quede claro que sigue aplicando.
                const activo = estado === "bonificado"
                  ? filtroPack.estado === "bonificado" || filtroPack.estado === "proximo_vencer"
                  : filtroPack.estado === estado;
                return (
                  <button
                    key={estado}
                    onClick={() => abrirDetallePack(filtroPack.pack, estado)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      activo ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                    }`}
                  >
                    {packEstadoLabel(filtroPack.pack, estado)}
                  </button>
                );
              })
            ) : (
              <>
                <button
                  onClick={() => abrirDetalle(null)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filtroPlanEstado === null && !filtroPack ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                  }`}
                >
                  Todos
                </button>
                {(Object.entries(PLAN_ESTADO_LABELS) as [PlanEstado, string][])
                  .filter(([key]) => key !== "proximo_vencer")
                  .map(([key, label]) => {
                    // "Próximo a vencer" es siempre un subconjunto de "Bonificado" — al elegirlo,
                    // "Bonificado" se marca como activo también.
                    const activo = key === "bonificado"
                      ? filtroPlanEstado === "bonificado" || filtroPlanEstado === "proximo_vencer"
                      : filtroPlanEstado === key;
                    return (
                      <button
                        key={key}
                        onClick={() => abrirDetalle(key)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          activo ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                {(Object.entries(NETO_GLOBAL_LABELS) as [NetoGlobalEstado, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => abrirDetalleGlobal(key)}
                    className="px-3 py-1 rounded-full text-xs font-medium border border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Vencimiento: un segundo filtro, aparte y con otro color, para no mezclarlo con el
              estado bonificado/paga — no aplica en modo "TV Sin Cargo (global)" (es un neto
              agregado, no tiene cuotas propias). */}
          {!filtroNetoGlobal && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Vencimiento</span>
              {filtroPack ? (
                <button
                  onClick={() => abrirDetallePack(filtroPack.pack, "proximo_vencer")}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filtroPack.estado === "proximo_vencer" ? "bg-amber-600 border-amber-500 text-white" : "border-amber-700/60 text-amber-500 hover:border-amber-500 hover:text-amber-400"
                  }`}
                >
                  Próximo a vencer
                </button>
              ) : (
                <button
                  onClick={() => abrirDetalle("proximo_vencer")}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filtroPlanEstado === "proximo_vencer" ? "bg-amber-600 border-amber-500 text-white" : "border-amber-700/60 text-amber-500 hover:border-amber-500 hover:text-amber-400"
                  }`}
                >
                  Próximo a vencer
                </button>
              )}
            </div>
          )}
        </div>

        {errorBox}

        {loading && !data && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        )}

        {data && (filtroNetoGlobal ? (
          <GlobalDonutTile
            total={data.total}
            bonificado={data.planBase.bonificadoGlobal}
            conCargo={data.planBase.conCargoGlobal}
            onSelect={abrirDetalleGlobal}
            centrado
          />
        ) : filtroPack ? (
          <PackCard
            nombre={PACK_LABELS[filtroPack.pack]}
            stat={
              filtroPack.pack === "hbo" ? data.hbo
              : filtroPack.pack === "univ" ? data.univ
              : filtroPack.pack === "futbol" ? data.futbol
              : { tiene: data.app.tiene, bonificado: data.app.sinCargo, paga: data.app.conCargo }
            }
            labelVerde={filtroPack.pack === "app" ? "sin cargo" : "bonificado"}
            labelAmbar={filtroPack.pack === "app" ? "con cargo" : "paga"}
            onSelect={(estado) => abrirDetallePack(filtroPack.pack, estado)}
          />
        ) : (
          <PlanBaseSplit
            total={data.total}
            bonificado={data.planBase.conBonif}
            conCargo={data.planBase.conPlan - data.planBase.conBonif}
            sinPlanConCargo={data.planBase.sinPlanConCargo}
            sinPlanSinCargo={data.planBase.sinPlanSinCargo}
            onSelect={abrirDetalle}
          />
        ))}

        {data && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <Th label="ID Conexión"  sortKey="id_conexion"     active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                    <Th label="Sucursal"     sortKey="sucursal"        active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                    <Th label="Decos IPTV"   sortKey="decos_iptv"      active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="right" />
                    <Th label="Decos OTT"    sortKey="decos_ott"       active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="right" />
                    <Th label="Plan base"    sortKey="plan_base"       active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                    <Th label="Bonif. base"  sortKey="base_bonificado" active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="center" />
                    <Th label="HBO+"         sortKey="hbo"             active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="center" />
                    <Th label="Universal+"   sortKey="univ"            active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="center" />
                    <Th label="Fútbol"       sortKey="futbol"          active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="center" />
                    <Th label="App"          sortKey="app"             active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="center" />
                    <Th label="Neto TV"      sortKey="total_neto"      active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {[...data.detalle].sort((a, b) => {
                    const av = sortValue(a, sortKey);
                    const bv = sortValue(b, sortKey);
                    if (av < bv) return sortAsc ? -1 : 1;
                    if (av > bv) return sortAsc ? 1 : -1;
                    return 0;
                  }).map((r) => (
                    <tr key={r.id_conexion} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300">{r.id_conexion}</td>
                      <td className="py-2 px-3 text-slate-400">{SUCURSALES[r.cod_sucursal] ?? r.cod_sucursal}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{r.decos_iptv}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{r.decos_ott}</td>
                      <td className="py-2 px-3 text-slate-300">
                        {r.plan_base ? (
                          <div className="flex flex-col">
                            <span>{r.plan_base}</span>
                            <span className="text-[10px] text-slate-500">{pesos(r.abono_base + r.bonif_base)}</span>
                          </div>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {r.base_bonificado === 1
                          ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">Sí</span>
                              {(() => {
                                const restantes = cuotasRestantes(r.base_cant_cuotas, r.base_cuotas_generadas);
                                return restantes !== null && (
                                  <span className={`text-[10px] ${restantes === 0 ? "text-rose-400" : "text-slate-500"}`}>
                                    {restantes === 0 ? "vence próx. factura" : `vence en ${restantes} cuota${restantes === 1 ? "" : "s"}`}
                                  </span>
                                );
                              })()}
                            </div>
                          )
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <PackCell tiene={r.tiene_hbo} bonificado={r.hbo_bonificado} neto={r.neto_hbo} cantCuotas={r.hbo_cant_cuotas} cuotasGeneradas={r.hbo_cuotas_generadas} />
                      <PackCell tiene={r.tiene_univ} bonificado={r.univ_bonificado} neto={r.neto_univ} cantCuotas={r.univ_cant_cuotas} cuotasGeneradas={r.univ_cuotas_generadas} />
                      <PackCell tiene={r.tiene_futbol} bonificado={r.futbol_bonificado} neto={r.neto_futbol} cantCuotas={r.futbol_cant_cuotas} cuotasGeneradas={r.futbol_cuotas_generadas} />
                      <td className="py-2 px-3 text-center">
                        {r.tiene_app === 1
                          ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="px-2 py-0.5 rounded-full bg-slate-600/30 text-slate-300 text-xs font-semibold">
                                {r.neto_app > 0 ? "Con cargo" : "Sin cargo"}
                              </span>
                              <span className="text-[10px] text-slate-500">{pesos(r.neto_app)}</span>
                              {(() => {
                                const restantes = r.neto_app <= 0 ? cuotasRestantes(r.app_cant_cuotas, r.app_cuotas_generadas) : null;
                                return restantes !== null && (
                                  <span className={`text-[10px] ${restantes === 0 ? "text-rose-400" : "text-slate-500"}`}>
                                    {restantes === 0 ? "vence próx. factura" : `vence en ${restantes} cuota${restantes === 1 ? "" : "s"}`}
                                  </span>
                                );
                              })()}
                            </div>
                          )
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-200 font-medium">
                        {pesos(r.total_neto)}
                      </td>
                    </tr>
                  ))}
                  {data.detalle.length === 0 && (
                    <tr><td colSpan={11} className="py-6 text-center text-slate-500">Sin conexiones para este filtro</td></tr>
                  )}
                </tbody>
              </table>
              {data.detalleTotal >= 500 && (
                <p className="text-xs text-slate-500 mt-3 text-center">
                  Mostrando 500 registros — filtrá por sucursal para acotar, o usá &quot;Exportar Excel&quot; para ver todo
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      <Header
        titulo="TV — Planes y Bonificaciones"
        subtitulo={loading ? "Cargando..." : data ? `${data.total.toLocaleString("es-AR")} conexiones` : undefined}
      />

      {sucursalFiltro()}

      {errorBox}

      {loading && !data && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Cargando planes de TV…
        </div>
      )}

      {data && (
        <>
          {/* Fila 1 — KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Conexiones TV" value={data.total} color="#f8fafc" />
            <StatTile label="Decos IPTV" value={data.decosIptvTotal} color="#a855f7" />
            <StatTile label="Decos OTT" value={data.decosOttTotal} color="#06b6d4" />
            <GlobalDonutTile
              total={data.total}
              bonificado={data.planBase.bonificadoGlobal}
              conCargo={data.planBase.conCargoGlobal}
              onSelect={abrirDetalleGlobal}
            />
          </div>

          {/* Fila 1.5 — Split bonificado / con cargo / sin plan base, sobre el total de conexiones TV */}
          <PlanBaseSplit
            total={data.total}
            bonificado={data.planBase.conBonif}
            conCargo={data.planBase.conPlan - data.planBase.conBonif}
            sinPlanConCargo={data.planBase.sinPlanConCargo}
            sinPlanSinCargo={data.planBase.sinPlanSinCargo}
            onSelect={abrirDetalle}
          />

          {/* Fila 2 — Distribución de plan base */}
          {data.porPlanBase.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="text-slate-300 font-medium text-sm">Distribución de plan base</h3>
              {data.porPlanBase.map((r) => (
                <RankRow
                  key={r.plan}
                  label={r.plan}
                  cantidad={r.cantidad}
                  max={data.porPlanBase[0].cantidad}
                  color="#6366f1"
                  sublabel={`${pct(r.cantidad, data.planBase.conPlan)}%`}
                />
              ))}
            </div>
          )}

          {/* Fila 3 — Adicionales */}
          <div>
            <h3 className="text-slate-400 font-medium text-xs uppercase tracking-wider mb-3">Adicionales — penetración y bonificación</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <PackCard nombre="HBO+" stat={data.hbo} onSelect={(estado) => abrirDetallePack("hbo", estado)} />
              <PackCard nombre="Universal+" stat={data.univ} onSelect={(estado) => abrirDetallePack("univ", estado)} />
              <PackCard nombre="Fútbol" stat={data.futbol} onSelect={(estado) => abrirDetallePack("futbol", estado)} />
              <PackCard
                nombre="App GO TV"
                stat={{ tiene: data.app.tiene, bonificado: data.app.sinCargo, paga: data.app.conCargo }}
                labelVerde="sin cargo"
                labelAmbar="con cargo"
                onSelect={(estado) => abrirDetallePack("app", estado)}
              />
            </div>
          </div>

          {/* Ranking por sucursal (solo si hay más de una) */}
          {data.porSucursal.length > 1 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="text-slate-300 font-medium text-sm">Por sucursal</h3>
              {data.porSucursal.map((s) => (
                <RankRow
                  key={s.cod_sucursal}
                  label={s.nombre}
                  cantidad={s.cantidad}
                  max={data.porSucursal[0].cantidad}
                  color="#0ea5e9"
                  sublabel={`${pct(s.cantidad, data.total)}%`}
                />
              ))}
            </div>
          )}

          {/* Entrada al detalle completo */}
          <button
            onClick={() => abrirDetalle(null)}
            className="w-full text-left bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl px-5 py-3 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Ver detalle de todas las conexiones ({data.detalleTotal.toLocaleString("es-AR")}) ↗
          </button>
        </>
      )}
    </div>
  );
}
