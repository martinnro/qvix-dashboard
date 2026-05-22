"use client";
import { useState } from "react";
import { X, Plus, Check, AlertCircle, Upload } from "lucide-react";
import type { DataRow, Servicio } from "../lib/types";

interface Props {
  organizaciones: string[];
  servicioActivo: Servicio;
  onSaved: () => void;
  onClose: () => void;
  editRow?: DataRow; // si se pasa, modo edición
}

const ORGS_POR_SERVICIO: Record<Servicio, string[]> = {
  GOTV: ["VV", "Chumbicha", "Tinogasta", "Fiambalá", "El Rodeo", "La Puerta"],
  ViewTV: ["La Rioja"],
};

export default function DataEntryModal({ organizaciones, servicioActivo, onSaved, onClose, editRow }: Props) {
  const isEdit = !!editRow;
  const [servicio, setServicio] = useState<Servicio>(editRow?.servicio ?? servicioActivo);

  const baseOrgs = ORGS_POR_SERVICIO[servicio];
  const allOrgs = [...new Set([...baseOrgs, ...organizaciones])];

  const today = new Date().toISOString().slice(0, 10);
  const emptyRow = () => ({ organizacion: allOrgs[0] ?? "", fecha: today, stb: "", movil: "" });

  const [rows, setRows] = useState(
    editRow
      ? [{ organizacion: editRow.organizacion, fecha: editRow.fecha, stb: String(editRow.stb), movil: String(editRow.movil) }]
      : [emptyRow()]
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [customOrgs, setCustomOrgs] = useState<string[]>([]);
  const finalOrgs = [...new Set([...allOrgs, ...customOrgs])];

  const update = (i: number, field: string, value: string) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const addOrg = () => {
    const org = newOrg.trim();
    if (org && !finalOrgs.includes(org)) setCustomOrgs((prev) => [...prev, org]);
    setNewOrg("");
    setShowNewOrg(false);
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      const header = lines[0].toLowerCase().split(",");
      const idxOrg = header.indexOf("organizacion");
      const idxFecha = header.indexOf("fecha");
      const idxStb = header.indexOf("stb");
      const idxMovil = header.indexOf("movil");
      if (idxOrg < 0 || idxFecha < 0 || idxStb < 0 || idxMovil < 0) {
        setErrorMsg("El CSV debe tener columnas: organizacion, fecha, stb, movil");
        setStatus("error");
        return;
      }
      const parsed = lines.slice(1).map((l) => {
        const cols = l.split(",");
        return {
          organizacion: cols[idxOrg]?.trim() ?? "",
          fecha: cols[idxFecha]?.trim() ?? "",
          stb: cols[idxStb]?.trim() ?? "",
          movil: cols[idxMovil]?.trim() ?? "",
        };
      }).filter((r) => r.organizacion && r.fecha);
      if (parsed.length > 0) setRows(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleServicioChange = (s: Servicio) => {
    setServicio(s);
    setRows([emptyRow()]);
    setCustomOrgs([]);
  };

  const save = async () => {
    setSaving(true);
    setStatus("idle");
    try {
      for (const row of rows) {
        if (!row.organizacion || !row.fecha || row.stb === "" || row.movil === "") {
          throw new Error("Completá todos los campos antes de guardar.");
        }
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            servicio,
            organizacion: row.organizacion,
            fecha: row.fecha,
            stb: parseInt(row.stb) || 0,
            movil: parseInt(row.movil) || 0,
          }),
        });
        if (!res.ok) throw new Error("Error al guardar.");
      }
      setStatus("ok");
      setTimeout(() => { onSaved(); onClose(); }, 800);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-slate-100 font-semibold">{isEdit ? "Editar registro" : "Cargar datos"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Selector de servicio */}
          <div className="flex gap-2">
            {(["GOTV", "ViewTV"] as Servicio[]).map((s) => (
              <button
                key={s}
                onClick={() => handleServicioChange(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  servicio === s
                    ? s === "GOTV"
                      ? "bg-purple-700 border-purple-600 text-white"
                      : "bg-cyan-500 border-cyan-400 text-white"
                    : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Nueva organización */}
          <div className="flex items-center gap-2">
            {showNewOrg ? (
              <>
                <input
                  autoFocus
                  value={newOrg}
                  onChange={(e) => setNewOrg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addOrg()}
                  placeholder="Nombre de la organización"
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button onClick={addOrg} className="text-sm text-indigo-400 hover:text-indigo-300 px-3 py-2">Agregar</button>
                <button onClick={() => setShowNewOrg(false)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
              </>
            ) : (
              <button
                onClick={() => setShowNewOrg(true)}
                className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1 transition-colors"
              >
                <Plus size={13} /> Nueva organización
              </button>
            )}
          </div>

          {/* Importar CSV */}
          {!isEdit && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-400 cursor-pointer transition-colors">
                <Upload size={13} />
                Importar desde CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
              </label>
              <span className="text-xs text-slate-600">(organizacion, fecha, stb, movil)</span>
            </div>
          )}

          {/* Encabezados */}
          <div className="grid grid-cols-[1fr_130px_90px_90px_32px] gap-2 text-xs text-slate-500 px-1">
            <span>Organización</span><span>Fecha</span>
            <span className="text-center">STB</span><span className="text-center">Móvil</span><span />
          </div>

          {/* Filas */}
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_130px_90px_90px_32px] gap-2 items-center">
              <select
                value={row.organizacion}
                onChange={(e) => update(i, "organizacion", e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {finalOrgs.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <input type="date" value={row.fecha} onChange={(e) => update(i, "fecha", e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
              <input type="number" min={0} placeholder="0" value={row.stb} onChange={(e) => update(i, "stb", e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 text-center focus:outline-none focus:border-indigo-500" />
              <input type="number" min={0} placeholder="0" value={row.movil} onChange={(e) => update(i, "movil", e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 text-center focus:outline-none focus:border-indigo-500" />
              <button onClick={() => removeRow(i)} disabled={rows.length === 1}
                className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-20">
                <X size={16} />
              </button>
            </div>
          ))}

          <button onClick={addRow} className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-400 transition-colors">
            <Plus size={15} /> Agregar otra fila
          </button>

          {status === "error" && (
            <div className="flex items-center gap-2 text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-4 py-2 text-sm">
              <AlertCircle size={15} /> {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Si ya existe org + fecha, se sobreescribe.</p>
            <button
              onClick={save}
              disabled={saving || status === "ok"}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                status === "ok" ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              }`}
            >
              {status === "ok" ? <><Check size={15} /> Guardado</> : saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
