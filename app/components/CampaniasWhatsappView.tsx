"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, X, Loader2, AlertCircle, Download, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown, Search, MessageCircle } from "lucide-react";

const SUCURSALES: Record<number, string> = {
  1: "Chumbicha",
  4: "Valle Viejo",
  5: "Tinogasta",
  6: "Rodeo",
  7: "La Puerta",
  8: "Fiambalá",
};

// Deben coincidir con SIN_RESPUESTA/CON_RESPUESTA/SIN_TV en app/api/campanias-whatsapp/route.ts —
// se duplican acá para no importar código de servidor (y sus dependencias de DB) al bundle del cliente.
const SIN_RESPUESTA = "__sin_respuesta__";
const CON_RESPUESTA = "__con_respuesta__";
const SIN_TV = "__sin_tv__";

// El id 3 se muestra como "Enviado" (no hay confirmación real de entrega/lectura, ver route.ts) y el 5 como "Error".
const ESTADO_COLOR: Record<string, string> = {
  Pendiente: "#64748b",
  Enviado: "#10b981",
  Leido: "#8b5cf6",
  Error: "#ef4444",
};

interface CampaniaListItem {
  id: number;
  nombre: string;
  descripcion: string | null;
  plantilla: string | null;
  estado: string | null;
  fechaCreado: string;
  fechaActualizado: string | null;
  total: number;
}

interface DetalleRow {
  conexionId: number;
  nombre: string;
  telefono: string;
  estadoId: number;
  estadoNombre: string;
  cod_sucursal: number;
  tarifa: string | null;
  tarifa_tv: string | null;
  respuesta: string | null;
  fechaRespuesta: string | null;
  fechaCreado: string;
  fechaActualizado: string;
}

interface CampaniaDetalleData {
  campania: {
    id: number; nombre: string; descripcion: string | null; plantilla: string | null;
    estado: string | null; fechaCreado: string; fechaActualizado: string | null;
  };
  total: number;
  porEstadoEnvio: { estadoId: number; nombre: string; cantidad: number }[];
  respondieron: number;
  sinRespuesta: number;
  porRespuesta: { respuesta: string; cantidad: number }[];
  conTv: number;
  sinTv: number;
  porTarifaTv: { tarifa_tv: string; cantidad: number }[];
  porSucursal: { cod_sucursal: number; nombre: string; cantidad: number; respondieron: number }[];
  detalle: DetalleRow[];
  detalleTotal: number;
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtFechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Tile de KPI, opcionalmente clickeable (lleva al detalle filtrado) ────────
function StatTile({ label, value, sublabel, color, onClick }: {
  label: string; value: string | number; sublabel?: string; color: string; onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`text-left bg-slate-800 border border-slate-700 rounded-xl p-4 ${onClick ? "hover:border-indigo-500 transition-colors cursor-pointer" : ""}`}
    >
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 truncate">{label}</p>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </Comp>
  );
}

// ── Fila de ranking (barra horizontal), opcionalmente clickeable ─────────────
function RankRow({ label, cantidad, max, color, sublabel, onClick }: {
  label: string; cantidad: number; max: number; color: string; sublabel?: string; onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={`block w-full text-left ${onClick ? "hover:opacity-75 transition-opacity" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-300 truncate flex-1 pr-3">{label}</span>
        <span className="text-xs font-semibold text-slate-100 flex-shrink-0">
          {cantidad.toLocaleString("es-AR")}{sublabel && <span className="text-slate-500 font-normal ml-1.5">{sublabel}</span>}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct(cantidad, max)}%`, backgroundColor: color }} />
      </div>
    </Comp>
  );
}

const estadoBadgeClass: Record<string, string> = {
  Pendiente: "bg-slate-700 text-slate-300",
  "En revisión": "bg-sky-900/40 text-sky-300",
  Aprobada: "bg-slate-700 text-slate-300",
  Rechazada: "bg-rose-900/40 text-rose-300",
  "En curso": "bg-amber-900/40 text-amber-300",
  Finalizada: "bg-emerald-900/40 text-emerald-300",
  Anulada: "bg-rose-900/40 text-rose-300",
};

