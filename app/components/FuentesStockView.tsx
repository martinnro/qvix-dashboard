"use client";
import { useState, useEffect } from "react";
import {
  ArrowLeft, Plus, Trash2, Pencil, X, Check,
  AlertCircle, Package, Wrench, RefreshCw, Share2,
} from "lucide-react";

const CUADRILLAS = [
  "Carpio/Lopez",
  "Unzaga F./Unzaga M.",
  "Dario Aballay",
  "Anibal Aragon",
  "Martin Molina",
  "Dario Ferreyra",
  "Emma Fernandez",
];

interface FuentaRow {
  id: string;
  fecha: string;
  ingreso: number;
  egreso_salon: number;
  cuadrillas: Record<string, number>;
  observacion: string;
}

interface ControlRow {
  id_conexion: number;
  id_Orden_Servicio: number;
  Estado_Servicio: string;
  problema_descripcion: string;
  asistencia: string;
  Tiene_Fuente_12V: "SI" | "NO";
  Otros_Materiales: string;
  fecha_reclamo: string;
  fecha_solucion: string;
  Motivo_Estado: string;
}

type SubView = "stock" | "control";

const emptyForm = (): Omit<FuentaRow, "id"> => ({
  fecha: new Date().toISOString().slice(0, 10),
  ingreso: 0,
  egreso_salon: 0,
  cuadrillas: Object.fromEntries(CUADRILLAS.map((c) => [c, 0])),
  observacion: "",
});

function calcDisponible(row: FuentaRow) {
  const totalCuadrillas = CUADRILLAS.reduce((s, c) => s + (row.cuadrillas[c] ?? 0), 0);
  return row.ingreso - row.egreso_salon - totalCuadrillas;
}

function fmtFecha(fecha: string) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR");
}

