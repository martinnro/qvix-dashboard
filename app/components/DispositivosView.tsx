"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Monitor, Wifi, Download, PackageOpen } from "lucide-react";
import { getColorById } from "./MapaUtils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";

const SUCURSALES: Record<number, string> = {
  4: "Valle Viejo",
  1: "Chumbicha",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

const SUCURSAL_COLORS: Record<number, string> = {
  1: "#06b6d4",
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

function TablaActivos({ rows, sucursalSel }: { rows: DispositivoRow[]; sucursalSel: number | null }) {
  const filtrados = sucursalSel ? rows.filter((r) => r.cod_sucursal === sucursalSel) : rows;
  if (filtrados.length === 0) return <p className="text-slate-500 text-sm">Sin datos para mostrar.</p>;

  const decos = filtrados.filter((r) => !esOnt(r.tipo_dispositivo));
  const onts  = filtrados.filter((r) =>  esOnt(r.tipo_dispositivo));

  const Seccion = ({ titulo, data, color }: { titulo: string; data: DispositivoRow[]; color: string }) => {
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
        <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", minWidth: 200 }}>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{label}</div>
          {entries.map((e) => (
            <div key={e.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 4, fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: e.fill, flexShrink: 0 }} />
                <span style={{ color: "#cbd5e1" }}>{e.nombre}</span>
              </div>
              <span style={{ color: "#f1f5f9", fontWeight: 500 }}>{fmt(e.value)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #334155", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "#64748b" }}>Total</span>
            <span style={{ color: "#fff", fontWeight: 700 }}>{fmt(tot)}</span>
          </div>
        </div>
      );
    };

    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{titulo}</span>
          <span className="text-xs text-slate-500">— {fmt(total)} total</span>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 0, right: 55, left: 0, bottom: 0 }}
              barSize={20}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="modelo"
                width={230}
                tickLine={false}
                axisLine={false}
                tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => {
                  const { x, y, payload } = props;
                  const text = payload.value.length > 34 ? payload.value.slice(0, 32) + "…" : payload.value;
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

function TablaStock({ rows, sucursalSel }: { rows: DispositivoRow[]; sucursalSel: number | null }) {
  const filtrados = sucursalSel ? rows.filter((r) => r.cod_sucursal === sucursalSel) : rows;
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
        <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "10px 14px", minWidth: 200 }}>
          <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{label}</div>
          {entries.map((e) => (
            <div key={e.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 4, fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: e.fill, flexShrink: 0 }} />
                <span style={{ color: "#cbd5e1" }}>{e.nombre}</span>
              </div>
              <span style={{ color: "#f1f5f9", fontWeight: 500 }}>{fmt(e.value)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #334155", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "#64748b" }}>Total</span>
            <span style={{ color: "#fff", fontWeight: 700 }}>{fmt(tot)}</span>
          </div>
        </div>
      );
    };

    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{titulo}</span>
          <span className="text-xs text-slate-500">— {fmt(total)} total</span>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 0, right: 55, left: 0, bottom: 0 }}
              barSize={20}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="modelo"
                width={230}
                tickLine={false}
                axisLine={false}
                tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => {
                  const { x, y, payload } = props;
                  const text = payload.value.length > 34 ? payload.value.slice(0, 32) + "…" : payload.value;
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

  const [sucursal, setSucursal] = useState<number | null>(
    sucursalesPermitidas?.length === 1 ? sucursalesPermitidas[0] : null
  );
  const [tab, setTab]     = useState<"activos" | "stock">("activos");
  const [data, setData]   = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sucursal !== null) params.set("sucursal", String(sucursal));
      const res = await fetch(`/api/dispositivos?${params}`);
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

  const sucFiltro = (r: DispositivoRow) => sucursal === null || r.cod_sucursal === sucursal;
  const totalActivos    = data ? data.activos.filter((r) => !esOnt(r.tipo_dispositivo) && sucFiltro(r)).reduce((s, r) => s + r.cantidad, 0) : 0;
  const totalOnts       = data ? data.activos.filter((r) =>  esOnt(r.tipo_dispositivo) && sucFiltro(r)).reduce((s, r) => s + r.cantidad, 0) : 0;
  const totalStock      = data ? data.stock.filter(sucFiltro).reduce((s, r) => s + r.cantidad, 0) : 0;
  const totalStockOnts  = data ? data.stock.filter((r) =>  esOnt(r.tipo_dispositivo) && sucFiltro(r)).reduce((s, r) => s + r.cantidad, 0) : 0;
  const totalStockDecos = data ? data.stock.filter((r) => !esOnt(r.tipo_dispositivo) && sucFiltro(r)).reduce((s, r) => s + r.cantidad, 0) : 0;

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
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm transition-colors">
            ← Volver
          </button>
        </div>
      </div>

      {/* Filtro sucursal */}
      {sucursalesDisponibles.length > 1 && (
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit flex-wrap">
          <button
            onClick={() => setSucursal(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sucursal === null ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            Todas
          </button>
          {sucursalesDisponibles.map(([cod, nombre]) => (
            <button key={cod} onClick={() => setSucursal(Number(cod))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sucursal === Number(cod) ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {nombre}
            </button>
          ))}
        </div>
      )}

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {/* ONTs activas */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <Wifi size={18} className="text-cyan-400" />
            </div>
            <div>
              <div className="text-xs text-slate-400">ONTs activas</div>
              <div className="text-2xl font-bold text-cyan-400">{fmt(totalOnts)}</div>
            </div>
          </div>
          {/* Decos activas */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
              <Monitor size={18} className="text-violet-400" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Decos activas</div>
              <div className="text-2xl font-bold text-violet-400">{fmt(totalActivos)}</div>
            </div>
          </div>
          {/* En stock con desglose */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <PackageOpen size={18} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-400">En stock</div>
              <div className="text-2xl font-bold text-emerald-400">{fmt(totalStock)}</div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-cyan-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                  {fmt(totalStockOnts)} ONT
                </span>
                <span className="text-xs text-violet-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                  {fmt(totalStockDecos)} Deco
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("activos")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "activos" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
        >
          Activos en conexiones
        </button>
        <button
          onClick={() => setTab("stock")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "stock" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
        >
          Stock disponible
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      )}

      {loading && !data && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-800/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {data && tab === "activos" && (
        <TablaActivos rows={data.activos} sucursalSel={sucursal} />
      )}
      {data && tab === "stock" && (
        <>
          <div className="flex justify-end">
            <a
              href={`/api/export/dispositivos${sucursal ? `?sucursal=${sucursal}` : ""}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm transition-colors"
            >
              <Download size={14} /> Exportar Excel
            </a>
          </div>
          <TablaStock rows={data.stock} sucursalSel={sucursal} />
        </>
      )}
    </div>
  );
}
