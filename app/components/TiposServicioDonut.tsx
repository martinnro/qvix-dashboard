"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  tipos: {
    iptv: number;
    iptv_app: number;
    iptv_ott: number;
    iptv_ott_app: number;
    ott: number;
    ott_app: number;
  };
}

const ITEMS = [
  { key: "iptv",         label: "IPTV",             color: "#8b5cf6" },
  { key: "iptv_app",     label: "IPTV + APP",        color: "#a855f7" },
  { key: "iptv_ott",     label: "IPTV + OTT",        color: "#6366f1" },
  { key: "iptv_ott_app", label: "IPTV + OTT + APP",  color: "#3b82f6" },
  { key: "ott",          label: "OTT",               color: "#06b6d4" },
  { key: "ott_app",      label: "OTT + APP",          color: "#14b8a6" },
] as const;

function fmt(n: number) {
  return n.toLocaleString("es-AR");
}

export default function TiposServicioDonut({ tipos }: Props) {
  const data = ITEMS.map((item) => ({
    ...item,
    value: tipos[item.key],
  })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
      <h3 className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-4">
        Desglose por combinación de servicios
      </h3>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        {/* Donut */}
        <div className="flex-shrink-0 w-40 h-40 sm:w-48 sm:h-48 mx-auto sm:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                nameKey="label"
                startAngle={90}
                endAngle={-270}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value: any, name: any) => [
                  `${fmt(Number(value))} (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Leyenda con valores */}
        <div className="flex-1 space-y-2.5">
          {data.map((item) => {
            const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
            return (
              <div key={item.key} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-slate-400 text-sm flex-1">{item.label}</span>
                <span className="text-white font-semibold text-sm">{fmt(item.value)}</span>
                <span className="text-slate-500 text-xs w-10 text-right">{pct}%</span>
              </div>
            );
          })}
          <div className="border-t border-slate-700 pt-2 flex items-center gap-3">
            <div className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="text-slate-400 text-sm flex-1 font-medium">Total</span>
            <span className="text-white font-bold text-sm">{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
