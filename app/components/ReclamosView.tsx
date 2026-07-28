"use client";
import { useState } from "react";
import { AlertTriangle, X, Wrench, ChevronRight, Radio } from "lucide-react";
import ReclamosCambioDrop from "./ReclamosCambioDrop";
import ReclamosIncidenciasRed from "./ReclamosIncidenciasRed";

type SubView = "cambio-drop" | "incidencias-red";

interface SubItem {
  id: SubView;
  titulo: string;
  descripcion: string;
  icon: React.ElementType;
  color: string;
  badge?: string;
}

const SUB_ITEMS: SubItem[] = [
  {
    id: "incidencias-red",
    titulo: "Incidencias en Curso",
    descripcion: "Reclamos activos por problema de red — pendientes y asignados por cuadrilla y NAP",
    icon: Radio,
    color: "#f43f5e",
  },
  {
    id: "cambio-drop",
    titulo: "Cambio de Drop",
    descripcion: "Reclamos por asistencia técnica con cambio de cable drop",
    icon: Wrench,
    color: "#f97316",
  },
];

export default function ReclamosView({ onClose }: { onClose: () => void }) {
  const [subView, setSubView] = useState<SubView | null>(null);

  if (subView === "incidencias-red") {
    return <ReclamosIncidenciasRed onBack={() => setSubView(null)} onClose={onClose} />;
  }
  if (subView === "cambio-drop") {
    return <ReclamosCambioDrop onBack={() => setSubView(null)} onClose={onClose} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <AlertTriangle size={20} className="text-rose-400" /> Reclamos
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Seleccioná un tipo de reclamo para ver su análisis
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <X size={15} /> Cerrar
          </button>
        </div>

        {/* Grid de sub-ítems */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SUB_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setSubView(item.id)}
                className="group flex items-start gap-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-2xl p-5 text-left transition-all hover:bg-slate-800/80"
              >
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: item.color + "22" }}
                >
                  <Icon size={20} style={{ color: item.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-slate-100 font-semibold text-sm">{item.titulo}</h3>
                    {item.badge && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.descripcion}</p>
                </div>
                <ChevronRight
                  size={16}
                  className="flex-shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors mt-0.5"
                />
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
