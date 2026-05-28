"use client";
import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, X, Check, AlertCircle, Package, Wrench, RefreshCw, Share2 } from "lucide-react";

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

export default function FuentesStockView({ onClose }: { onClose: () => void }) {
  const [subView, setSubView] = useState<SubView>("stock");

  // ── Stock state ──────────────────────────────────────────────────────────
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
  const [distributeDestino, setDistributeDestino] = useState("salon");
  const [distributeCantidad, setDistributeCantidad] = useState(0);
  const [distributeError, setDistributeError] = useState("");

  // ── Control state ─────────────────────────────────────────────────────────
  const [controlRows, setControlRows] = useState<ControlRow[]>([]);
  const [controlLoading, setControlLoading] = useState(false);
  const [controlError, setControlError] = useState("");
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [fechaHasta, setFechaHasta] = useState("");
  const [tieneFuente, setTieneFuente] = useState("");

  // ── Carga de datos ────────────────────────────────────────────────────────
  const load = () => {
    fetch("/api/fuentes-stock")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setRows(d))
      .catch(() => {});
  };

  const loadControl = () => {
    setControlLoading(true);
    setControlError("");
    setControlRows([]);
    const params = new URLSearchParams();
    if (fechaDesde) params.set("fecha_desde", fechaDesde);
    if (fechaHasta) params.set("fecha_hasta", fechaHasta);
    if (tieneFuente) params.set("tiene_fuente", tieneFuente);
    fetch(`/api/fuentes-control?${params.toString()}`)
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

  // ── Modal agregar ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditRow(null);
    setForm(emptyForm());
    setFormError("");
    setShowModal(true);
  };

  // ── Modal editar (lápiz) ──────────────────────────────────────────────────
  const openEdit = (row: FuentaRow) => {
    setEditRow(row);
    setForm({ ...row });
    setFormError("");
    setShowModal(true);
  };

  const updateCuadrilla = (name: string, val: string) =>
    setForm((f) => ({ ...f, cuadrillas: { ...f.cuadrillas, [name]: parseInt(val) || 0 } }));

  const save = async () => {
    if (!form.fecha) { setFormError("La fecha es obligatoria."); return; }
    if (!editRow && form.ingreso <= 0) { setFormError("El ingreso debe ser mayor a 0."); return; }
    setSaving(true);
    setFormError("");
    try {
      const method = editRow ? "PUT" : "POST";
      const body = editRow ? { ...form, id: editRow.id } : form;
      const res = await fetch("/api/fuentes-stock", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al guardar.");
      load();
      setShowModal(false);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Modal distribuir ──────────────────────────────────────────────────────
  const openDistribute = (row: FuentaRow) => {
    setDistributeRow(row);
    setDistributeDestino("salon");
    setDistributeCantidad(0);
    setDistributeError("");
  };

  const distribute = async () => {
    if (!distributeRow) return;
    if (distributeCantidad <= 0) { setDistributeError("La cantidad debe ser mayor a 0."); return; }
    const disponible = calcDisponible(distributeRow);
    if (distributeCantidad > disponible) {
      setDistributeError(`Stock insuficiente. Disponible: ${disponible}`);
      return;
    }
    setSaving(true);
    setDistributeError("");
    const updated: FuentaRow = { ...distributeRow };
    if (distributeDestino === "salon") {
      updated.egreso_salon = (updated.egreso_salon ?? 0) + distributeCantidad;
    } else {
      updated.cuadrillas = {
        ...updated.cuadrillas,
        [distributeDestino]: (updated.cuadrillas[distributeDestino] ?? 0) + distributeCantidad,
      };
    }
    try {
      const res = await fetch("/api/fuentes-stock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Error al guardar.");
      load();
      setDistributeRow(null);
    } catch (e) {
      setDistributeError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Eliminar ──────────────────────────────────────────────────────────────
  const confirmDelete = async (id: string) => {
    await fetch("/api/fuentes-stock", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeleteId(null);
    load();
  };

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalIngreso = rows.reduce((s, r) => s + r.ingreso, 0);
  const totalSalon = rows.reduce((s, r) => s + r.egreso_salon, 0);
  const totalDisponible = rows.reduce((s, r) => s + calcDisponible(r), 0);
  const totalCuadrilla = (c: string) => rows.reduce((s, r) => s + (r.cuadrillas[c] ?? 0), 0);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={15} /> Volver
        </button>
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package size={20} className="text-sky-400" /> Fuentes
          </h2>
          <p className="text-slate-400 text-sm">Stock y distribución de fuentes</p>
        </div>
      </div>

      {/* Sub-navegación */}
      <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit">
        <button
          onClick={() => setSubView("stock")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            subView === "stock" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Package size={14} /> Stock
        </button>
        <button
          onClick={() => setSubView("control")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            subView === "control" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Wrench size={14} /> Control con sistema
        </button>
      </div>

      {/* ── Vista STOCK ─────────────────────────────────────────────────────── */}
      {subView === "stock" && (
        <>
          <div className="flex justify-end">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={15} /> Agregar ingreso
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-700">
            <table className="w-full text-sm border-collapse min-w-[1100px]">
              <thead>
                {/* Fila 1: grupos */}
                <tr>
                  <th colSpan={2} className="bg-amber-700/40 text-amber-300 font-semibold px-3 py-2 text-center border border-slate-700">
                    Ingreso
                  </th>
                  <th colSpan={CUADRILLAS.length + 1} className="bg-orange-700/40 text-orange-300 font-semibold px-3 py-2 text-center border border-slate-700">
                    Egreso
                  </th>
                  <th className="bg-emerald-700/40 text-emerald-300 font-semibold px-3 py-2 text-center border border-slate-700">
                    Disponible En Stock
                  </th>
                  <th className="bg-slate-700/60 text-slate-300 font-semibold px-3 py-2 text-center border border-slate-700">
                    Observación
                  </th>
                  <th className="bg-slate-700/60 px-3 py-2 border border-slate-700" />
                </tr>
                {/* Fila 2: sub-columnas */}
                <tr>
                  <th className="bg-amber-900/30 text-amber-200 text-xs px-3 py-1.5 border border-slate-700">
                    Fuentes (Suc. Valle Viejo)
                  </th>
                  <th className="bg-amber-900/30 text-amber-200 text-xs px-3 py-1.5 border border-slate-700">
                    Fecha
                  </th>
                  <th className="bg-orange-900/30 text-orange-200 text-xs px-3 py-1.5 border border-slate-700 text-center">
                    Fuentes (Salón Comercial)
                  </th>
                  <th colSpan={CUADRILLAS.length} className="bg-orange-900/20 text-orange-200 text-xs px-3 py-1.5 border border-slate-700 text-center">
                    Fuentes (Cuadrillas)
                  </th>
                  <th className="bg-emerald-900/30 border border-slate-700" />
                  <th className="bg-slate-800/60 border border-slate-700" />
                  <th className="bg-slate-800/60 border border-slate-700" />
                </tr>
                {/* Fila 3: nombres cuadrillas */}
                <tr>
                  <th className="bg-slate-800 border border-slate-700" />
                  <th className="bg-slate-800 border border-slate-700" />
                  <th className="bg-slate-800 border border-slate-700" />
                  {CUADRILLAS.map((c) => (
                    <th key={c} className="bg-slate-800 text-slate-400 text-xs px-2 py-1.5 font-normal border border-slate-700 text-center whitespace-nowrap">
                      ({c})
                    </th>
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
                      <td className="px-3 py-2 text-center text-slate-300 whitespace-nowrap">
                        {row.fecha ? new Date(row.fecha + "T00:00:00").toLocaleDateString("es-AR") : ""}
                      </td>
                      <td className="px-3 py-2 text-center text-red-400 font-medium">{row.egreso_salon || ""}</td>
                      {CUADRILLAS.map((c) => (
                        <td key={c} className="px-3 py-2 text-center text-red-400 font-medium">
                          {row.cuadrillas[c] || ""}
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-center font-bold ${disponible > 0 ? "text-emerald-400" : disponible < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {disponible}
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        {row.observacion ? (
                          <span className="inline-block bg-orange-900/40 text-orange-300 text-xs px-2 py-1 rounded-lg">
                            {row.observacion}
                          </span>
                        ) : ""}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {/* Distribuir — solo si hay stock disponible */}
                          {disponible > 0 && (
                            <button
                              onClick={() => openDistribute(row)}
                              title="Distribuir fuentes"
                              className="p-1.5 text-slate-500 hover:text-sky-400 transition-colors rounded"
                            >
                              <Share2 size={13} />
                            </button>
                          )}
                          <button onClick={() => openEdit(row)} title="Editar" className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors rounded">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setDeleteId(row.id)} title="Eliminar" className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Fila totales */}
                {rows.length > 0 && (
                  <tr className="bg-slate-800/60 font-semibold border-t-2 border-slate-600">
                    <td className="px-3 py-2 text-center text-amber-300">{totalIngreso}</td>
                    <td className="px-3 py-2 text-center text-slate-500 text-xs">Total</td>
                    <td className="px-3 py-2 text-center text-red-400">{totalSalon || ""}</td>
                    {CUADRILLAS.map((c) => (
                      <td key={c} className="px-3 py-2 text-center text-red-400">{totalCuadrilla(c) || ""}</td>
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
        </>
      )}

      {/* ── Vista CONTROL ────────────────────────────────────────────────────── */}
      {subView === "control" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Fuente 12V</label>
              <select
                value={tieneFuente}
                onChange={(e) => setTieneFuente(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Todos</option>
                <option value="SI">Con fuente</option>
                <option value="NO">Sin fuente</option>
              </select>
            </div>
            <button
              onClick={loadControl}
              disabled={controlLoading}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={controlLoading ? "animate-spin" : ""} />
              {controlLoading ? "Cargando..." : "Buscar"}
            </button>
            {!controlLoading && controlRows.length > 0 && (
              <span className="text-sm text-slate-400 ml-1">{controlRows.length} ODS encontradas</span>
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
                  <th className="px-3 py-2.5 text-left border-b border-slate-700">ODS</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-700">Conexión</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-700">Estado Servicio</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-700">Asistencia</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-700">Problema</th>
                  <th className="px-3 py-2.5 text-center border-b border-slate-700">Fuente 12V</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-700">Otros materiales</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-700">Reclamo</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-700">Solución</th>
                </tr>
              </thead>
              <tbody>
                {!controlLoading && controlRows.length === 0 && !controlError && (
                  <tr>
                    <td colSpan={10} className="text-center text-slate-500 py-12">
                      Sin resultados. Ajustá los filtros y presioná Buscar.
                    </td>
                  </tr>
                )}
                {controlRows.map((row) => (
                  <tr key={row.id_Orden_Servicio} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2 text-slate-300 font-mono">{row.id_Orden_Servicio}</td>
                    <td className="px-3 py-2 text-slate-300">{row.id_conexion}</td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{row.Estado_Servicio ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{row.asistencia ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-400 max-w-[180px] truncate" title={row.problema_descripcion ?? ""}>
                      {row.problema_descripcion ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                        row.Tiene_Fuente_12V === "SI"
                          ? "bg-emerald-900/60 text-emerald-300"
                          : "bg-red-900/60 text-red-300"
                      }`}>
                        {row.Tiene_Fuente_12V}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate" title={row.Otros_Materiales ?? ""}>
                      {row.Otros_Materiales || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                      {row.fecha_reclamo ? new Date(row.fecha_reclamo).toLocaleDateString("es-AR") : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                      {row.fecha_solucion ? new Date(row.fecha_solucion).toLocaleDateString("es-AR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal AGREGAR / EDITAR ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-slate-100 font-semibold">
                {editRow ? "Editar registro" : "Agregar ingreso de fuentes"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Fecha + ingreso — siempre visibles */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Fecha</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-amber-400 mb-1.5">Fuentes ingresadas</label>
                  <input
                    type="number"
                    min={0}
                    value={form.ingreso}
                    onChange={(e) => setForm((f) => ({ ...f, ingreso: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-amber-300 text-center focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Campos extra solo en edición */}
              {editRow && (
                <>
                  <div>
                    <label className="block text-xs text-orange-400 mb-1.5">Egreso — Salón Comercial</label>
                    <input
                      type="number"
                      min={0}
                      value={form.egreso_salon}
                      onChange={(e) => setForm((f) => ({ ...f, egreso_salon: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-red-300 text-center focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-orange-400 mb-2">Egreso — Cuadrillas</label>
                    <div className="grid grid-cols-2 gap-2">
                      {CUADRILLAS.map((c) => (
                        <div key={c} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                          <span className="text-xs text-slate-400 flex-1">{c}</span>
                          <input
                            type="number"
                            min={0}
                            value={form.cuadrillas[c] ?? 0}
                            onChange={(e) => updateCuadrilla(c, e.target.value)}
                            className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-red-300 text-center focus:outline-none focus:border-orange-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Observación</label>
                    <input
                      type="text"
                      value={form.observacion}
                      onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
                      placeholder="Ej: Fuentes De Ont Huawei"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
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
                    <span className={`text-xl font-bold ${preview > 0 ? "text-emerald-400" : preview < 0 ? "text-red-400" : "text-slate-500"}`}>
                      {preview}
                    </span>
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
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors"
              >
                <Check size={15} /> {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal DISTRIBUIR ───────────────────────────────────────────────── */}
      {distributeRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-slate-100 font-semibold flex items-center gap-2">
                  <Share2 size={16} className="text-sky-400" /> Distribuir fuentes
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ingreso del {new Date(distributeRow.fecha + "T00:00:00").toLocaleDateString("es-AR")}
                </p>
              </div>
              <button onClick={() => setDistributeRow(null)} className="text-slate-500 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Stock disponible actual */}
              <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-4 py-3">
                <span className="text-sm text-slate-400">Stock disponible</span>
                <span className="text-xl font-bold text-emerald-400">{calcDisponible(distributeRow)}</span>
              </div>

              {/* Destino */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Destino</label>
                <select
                  value={distributeDestino}
                  onChange={(e) => setDistributeDestino(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="salon">Salón Comercial</option>
                  {CUADRILLAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Cantidad a distribuir</label>
                <input
                  type="number"
                  min={0}
                  max={calcDisponible(distributeRow)}
                  value={distributeCantidad}
                  onChange={(e) => setDistributeCantidad(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-red-300 text-center text-lg font-bold focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Preview stock restante */}
              {distributeCantidad > 0 && (
                <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                  <span className="text-sm text-slate-400">Stock restante</span>
                  {(() => {
                    const restante = calcDisponible(distributeRow) - distributeCantidad;
                    return (
                      <span className={`text-xl font-bold ${restante > 0 ? "text-emerald-400" : restante === 0 ? "text-slate-500" : "text-red-400"}`}>
                        {restante}
                      </span>
                    );
                  })()}
                </div>
              )}

              {distributeError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-4 py-2 text-sm">
                  <AlertCircle size={15} /> {distributeError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-2">
              <button onClick={() => setDistributeRow(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={distribute}
                disabled={saving || distributeCantidad <= 0}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors"
              >
                <Check size={15} /> {saving ? "Guardando..." : "Distribuir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ────────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <p className="text-slate-200 text-sm">¿Eliminar este registro?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button onClick={() => confirmDelete(deleteId)} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
