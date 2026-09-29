"use client";
import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { DataRow } from "../lib/types";

interface Props {
  rows: DataRow[];
  desde: string;
  hasta: string;
}

function Badge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-slate-600 font-mono text-sm">—</span>;
  const color = v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-500";
  const Icon = v > 0 ? TrendingUp : v < 0 ? TrendingDown : Minus;
  return (
    <span className={`flex items-center justify-center gap-1 font-mono text-sm ${color}`}>
      <Icon size={13} />
      {v > 0 ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
}

export default function RankingTable({ rows, desde, hasta }: Props) {
  const ranked = useMemo(() => {
    if (!desde || !hasta || desde >= hasta) return [];
    const orgs = [...new Set(rows.map((r) => r.organizacion))];

    return orgs.map((org) => {
      const orgRows = rows.filter((r) => r.organizacion === org).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const rowDesde = orgRows.filter((r) => r.fecha <= desde).at(-1) ?? orgRows[0];
      const rowHasta = orgRows.filter((r) => r.fecha <= hasta).at(-1) ?? orgRows.at(-1);
      if (!rowDesde || !rowHasta) return null;

      const stbPct = rowDesde.stb > 0 ? parseFloat((((rowHasta.stb - rowDesde.stb) / rowDesde.stb) * 100).toFixed(1)) : null;
      const movilPct = rowDesde.movil > 0 ? parseFloat((((rowHasta.movil - rowDesde.movil) / rowDesde.movil) * 100).toFixed(1)) : null;

      return { org, stbPct, movilPct, stbHasta: rowHasta.stb, movilHasta: rowHasta.movil };
    })
      .filter(Boolean)
      .sort((a, b) => (b!.stbPct ?? -999) - (a!.stbPct ?? -999)) as {
        org: string; stbPct: number | null; movilPct: number | null;
        stbHasta: number; movilHasta: number;
      }[];
  }, [rows, desde, hasta]);

  if (ranked.length === 0) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 overflow-x-auto">
      <h3 className="text-slate-200 font-semibold mb-1">Ranking por crecimiento</h3>
      <p className="text-xs text-slate-500 mb-4">
        Ordenado por variación STB% del período seleccionado · {desde} → {hasta}
      </p>
      <table className="w-full text-sm text-slate-300">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="px-3 py-2 text-left text-slate-400 w-8">#</th>
            <th className="px-3 py-2 text-left text-slate-400">Organización</th>
            <th className="px-3 py-2 text-center text-slate-400">STB %</th>
            <th className="px-3 py-2 text-center text-slate-400">Móvil %</th>
            <th className="px-3 py-2 text-center text-slate-400">STB actual</th>
            <th className="px-3 py-2 text-center text-slate-400">Móvil actual</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.org} className="border-b border-slate-700/50 hover:bg-slate-700/30">
              <td className="px-3 py-2 text-slate-500 font-mono text-xs">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-slate-200">{r.org}</td>
              <td className="px-3 py-2 text-center"><Badge v={r.stbPct} /></td>
              <td className="px-3 py-2 text-center"><Badge v={r.movilPct} /></td>
              <td className="px-3 py-2 text-center font-mono text-slate-300">{r.stbHasta.toLocaleString()}</td>
              <td className="px-3 py-2 text-center font-mono text-slate-300">{r.movilHasta.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
