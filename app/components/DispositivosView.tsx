"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Monitor, Wifi, Download, PackageOpen, ChevronDown } from "lucide-react";
import { getColorById } from "./MapaUtils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";

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

function TablaStock({ rows, sucursalSel, colTitulo, colSubtitulo, excelHref }: {
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

  const [sucursal, setSucursal]     = useState<number | null>(sucursalesPermitidas?.length === 1 ? sucursalesPermitidas[0] : null);
  const [tipoSel, setTipoSel]       = useState<"all" | "ont" | "deco">("all");
  const [modelosSel, setModelosSel] = useState<Set<string> | null>(null);
  const [modeloOpen, setModeloOpen] = useState(false);
  const [data, setData]             = useState<Data | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

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

  // Modelos disponibles combinando activos + stock
  const allRows        = [...(data?.activos ?? []), ...(data?.stock ?? [])];
  const rowsFiltroBase = filtrarTipo(allRows.filter(sucFiltro));
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

  const showOnts  = ontActivos.some((r) => sucursal === null || r.cod_sucursal === sucursal)  || ontStock.some((r) => sucursal === null || r.cod_sucursal === sucursal);
  const showDecos = decoActivos.some((r) => sucursal === null || r.cod_sucursal === sucursal) || decoStock.some((r) => sucursal === null || r.cod_sucursal === sucursal);

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
          <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
            {([["all", "Todos"], ["ont", "ONTs"], ["deco", "Deco/STB"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => setTipoSel(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tipoSel === val ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
          {ModeloDropdown}
        </div>
      </div>

      {/* KPIs — 4 tarjetas */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "ONTs activas",  value: totalOntsActivas,  icon: <Wifi size={16} className="text-cyan-400" />,    bg: "bg-cyan-500/20",    text: "text-cyan-400",    border: "border-slate-700" },
            { label: "Decos activos", value: totalDecosActivos, icon: <Monitor size={16} className="text-violet-400" />, bg: "bg-violet-500/20", text: "text-violet-400", border: "border-slate-700" },
            { label: "Stock ONTs",    value: totalStockOnts,    icon: <PackageOpen size={16} className="text-emerald-400" />, bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-800/40" },
            { label: "Stock Decos",   value: totalStockDecos,   icon: <PackageOpen size={16} className="text-emerald-400" />, bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-800/40" },
          ].map(({ label, value, icon, bg, text, border }) => (
            <div key={label} className={`bg-slate-800 border ${border} rounded-2xl p-5 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>{icon}</div>
              <div>
                <div className="text-xs text-slate-400">{label}</div>
                <div className={`text-xl font-bold ${text}`}>{fmt(value)}</div>
              </div>
            </div>
          ))}
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
            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-5">
              <div className="flex items-center gap-2 pb-4 mb-5 border-b border-slate-700/60">
                <Wifi size={13} className="text-cyan-400" />
                <span className="text-sm font-semibold text-cyan-400">ONTs</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <TablaActivos rows={ontActivos} sucursalSel={sucursal}
                  colTitulo="Activos en conexiones" colSubtitulo="Dispositivos en uso"
                  excelHref={buildExportUrl("/api/export/dispositivos-activos")} />
                <TablaStock rows={ontStock} sucursalSel={sucursal}
                  colTitulo="Stock disponible" colSubtitulo="Dispositivos sin asignar"
                  excelHref={buildExportUrl("/api/export/dispositivos")} />
              </div>
            </div>
          )}

          {/* Tarjeta Decos / STB */}
          {showDecos && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-5">
              <div className="flex items-center gap-2 pb-4 mb-5 border-b border-slate-700/60">
                <Monitor size={13} className="text-violet-400" />
                <span className="text-sm font-semibold text-violet-400">Decos / STB</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <TablaActivos rows={decoActivos} sucursalSel={sucursal}
                  colTitulo="Activos en conexiones" colSubtitulo="Dispositivos en uso"
                  excelHref={buildExportUrl("/api/export/dispositivos-activos")} />
                <TablaStock rows={decoStock} sucursalSel={sucursal}
                  colTitulo="Stock disponible" colSubtitulo="Dispositivos sin asignar"
                  excelHref={buildExportUrl("/api/export/dispositivos")} />
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