export default function FuentesStockView({ onClose }: { onClose: () => void }) {
  const [subView, setSubView] = useState<SubView>("stock");

  // ── Stock ──────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<FuentaRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Modal agregar / editar
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<FuentaRow | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");

  // Modal distribuir
  const [distributeRow, setDistributeRow] = useState<FuentaRow | null>(null);
  const [distributeAmounts, setDistributeAmounts] = useState<Record<string, number>>({});
  const [distributeError, setDistributeError] = useState("");

  // ── Control ────────────────────────────────────────────────────────────────
  const [controlRows, setControlRows] = useState<ControlRow[]>([]);
  const [controlLoading, setControlLoading] = useState(false);
  const [controlError, setControlError] = useState("");
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [fechaHasta, setFechaHasta] = useState("");
  const [tieneFuente, setTieneFuente] = useState("");

  // ── Carga ──────────────────────────────────────────────────────────────────
  const load = () => {
    fetch("/api/fuentes-stock")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setRows(d))
      .catch(() => {});
  };

  const loadControl = () => {
    setControlLoading(true); setControlError(""); setControlRows([]);
    const p = new URLSearchParams();
    if (fechaDesde) p.set("fecha_desde", fechaDesde);
    if (fechaHasta) p.set("fecha_hasta", fechaHasta);
    if (tieneFuente) p.set("tiene_fuente", tieneFuente);
    fetch(`/api/fuentes-control?${p.toString()}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Error al cargar datos del servidor.");
        if (Array.isArray(d)) setControlRows(d);
        else throw new Error("Respuesta inválida del servidor.");
      })
      .catch((e: Error) => setControlError(e.message))
      .finally(() => setControlLoading(false));
  };

  useEffect(() => { load(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (subView === "control") loadControl(); }, [subView]);

  // ── Totales ────────────────────────────────────────────────────────────────
  const totalIngreso    = rows.reduce((s, r) => s + r.ingreso, 0);
  const totalDisponible = rows.reduce((s, r) => s + calcDisponible(r), 0);
  const totalEgresado   = totalIngreso - totalDisponible;

  // ── Handlers stock ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditRow(null); setForm(emptyForm()); setFormError(""); setShowModal(true);
  };
  const openEdit = (row: FuentaRow) => {
    setEditRow(row); setForm({ ...row }); setFormError(""); setShowModal(true);
  };
  const updateCuadrilla = (name: string, val: string) =>
    setForm((f) => ({ ...f, cuadrillas: { ...f.cuadrillas, [name]: parseInt(val) || 0 } }));

  const save = async () => {
    if (!form.fecha)                       { setFormError("La fecha es obligatoria."); return; }
    if (!editRow && form.ingreso <= 0)     { setFormError("El ingreso debe ser mayor a 0."); return; }
    setSaving(true); setFormError("");
    try {
      const method = editRow ? "PUT" : "POST";
      const body   = editRow ? { ...form, id: editRow.id } : form;
      const res    = await fetch("/api/fuentes-stock", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al guardar.");
      load(); setShowModal(false);
    } catch (e) { setFormError((e as Error).message); }
    finally     { setSaving(false); }
  };

  // ── Handlers distribuir ────────────────────────────────────────────────────
  const openDistribute = (row: FuentaRow) => {
    setDistributeRow(row); setDistributeAmounts({}); setDistributeError("");
  };

  const setAmount = (key: string, val: string) =>
    setDistributeAmounts((p) => ({ ...p, [key]: parseInt(val) || 0 }));

  const totalDistributing = Object.values(distributeAmounts).reduce((s, v) => s + (v || 0), 0);
  const stockRestante     = distributeRow ? calcDisponible(distributeRow) - totalDistributing : 0;

  const distribute = async () => {
    if (!distributeRow) return;
    if (totalDistributing <= 0) { setDistributeError("Ingresá al menos una cantidad."); return; }
    if (totalDistributing > calcDisponible(distributeRow)) {
      setDistributeError(`Stock insuficiente. Disponible: ${calcDisponible(distributeRow)}`); return;
    }
    setSaving(true); setDistributeError("");
    const updated: FuentaRow = {
      ...distributeRow,
      cuadrillas: { ...distributeRow.cuadrillas },
    };
    if ((distributeAmounts["salon"] ?? 0) > 0)
      updated.egreso_salon += distributeAmounts["salon"];
    for (const c of CUADRILLAS)
      if ((distributeAmounts[c] ?? 0) > 0)
        updated.cuadrillas[c] = (updated.cuadrillas[c] ?? 0) + distributeAmounts[c];
    try {
      const res = await fetch("/api/fuentes-stock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Error al guardar.");
      load(); setDistributeRow(null);
    } catch (e) { setDistributeError((e as Error).message); }
    finally     { setSaving(false); }
  };

  const confirmDelete = async (id: string) => {
    await fetch("/api/fuentes-stock", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeleteId(null); load();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors">
          <ArrowLeft size={15} /> Volver
        </button>
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package size={20} className="text-sky-400" /> Fuentes
          </h2>
          <p className="text-slate-400 text-sm">Stock y distribución de fuentes</p>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit">
        {(["stock", "control"] as SubView[]).map((v) => (
          <button key={v} onClick={() => setSubView(v)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${subView === v ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            {v === "stock" ? <><Package size={14} /> Stock</> : <><Wrench size={14} /> Control con sistema</>}
          </button>
        ))}
      </div>

      {/* ══ STOCK ══════════════════════════════════════════════════════════════ */}
      {subView === "stock" && (
        <>
          {/* Cards resumen */}
          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-amber-400 mb-1">Total ingresado</p>
                <p className="text-2xl font-bold text-amber-300">{totalIngreso}</p>
              </div>
              <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-orange-400 mb-1">Total egresado</p>
                <p className="text-2xl font-bold text-red-300">{totalEgresado}</p>
              </div>
              <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-emerald-400 mb-1">Stock disponible</p>
                <p className={`text-2xl font-bold ${totalDisponible > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                  {totalDisponible}
                </p>
              </div>
            </div>
          )}

          {/* Botón agregar */}
          <div className="flex justify-end">
            <button onClick={openAdd}
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Plus size={15} /> Agregar ingreso
            </button>
          </div>

          {/* ── TABLA (desktop) ── */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-700">
            <table className="w-full text-sm border-collapse min-w-[1100px]">
              <thead>
                <tr>
                  <th colSpan={2} className="bg-amber-700/40 text-amber-300 font-semibold px-3 py-2 text-center border border-slate-700">Ingreso</th>
                  <th colSpan={CUADRILLAS.length + 1} className="bg-orange-700/40 text-orange-300 font-semibold px-3 py-2 text-center border border-slate-700">Egreso</th>
                  <th className="bg-emerald-700/40 text-emerald-300 font-semibold px-3 py-2 text-center border border-slate-700">Disponible En Stock</th>
                  <th className="bg-slate-700/60 text-slate-300 font-semibold px-3 py-2 text-center border border-slate-700">Observación</th>
                  <th className="bg-slate-700/60 px-3 py-2 border border-slate-700" />
                </tr>
                <tr>
                  <th className="bg-amber-900/30 text-amber-200 text-xs px-3 py-1.5 border border-slate-700">Fuentes (Suc. Valle Viejo)</th>
                  <th className="bg-amber-900/30 text-amber-200 text-xs px-3 py-1.5 border border-slate-700">Fecha</th>
                  <th className="bg-orange-900/30 text-orange-200 text-xs px-3 py-1.5 border border-slate-700 text-center">Fuentes (Salón Comercial)</th>
                  <th colSpan={CUADRILLAS.length} className="bg-orange-900/20 text-orange-200 text-xs px-3 py-1.5 border border-slate-700 text-center">Fuentes (Cuadrillas)</th>
                  <th className="bg-emerald-900/30 border border-slate-700" />
                  <th className="bg-slate-800/60 border border-slate-700" />
                  <th className="bg-slate-800/60 border border-slate-700" />
                </tr>
                <tr>
                  <th className="bg-slate-800 border border-slate-700" />
                  <th className="bg-slate-800 border border-slate-700" />
                  <th className="bg-slate-800 border border-slate-700" />
                  {CUADRILLAS.map((c) => (
                    <th key={c} className="bg-slate-800 text-slate-400 text-xs px-2 py-1.5 font-normal border border-slate-700 text-center whitespace-nowrap">({c})</th>
                  ))}
                  <th className="bg-slate-800 border border-slate-700" />
                  <th className="bg-slate-800 border border-slate-700" />
                  <th className="bg-slate-800 border border-slate-700" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={CUADRILLAS.length + 5} className="text-center text-slate-500 py-12">
                      Sin registros. Usá &quot;Agregar ingreso&quot; para comenzar.
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const disponible = calcDisponible(row);
                  return (
                    <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-2 text-center font-medium text-amber-300">{row.ingreso || ""}</td>
                      <td className="px-3 py-2 text-center text-slate-300 whitespace-nowrap">{row.fecha ? fmtFecha(row.fecha) : ""}</td>
                      <td className="px-3 py-2 text-center text-red-400 font-medium">{row.egreso_salon || ""}</td>
                      {CUADRILLAS.map((c) => (
                        <td key={c} className="px-3 py-2 text-center text-red-400 font-medium">{row.cuadrillas[c] || ""}</td>
                      ))}
                      <td className={`px-3 py-2 text-center font-bold ${disponible > 0 ? "text-emerald-400" : disponible < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {disponible}
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        {row.observacion && (
                          <span className="inline-block bg-orange-900/40 text-orange-300 text-xs px-2 py-1 rounded-lg">{row.observacion}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {disponible > 0 && (
                            <button onClick={() => openDistribute(row)} title="Distribuir"
                              className="p-1.5 text-slate-500 hover:text-sky-400 transition-colors rounded">
                              <Share2 size={13} />
                            </button>
                          )}
                          <button onClick={() => openEdit(row)} title="Editar"
                            className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors rounded">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setDeleteId(row.id)} title="Eliminar"
                            className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length > 0 && (
                  <tr className="bg-slate-800/60 font-semibold border-t-2 border-slate-600">
                    <td className="px-3 py-2 text-center text-amber-300">{totalIngreso}</td>
                    <td className="px-3 py-2 text-center text-slate-500 text-xs">Total</td>
                    <td className="px-3 py-2 text-center text-red-400">
                      {rows.reduce((s, r) => s + r.egreso_salon, 0) || ""}
                    </td>
                    {CUADRILLAS.map((c) => (
                      <td key={c} className="px-3 py-2 text-center text-red-400">
                        {rows.reduce((s, r) => s + (r.cuadrillas[c] ?? 0), 0) || ""}
                      </td>
                    ))}
                    <td className={`px-3 py-2 text-center font-bold ${totalDisponible > 0 ? "text-emerald-400" : totalDisponible < 0 ? "text-red-400" : "text-slate-500"}`}>
                      {totalDisponible}
                    </td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── TARJETAS (mobile) ── */}
          <div className="md:hidden space-y-3">
            {rows.length === 0 && (
              <p className="text-center text-slate-500 py-10">
                Sin registros. Usá &quot;Agregar ingreso&quot; para comenzar.
              </p>
            )}
            {rows.map((row) => {
              const disponible = calcDisponible(row);
              const egresoCuad = CUADRILLAS.reduce((s, c) => s + (row.cuadrillas[c] ?? 0), 0);
              const totalEgRow = row.egreso_salon + egresoCuad;
              return (
                <div key={row.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
                  {/* Cabecera */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Ingreso</p>
                      <p className="text-2xl font-bold text-amber-300">{row.ingreso}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Fecha</p>
                      <p className="text-sm text-slate-300">{row.fecha ? fmtFecha(row.fecha) : "—"}</p>
                    </div>
                  </div>

                  {/* Egresos */}
                  {totalEgRow > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {row.egreso_salon > 0 && (
                        <span className="text-xs bg-slate-900/60 border border-slate-700 rounded px-2 py-0.5 text-red-400">
                          Salón: {row.egreso_salon}
                        </span>
                      )}
                      {CUADRILLAS.filter((c) => (row.cuadrillas[c] ?? 0) > 0).map((c) => (
                        <span key={c} className="text-xs bg-slate-900/60 border border-slate-700 rounded px-2 py-0.5 text-red-400">
                          {c.split("/")[0]}: {row.cuadrillas[c]}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Disponible + acciones */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-700">
                    <div>
                      <p className="text-xs text-slate-500">Disponible</p>
                      <p className={`text-2xl font-bold ${disponible > 0 ? "text-emerald-400" : disponible < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {disponible}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {disponible > 0 && (
                        <button onClick={() => openDistribute(row)}
                          className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                          <Share2 size={12} /> Distribuir
                        </button>
                      )}
                      <button onClick={() => openEdit(row)}
                        className="p-2 text-slate-500 hover:text-indigo-400 rounded-lg hover:bg-slate-700 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteId(row.id)}
                        className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-700 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {row.observacion && (
                    <span className="inline-block bg-orange-900/40 text-orange-300 text-xs px-2 py-1 rounded-lg">
                      {row.observacion}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══ CONTROL ════════════════════════════════════════════════════════════ */}
      {subView === "control" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {[{ label: "Desde", val: fechaDesde, set: setFechaDesde }, { label: "Hasta", val: fechaHasta, set: setFechaHasta }].map(({ label, val, set }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">{label}</label>
                <input type="date" value={val} onChange={(e) => set(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Fuente 12V</label>
              <select value={tieneFuente} onChange={(e) => setTieneFuente(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
                <option value="">Todos</option>
                <option value="SI">Con fuente</option>
                <option value="NO">Sin fuente</option>
              </select>
            </div>
            <button onClick={loadControl} disabled={controlLoading}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <RefreshCw size={14} className={controlLoading ? "animate-spin" : ""} />
              {controlLoading ? "Cargando..." : "Buscar"}
            </button>
            {!controlLoading && controlRows.length > 0 && (
              <span className="text-sm text-slate-400">{controlRows.length} ODS encontradas</span>
            )}
          </div>

          {controlError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-950/30 border border-red-800 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={15} /> {controlError}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-700 relative">
            {controlLoading && (
              <div className="absolute inset-0 bg-slate-900/70 z-10 flex items-center justify-center rounded-2xl">
                <div className="flex items-center gap-2 text-slate-300 text-sm">
                  <RefreshCw size={16} className="animate-spin" /> Cargando datos...
                </div>
              </div>
            )}
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  {["ODS", "Conexión", "Estado Servicio", "Asistencia", "Problema", "Fuente 12V", "Otros materiales", "Reclamo", "Solución"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left border-b border-slate-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!controlLoading && controlRows.length === 0 && !controlError && (
                  <tr><td colSpan={9} className="text-center text-slate-500 py-12">Sin resultados. Ajustá los filtros y presioná Buscar.</td></tr>
                )}
                {controlRows.map((row) => (
                  <tr key={row.id_Orden_Servicio} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2 text-slate-300 font-mono">{row.id_Orden_Servicio}</td>
                    <td className="px-3 py-2 text-slate-300">{row.id_conexion}</td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{row.Estado_Servicio ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{row.asistencia ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-400 max-w-[180px] truncate" title={row.problema_descripcion ?? ""}>{row.problema_descripcion ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${row.Tiene_Fuente_12V === "SI" ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"}`}>
                        {row.Tiene_Fuente_12V}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate" title={row.Otros_Materiales ?? ""}>{row.Otros_Materiales || "—"}</td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{row.fecha_reclamo ? new Date(row.fecha_reclamo).toLocaleDateString("es-AR") : "—"}</td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{row.fecha_solucion ? new Date(row.fecha_solucion).toLocaleDateString("es-AR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ MODAL AGREGAR / EDITAR ══════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-slate-100 font-semibold">
                {editRow ? "Editar registro" : "Agregar ingreso de fuentes"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-200"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Fecha</label>
                  <input type="date" value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-amber-400 mb-1.5">Fuentes ingresadas</label>
                  <input type="number" min={0} value={form.ingreso}
                    onChange={(e) => setForm((f) => ({ ...f, ingreso: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-amber-300 text-center focus:outline-none focus:border-amber-500" />
                </div>
              </div>

              {/* Campos extra solo en edición */}
              {editRow && (
                <>
                  <div>
                    <label className="block text-xs text-orange-400 mb-1.5">Egreso — Salón Comercial</label>
                    <input type="number" min={0} value={form.egreso_salon}
                      onChange={(e) => setForm((f) => ({ ...f, egreso_salon: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-red-300 text-center focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-orange-400 mb-2">Egreso — Cuadrillas</label>
                    <div className="grid grid-cols-2 gap-2">
                      {CUADRILLAS.map((c) => (
                        <div key={c} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                          <span className="text-xs text-slate-400 flex-1">{c}</span>
                          <input type="number" min={0} value={form.cuadrillas[c] ?? 0}
                            onChange={(e) => updateCuadrilla(c, e.target.value)}
                            className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-red-300 text-center focus:outline-none focus:border-orange-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Observación</label>
                    <input type="text" value={form.observacion}
                      onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
                      placeholder="Ej: Fuentes De Ont Huawei"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                  </div>
                </>
              )}

              {/* Preview disponible */}
              {(() => {
                const preview = editRow
                  ? (form.ingreso ?? 0) - (form.egreso_salon ?? 0) - CUADRILLAS.reduce((s, c) => s + (form.cuadrillas[c] ?? 0), 0)
                  : (form.ingreso ?? 0);
                return (
                  <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                    <span className="text-sm text-slate-400">Disponible en stock</span>
                    <span className={`text-xl font-bold ${preview > 0 ? "text-emerald-400" : preview < 0 ? "text-red-400" : "text-slate-500"}`}>{preview}</span>
                  </div>
                );
              })()}

              {formError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-4 py-2 text-sm">
                  <AlertCircle size={15} /> {formError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors">
                <Check size={15} /> {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DISTRIBUIR ════════════════════════════════════════════════════ */}
      {distributeRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
              <div>
                <h3 className="text-slate-100 font-semibold flex items-center gap-2">
                  <Share2 size={16} className="text-sky-400" /> Distribuir fuentes
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registro del {fmtFecha(distributeRow.fecha)}
                </p>
              </div>
              <button onClick={() => setDistributeRow(null)} className="text-slate-500 hover:text-slate-200"><X size={20} /></button>
            </div>

            {/* Stock actual */}
            <div className="px-6 pt-4 flex-shrink-0">
              <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-4 py-3">
                <span className="text-sm text-slate-400">Stock disponible</span>
                <span className="text-xl font-bold text-emerald-400">{calcDisponible(distributeRow)}</span>
              </div>
            </div>

            {/* Destinos — scrollable */}
            <div className="px-6 py-4 space-y-2 overflow-y-auto flex-1">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Ingresá la cantidad por destino</p>

              {/* Salón comercial */}
              <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5">
                <span className="flex-1 text-sm text-slate-300">Salón Comercial</span>
                <input type="number" min={0} value={distributeAmounts["salon"] || ""}
                  placeholder="0"
                  onChange={(e) => setAmount("salon", e.target.value)}
                  className="w-20 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-red-300 text-center focus:outline-none focus:border-sky-500" />
              </div>

              {/* Cuadrillas */}
              {CUADRILLAS.map((c) => (
                <div key={c} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5">
                  <span className="flex-1 text-sm text-slate-300">{c}</span>
                  <input type="number" min={0} value={distributeAmounts[c] || ""}
                    placeholder="0"
                    onChange={(e) => setAmount(c, e.target.value)}
                    className="w-20 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-red-300 text-center focus:outline-none focus:border-sky-500" />
                </div>
              ))}
            </div>

            {/* Footer con totales */}
            <div className="px-6 pb-5 pt-3 border-t border-slate-800 space-y-3 flex-shrink-0">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Total a distribuir</span>
                <span className="text-lg font-bold text-red-300">{totalDistributing}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Stock restante</span>
                <span className={`text-lg font-bold ${stockRestante > 0 ? "text-emerald-400" : stockRestante === 0 ? "text-slate-500" : "text-red-400"}`}>
                  {stockRestante}
                </span>
              </div>

              {distributeError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-4 py-2 text-sm">
                  <AlertCircle size={15} /> {distributeError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setDistributeRow(null)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">Cancelar</button>
                <button onClick={distribute} disabled={saving || totalDistributing <= 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors">
                  <Check size={15} /> {saving ? "Guardando..." : "Distribuir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM DELETE ══════════════════════════════════════════════════════ */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <p className="text-slate-200 text-sm">¿Eliminar este registro?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">Cancelar</button>
              <button onClick={() => confirmDelete(deleteId)} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