type SortKey = "conexionId" | "nombre" | "sucursal" | "estado" | "respuesta" | "fechaRespuesta" | "fechaActualizado";

function sortValue(r: DetalleRow, key: SortKey): string | number {
  switch (key) {
    case "conexionId":       return r.conexionId;
    case "nombre":           return r.nombre ?? "";
    case "sucursal":         return SUCURSALES[r.cod_sucursal] ?? String(r.cod_sucursal);
    case "estado":           return r.estadoNombre;
    case "respuesta":        return r.respuesta ?? "";
    case "fechaRespuesta":   return r.fechaRespuesta ?? "";
    case "fechaActualizado": return r.fechaActualizado;
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
    <th className={`py-2 px-3 font-medium select-none cursor-pointer hover:text-slate-200 ${alignClass}`} onClick={() => onSort(sortKey)}>
      <span className={`flex items-center gap-1 ${justifyClass}`}>
        {label}
        {isActive
          ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
          : <ChevronsUpDown size={12} className="opacity-30" />}
      </span>
    </th>
  );
}

type PanelType = "campania" | "detalle" | null;

export default function CampaniasWhatsappView({ onClose, sucursalesPermitidas }: {
  onClose: () => void; sucursalesPermitidas: number[] | null;
}) {
  const sucursalesDisponibles: number[] = sucursalesPermitidas
    ? Object.keys(SUCURSALES).map(Number).filter((c) => sucursalesPermitidas.includes(c))
    : Object.keys(SUCURSALES).map(Number);

  const [panel, setPanel] = useState<PanelType>(null);
  const [sucSel, setSucSel] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [lista, setLista] = useState<CampaniaListItem[] | null>(null);
  const [loadingLista, setLoadingLista] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [campaniaId, setCampaniaId] = useState<number | null>(null);
  const [data, setData] = useState<CampaniaDetalleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filtroRespuesta, setFiltroRespuesta] = useState<string | null>(null);
  const [filtroEstadoId, setFiltroEstadoId] = useState<number | null>(null);
  const [filtroTarifaTv, setFiltroTarifaTv] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("fechaActualizado");
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  useEffect(() => { window.scrollTo(0, 0); }, [panel]);

  const fetchLista = useCallback(async () => {
    setLoadingLista(true);
    setErrorLista(null);
    const params = new URLSearchParams();
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    try {
      const res = await fetch(`/api/campanias-whatsapp?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setLista(json.campanias);
    } catch (e: unknown) {
      setErrorLista(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingLista(false);
    }
  }, [sucSel]);

  useEffect(() => { if (panel === null) fetchLista(); }, [panel, fetchLista]);

  const fetchData = useCallback(async () => {
    if (campaniaId === null) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("campaniaId", String(campaniaId));
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    if (filtroRespuesta) params.set("respuesta", filtroRespuesta);
    if (filtroEstadoId !== null) params.set("estadoId", String(filtroEstadoId));
    if (filtroTarifaTv) params.set("tarifaTv", filtroTarifaTv);
    try {
      const res = await fetch(`/api/campanias-whatsapp?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [campaniaId, sucSel, filtroRespuesta, filtroEstadoId, filtroTarifaTv]);

  useEffect(() => { if (campaniaId !== null) fetchData(); }, [campaniaId, fetchData]);

  const abrirCampania = (id: number) => {
    setCampaniaId(id);
    setFiltroRespuesta(null);
    setFiltroEstadoId(null);
    setFiltroTarifaTv(null);
    setData(null);
    setPanel("campania");
  };

  const abrirDetalle = (respuesta: string | null, estadoId: number | null, tarifaTv: string | null = null) => {
    setFiltroRespuesta(respuesta);
    setFiltroEstadoId(estadoId);
    setFiltroTarifaTv(tarifaTv);
    setPanel("detalle");
  };

  const exportUrl = () => {
    if (campaniaId === null) return "#";
    const params = new URLSearchParams();
    params.set("campaniaId", String(campaniaId));
    if (sucSel !== null) params.set("sucursal", String(sucSel));
    if (filtroRespuesta) params.set("respuesta", filtroRespuesta);
    if (filtroEstadoId !== null) params.set("estadoId", String(filtroEstadoId));
    if (filtroTarifaTv) params.set("tarifaTv", filtroTarifaTv);
    return `/api/export/campanias-whatsapp?${params}`;
  };

  // ── Header compartido entre las 3 pantallas ──────────────────────────────
  const Header = ({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) => (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        {panel && (
          <button
            onClick={() => panel === "detalle" ? setPanel("campania") : setPanel(null)}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mb-3"
          >
            <ArrowLeft size={15} /> {panel === "detalle" ? "Volver al resumen" : "Volver al listado"}
          </button>
        )}
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageCircle size={20} className="text-emerald-400" /> {titulo}
        </h2>
        {subtitulo && <p className="text-slate-400 text-sm mt-0.5">{subtitulo}</p>}
      </div>
      <div className="flex items-center gap-2">
        {panel === "detalle" && data && (
          <a href={exportUrl()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors"
          >
            <Download size={13} /> Exportar Excel
          </a>
        )}
        <button onClick={panel === null ? fetchLista : fetchData} disabled={panel === null ? loadingLista : loading}
          className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={(panel === null ? loadingLista : loading) ? "animate-spin" : ""} />
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

  // El seguimiento de "convertidos"/tarifa TV solo tiene sentido en campañas armadas con la
  // plantilla de fidelización (la que ofrece GO TV a cambio de una respuesta) — en el resto
  // (facturas, suspendidos, etc.) la tarifa de TV del cliente no tiene relación con la campaña.
  const esCampaniaFidelizacion = data?.campania.plantilla === "Campaña de Fidelización";

  const sucursalFiltro = sucursalesDisponibles.length > 1 && (
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
        <button
          key={cod}
          onClick={() => setSucSel(cod)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            sucSel === cod ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
          }`}
        >
          {SUCURSALES[cod]}
        </button>
      ))}
    </div>
  );

  // ══════════════════════════ Pantalla 3: detalle ══════════════════════════
  if (panel === "detalle") {
    const errorBox = error && (
      <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-900 text-rose-300 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} /> {error}
      </div>
    );

    const ordenado = data
      ? [...data.detalle].sort((a, b) => {
          const va = sortValue(a, sortKey);
          const vb = sortValue(b, sortKey);
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
          return sortAsc ? cmp : -cmp;
        })
      : [];

    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Header
          titulo={data?.campania.nombre ?? "Detalle de envíos"}
          subtitulo={data ? `${data.detalleTotal.toLocaleString("es-AR")} conexiones${
            filtroRespuesta === SIN_RESPUESTA ? " — sin respuesta"
              : filtroRespuesta === CON_RESPUESTA ? " — respondieron"
              : filtroRespuesta ? ` — respondieron "${filtroRespuesta}"`
              : ""
          }${filtroEstadoId !== null ? ` — estado ${data.porEstadoEnvio.find((e) => e.estadoId === filtroEstadoId)?.nombre ?? ""}` : ""}${
            filtroTarifaTv === SIN_TV ? " — sin tarifa TV" : filtroTarifaTv ? ` — tarifa TV "${filtroTarifaTv}"` : ""
          }` : undefined}
        />

        {sucursalFiltro}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Respuesta:</span>
            {([
              { label: "Todas", activo: filtroRespuesta === null, onClick: () => setFiltroRespuesta(null) },
              { label: "Respondieron", activo: filtroRespuesta !== null && filtroRespuesta !== SIN_RESPUESTA, onClick: () => setFiltroRespuesta(CON_RESPUESTA) },
              { label: "Sin respuesta", activo: filtroRespuesta === SIN_RESPUESTA, onClick: () => setFiltroRespuesta(SIN_RESPUESTA) },
            ]).map((op) => (
              <button
                key={op.label}
                onClick={op.onClick}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  op.activo ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>

          {esCampaniaFidelizacion && data && data.porTarifaTv.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">Tarifa TV:</span>
              {([
                { label: "Todas", valor: null, activo: filtroTarifaTv === null },
                ...data.porTarifaTv.map((t) => ({ label: t.tarifa_tv, valor: t.tarifa_tv, activo: filtroTarifaTv === t.tarifa_tv })),
                { label: "Sin TV", valor: SIN_TV, activo: filtroTarifaTv === SIN_TV },
              ]).map((op) => (
                <button
                  key={op.label}
                  onClick={() => setFiltroTarifaTv(op.valor)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    op.activo ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          )}

          {(filtroRespuesta || filtroEstadoId !== null || filtroTarifaTv !== null) && (
            <button
              onClick={() => { setFiltroRespuesta(null); setFiltroEstadoId(null); setFiltroTarifaTv(null); }}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              ✕ Quitar filtros
            </button>
          )}
        </div>

        {errorBox}

        {loading && !data && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        )}

        {data && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs table-fixed">
                <colgroup>
                  <col className="w-20" />
                  <col className="w-44" />
                  <col className="w-32" />
                  <col className="w-24" />
                  <col className="w-44" />
                  <col className="w-40" />
                  <col className="w-24" />
                  <col className="w-64" />
                  <col className="w-32" />
                  <col className="w-32" />
                </colgroup>
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                    <Th label="ID Conexión" sortKey="conexionId" active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                    <Th label="Nombre" sortKey="nombre" active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                    <th className="py-2 px-3 font-medium text-left">Teléfono</th>
                    <Th label="Sucursal" sortKey="sucursal" active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                    <th className="py-2 px-3 font-medium text-left">Tarifa Internet</th>
                    <th className="py-2 px-3 font-medium text-left">Tarifa TV</th>
                    <Th label="Estado" sortKey="estado" active={sortKey} sortAsc={sortAsc} onSort={toggleSort} align="center" />
                    <Th label="Respuesta" sortKey="respuesta" active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                    <Th label="Fecha respuesta" sortKey="fechaRespuesta" active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                    <Th label="Fecha Actualizado" sortKey="fechaActualizado" active={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {ordenado.map((r) => (
                    <tr key={r.conexionId} className="border-b border-slate-800/60 hover:bg-slate-700/20">
                      <td className="py-2 px-3 text-slate-300 truncate">{r.conexionId}</td>
                      <td className="py-2 px-3 text-slate-200 truncate" title={r.nombre}>{r.nombre}</td>
                      <td className="py-2 px-3 text-slate-400 truncate">{r.telefono}</td>
                      <td className="py-2 px-3 text-slate-300 truncate">{SUCURSALES[r.cod_sucursal] ?? r.cod_sucursal}</td>
                      <td className="py-2 px-3 text-slate-400 truncate" title={r.tarifa ?? undefined}>{r.tarifa ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-400 truncate" title={r.tarifa_tv ?? undefined}>{r.tarifa_tv ?? "—"}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: `${ESTADO_COLOR[r.estadoNombre] ?? "#64748b"}33`, color: ESTADO_COLOR[r.estadoNombre] ?? "#94a3b8" }}>
                          {r.estadoNombre}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-200 whitespace-normal break-words">{r.respuesta ?? <span className="text-slate-600">—</span>}</td>
                      <td className="py-2 px-3 text-slate-400 truncate">{fmtFecha(r.fechaRespuesta)}</td>
                      <td className="py-2 px-3 text-slate-500 truncate">{fmtFecha(r.fechaActualizado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ordenado.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-8">Sin resultados para este filtro.</p>
              )}
              {data.detalleTotal > 500 && (
                <p className="text-center text-slate-500 text-xs py-3">
                  Mostrando 500 de {data.detalleTotal.toLocaleString("es-AR")} — exportá a Excel para ver el listado completo.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════ Pantalla 2: resumen de campaña ═══════════════════
  if (panel === "campania") {
    const errorBox = error && (
      <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-900 text-rose-300 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} /> {error}
      </div>
    );

    return (
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Header
          titulo={data?.campania.nombre ?? "Campaña"}
          subtitulo={data ? [data.campania.plantilla, data.campania.estado, fmtFecha(data.campania.fechaCreado)].filter(Boolean).join(" · ") : undefined}
        />

        {sucursalFiltro}

        {errorBox}

        {loading && !data && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Cargando campaña…
          </div>
        )}

        {data && (
          <>
            {data.campania.descripcion && data.campania.descripcion !== data.campania.nombre && (
              <p className="text-slate-400 text-sm -mt-4">{data.campania.descripcion}</p>
            )}

            {/* KPIs */}
            <div className={`grid grid-cols-2 gap-3 ${esCampaniaFidelizacion ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
              <StatTile
                label="Destinatarios"
                value={data.total.toLocaleString("es-AR")}
                color="#f8fafc"
                onClick={() => abrirDetalle(null, null)}
              />
              <StatTile
                label="Enviados"
                value={`${pct(data.porEstadoEnvio.find((e) => e.estadoId === 3)?.cantidad ?? 0, data.total)}%`}
                sublabel={`${(data.porEstadoEnvio.find((e) => e.estadoId === 3)?.cantidad ?? 0).toLocaleString("es-AR")} de ${data.total.toLocaleString("es-AR")}`}
                color="#10b981"
                onClick={() => abrirDetalle(null, 3)}
              />
              <StatTile
                label="Respondieron"
                value={`${pct(data.respondieron, data.total)}%`}
                sublabel={`${data.respondieron.toLocaleString("es-AR")} de ${data.total.toLocaleString("es-AR")}`}
                color="#a855f7"
                onClick={() => abrirDetalle(CON_RESPUESTA, null)}
              />
              <StatTile
                label="Sin respuesta"
                value={`${pct(data.sinRespuesta, data.total)}%`}
                sublabel={`${data.sinRespuesta.toLocaleString("es-AR")} de ${data.total.toLocaleString("es-AR")}`}
                color="#64748b"
                onClick={() => abrirDetalle(SIN_RESPUESTA, null)}
              />
              {esCampaniaFidelizacion && (
                <StatTile
                  label="Convertidos"
                  value={`${pct(data.conTv, data.respondieron)}%`}
                  sublabel={`${data.conTv.toLocaleString("es-AR")} de ${data.respondieron.toLocaleString("es-AR")} respondieron`}
                  color="#06b6d4"
                  onClick={() => abrirDetalle(null, null, data.porTarifaTv.length === 1 ? data.porTarifaTv[0].tarifa_tv : null)}
                />
              )}
            </div>

            {/* Estado de envío */}
            {data.porEstadoEnvio.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                <h3 className="text-slate-300 font-medium text-sm">Estado de envío</h3>
                {data.porEstadoEnvio.map((e) => (
                  <RankRow
                    key={e.nombre}
                    label={e.nombre}
                    cantidad={e.cantidad}
                    max={data.total}
                    color={ESTADO_COLOR[e.nombre] ?? "#6366f1"}
                    sublabel={`${pct(e.cantidad, data.total)}%`}
                    onClick={() => abrirDetalle(null, e.estadoId)}
                  />
                ))}
              </div>
            )}

            {/* Respuestas */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="text-slate-300 font-medium text-sm">Respuestas recibidas</h3>
              {data.porRespuesta.length === 0 && (
                <p className="text-slate-500 text-xs">Todavía no hay respuestas registradas para esta campaña.</p>
              )}
              {data.porRespuesta.map((r) => (
                <RankRow
                  key={r.respuesta}
                  label={r.respuesta}
                  cantidad={r.cantidad}
                  max={data.total}
                  color="#a855f7"
                  sublabel={`${pct(r.cantidad, data.total)}%`}
                  onClick={() => abrirDetalle(r.respuesta, null)}
                />
              ))}
              {data.sinRespuesta > 0 && (
                <RankRow
                  label="Sin respuesta"
                  cantidad={data.sinRespuesta}
                  max={data.total}
                  color="#334155"
                  sublabel={`${pct(data.sinRespuesta, data.total)}%`}
                  onClick={() => abrirDetalle(SIN_RESPUESTA, null)}
                />
              )}
            </div>

            {/* Tarifa TV — quiénes ya tienen una tarifa de TV asignada (ej. convertidos con ODS generada) */}
            {esCampaniaFidelizacion && data.conTv > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                <h3 className="text-slate-300 font-medium text-sm">Tarifa TV asignada</h3>
                {data.porTarifaTv.map((t) => (
                  <RankRow
                    key={t.tarifa_tv}
                    label={t.tarifa_tv}
                    cantidad={t.cantidad}
                    max={data.total}
                    color="#06b6d4"
                    sublabel={`${pct(t.cantidad, data.total)}%`}
                    onClick={() => abrirDetalle(null, null, t.tarifa_tv)}
                  />
                ))}
              </div>
            )}

            {/* Ranking por sucursal */}
            {data.porSucursal.length > 1 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                <h3 className="text-slate-300 font-medium text-sm">Por sucursal</h3>
                {data.porSucursal.map((s) => (
                  <RankRow
                    key={s.cod_sucursal}
                    label={s.nombre}
                    cantidad={s.cantidad}
                    max={data.porSucursal[0].cantidad}
                    color="#6366f1"
                    sublabel={`${s.respondieron} respondieron`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ══════════════════════════ Pantalla 1: listado ══════════════════════════
  const listaFiltrada = (lista ?? []).filter((c) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.trim().toLowerCase();
    return c.nombre.toLowerCase().includes(q)
      || (c.descripcion ?? "").toLowerCase().includes(q)
      || (c.plantilla ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <Header titulo="Campañas de WhatsApp" subtitulo="Seguimiento de envíos y respuestas" />

      {sucursalFiltro}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar campaña por nombre o plantilla…"
          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {errorLista && (
        <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-900 text-rose-300 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} /> {errorLista}
        </div>
      )}

      {loadingLista && !lista && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Cargando campañas…
        </div>
      )}

      {lista && (
        <div className="space-y-2">
          {listaFiltrada.map((c) => (
            <button
              key={c.id}
              onClick={() => abrirCampania(c.id)}
              className="w-full text-left bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-xl p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-100">{c.nombre}</span>
                    {c.estado && (
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${estadoBadgeClass[c.estado] ?? "bg-slate-700 text-slate-300"}`}>
                        {c.estado}
                      </span>
                    )}
                  </div>
                  {c.descripcion && c.descripcion !== c.nombre && (
                    <p className="text-xs text-slate-400 mt-0.5">{c.descripcion}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {c.plantilla && <>{c.plantilla} · </>}
                    {fmtFechaCorta(c.fechaCreado)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-slate-100">{c.total.toLocaleString("es-AR")}</div>
                  <div className="text-[11px] text-slate-500">destinatarios</div>
                </div>
              </div>
            </button>
          ))}
          {listaFiltrada.length === 0 && (
            <p className="text-center text-slate-500 text-sm py-8">No se encontraron campañas.</p>
          )}
        </div>
      )}
    </div>
  );
}
