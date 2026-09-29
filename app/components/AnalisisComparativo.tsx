"use client";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { DataRow } from "../lib/types";

interface Props {
  rows: DataRow[];
}

interface OrgResult {
  org: string;
  stbDesde: number;
  stbHasta: number;
  movilDesde: number;
  movilHasta: number;
  totalDesde: number;
  totalHasta: number;
  deltaTotal: number;
  pctTotal: number | null;
}

function fmt(n: number, sign = true) {
  return `${sign && n > 0 ? "+" : ""}${n.toLocaleString()}`;
}
function fmtPct(n: number | null) {
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function HighlightCard({
  titulo,
  subtitulo,
  org,
  valor,
  positivo,
}: {
  titulo: string;
  subtitulo: string;
  org: string | null;
  valor: string;
  positivo: boolean;
}) {
  const color = positivo ? "emerald" : "red";
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl p-5`}>
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{titulo}</p>
      <p className="text-slate-400 text-xs mb-3">{subtitulo}</p>
      {org ? (
        <>
          <p className="text-slate-100 font-bold text-base truncate">{org}</p>
          <p className={`text-${color}-400 font-mono font-semibold text-lg mt-1`}>{valor}</p>
        </>
      ) : (
        <p className="text-slate-600 text-sm italic">Sin datos</p>
      )}
    </div>
  );
}

export default function AnalisisComparativo({ rows }: Props) {
  const fechas = useMemo(
    () => [...new Set(rows.map((r) => r.fecha))].sort(),
    [rows]
  );

  const [desde, setDesde] = useState<string>(() => fechas[0] ?? "");
  const [hasta, setHasta] = useState<string>(() => fechas.at(-1) ?? "");

  // Sincronizar cuando cambian las fechas disponibles (cambio de servicio)
  useMemo(() => {
    if (fechas.length > 0) {
      setDesde(fechas[0]);
      setHasta(fechas.at(-1)!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechas[0], fechas.at(-1)]);

  const resultados = useMemo<OrgResult[]>(() => {
    if (!desde || !hasta || desde >= hasta) return [];

    const orgs = [...new Set(rows.map((r) => r.organizacion))];
    return orgs.map((org) => {
      const orgRows = rows.filter((r) => r.organizacion === org).sort((a, b) => a.fecha.localeCompare(b.fecha));

      const rowDesde = orgRows.filter((r) => r.fecha <= desde).at(-1) ?? orgRows[0];
      const rowHasta = orgRows.filter((r) => r.fecha <= hasta).at(-1) ?? orgRows.at(-1);

      if (!rowDesde || !rowHasta) return null;

      const totalDesde = rowDesde.stb + rowDesde.movil;
      const totalHasta = rowHasta.stb + rowHasta.movil;
      const deltaTotal = totalHasta - totalDesde;
      const pctTotal = totalDesde > 0 ? parseFloat(((deltaTotal / totalDesde) * 100).toFixed(1)) : null;

      return {
        org,
        stbDesde: rowDesde.stb,
        stbHasta: rowHasta.stb,
        movilDesde: rowDesde.movil,
        movilHasta: rowHasta.movil,
        totalDesde,
        totalHasta,
        deltaTotal,
        pctTotal,
      };
    }).filter(Boolean) as OrgResult[];
  }, [rows, desde, hasta]);

  const sorted = useMemo(
    () => [...resultados].sort((a, b) => b.deltaTotal - a.deltaTotal),
    [resultados]
  );

  const mejorPct    = resultados.filter(r => r.pctTotal !== null).sort((a, b) => (b.pctTotal ?? 0) - (a.pctTotal ?? 0))[0] ?? null;
  const mejorCant   = sorted[0] ?? null;
  const peorPct     = resultados.filter(r => r.pctTotal !== null).sort((a, b) => (a.pctTotal ?? 0) - (b.pctTotal ?? 0))[0] ?? null;
  const peorCant    = sorted.at(-1) ?? null;

  const invalido = !desde || !hasta || desde >= hasta;

  return (
    <div className="space-y-5">
      {/* Selector de período */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 className="text-slate-200 font-semibold mb-1">Análisis comparativo</h3>
        <p className="text-xs text-slate-500 mb-4">Seleccioná el período para comparar el crecimiento de cada sub-organización</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">Desde</label>
            <select
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              {fechas.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">Hasta</label>
            <select
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              {fechas.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          {invalido && (
            <p className="text-xs text-amber-400">La fecha Hasta debe ser posterior a Desde</p>
          )}
        </div>
      </div>

      {!invalido && resultados.length > 0 && (
        <>
          {/* Tarjetas de destacados */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <HighlightCard
              titulo="Mayor crecimiento %"
              subtitulo="Mejor variación porcentual del período"
              org={mejorPct?.org ?? null}
              valor={fmtPct(mejorPct?.pctTotal ?? null)}
              positivo
            />
            <HighlightCard
              titulo="Mayor crecimiento en cantidad"
              subtitulo="Más usuarios ganados en el período"
              org={mejorCant?.org ?? null}
              valor={fmt(mejorCant?.deltaTotal ?? 0)}
              positivo
            />
            <HighlightCard
              titulo="Mayor caída %"
              subtitulo="Peor variación porcentual del período"
              org={peorPct?.org ?? null}
              valor={fmtPct(peorPct?.pctTotal ?? null)}
              positivo={false}
            />
            <HighlightCard
              titulo="Mayor caída en cantidad"
              subtitulo="Más usuarios perdidos en el período"
              org={peorCant?.org ?? null}
              valor={fmt(peorCant?.deltaTotal ?? 0)}
              positivo={false}
            />
          </div>

          {/* Tabla completa */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Sub-organización</th>
                  <th className="px-4 py-3 text-right">Total {desde}</th>
                  <th className="px-4 py-3 text-right">Total {hasta}</th>
                  <th className="px-4 py-3 text-right">Δ Cantidad</th>
                  <th className="px-4 py-3 text-right">Δ %</th>
                  <th className="px-4 py-3 text-right">STB Δ</th>
                  <th className="px-4 py-3 text-right">Móvil Δ</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const pos = r.deltaTotal > 0;
                  const neg = r.deltaTotal < 0;
                  const color = pos ? "text-emerald-400" : neg ? "text-red-400" : "text-slate-500";
                  const Icon = pos ? TrendingUp : neg ? TrendingDown : Minus;
                  return (
                    <tr key={r.org} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="px-4 py-2.5 font-medium text-slate-200">{r.org}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-400">{r.totalDesde.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-200">{r.totalHasta.toLocaleString()}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${color}`}>
                        <span className="flex items-center justify-end gap-1">
                          <Icon size={13} />{fmt(r.deltaTotal)}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${color}`}>{fmtPct(r.pctTotal)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs ${r.stbHasta - r.stbDesde > 0 ? "text-emerald-400" : r.stbHasta - r.stbDesde < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {fmt(r.stbHasta - r.stbDesde)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs ${r.movilHasta - r.movilDesde > 0 ? "text-emerald-400" : r.movilHasta - r.movilDesde < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {fmt(r.movilHasta - r.movilDesde)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
