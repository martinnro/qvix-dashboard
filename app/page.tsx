"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileDown, BarChart2, PlusCircle, Sheet, ChevronDown, Tv, BarChart3, History, LogOut } from "lucide-react";
import SummaryCards from "./components/SummaryCards";
import EvolutionChart from "./components/EvolutionChart";
import TotalesChart from "./components/TotalesChart";
import DiffTable from "./components/DiffTable";
import DataTable from "./components/DataTable";
import OrgDetail from "./components/OrgDetail";
import DataEntryModal from "./components/DataEntryModal";
import DonutChart from "./components/DonutChart";
import ProjectionTable from "./components/ProjectionTable";
import GoalsPanel from "./components/GoalsPanel";
import RankingTable from "./components/RankingTable";
import HistoryPanel from "./components/HistoryPanel";
import ThemeToggle from "./components/ThemeToggle";
import LicenciasView from "./components/LicenciasView";
import SucursalesView from "./components/SucursalesView";
import Image from "next/image";
import ClientesTVDashboard from "./components/ClientesTVDashboard";
import MapaView from "./components/MapaView";
import ReclamosIncidenciasRed from "./components/ReclamosIncidenciasRed";
import ReclamosCambioDrop from "./components/ReclamosCambioDrop";
import InfraestructuraView from "./components/InfraestructuraView";
import AnalisisSenalesView from "./components/AnalisisSenalesView";
import FuentesStockView from "./components/FuentesStockView";
import DispositivosView from "./components/DispositivosView";
import InstalacionesView from "./components/InstalacionesView";
import MacScannerView from "./components/MacScannerView";
import { buildOrgStats, buildSummaries, buildTotales } from "./lib/dataUtils";
import { exportToPDF } from "./lib/exportPDF";
import { exportToExcel } from "./lib/exportExcel";
import { parseCSV } from "./lib/csvParser";
import type { DataRow, Servicio } from "./lib/types";

type Tab = "graficos" | "tabla" | "variacion" | "distribucion" | "proyeccion" | "analisis";

function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<DataRow[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get("tab") as Tab) ?? "graficos");
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<DataRow | null>(null);
  const [showServiceView, setShowServiceView] = useState(false);
  const [showLicencias, setShowLicencias] = useState(false);
  const [showSucursales, setShowSucursales] = useState(false);
  const [showTVMenu, setShowTVMenu] = useState(false);
  const [showReportesMenu, setShowReportesMenu] = useState(false);
  const [showReclamosSubmenu, setShowReclamosSubmenu] = useState(false);
  const [showStockSubmenu, setShowStockSubmenu] = useState(false);
  const [showMapa, setShowMapa] = useState(false);
  const [showReclamos, setShowReclamos] = useState(false);
  const [showCambioDrop, setShowCambioDrop] = useState(false);
  const [showInfraestructura, setShowInfraestructura] = useState(false);
  const [showFuentesStock, setShowFuentesStock] = useState(false);
  const [showDispositivos, setShowDispositivos] = useState(false);
  const [showMacScanner, setShowMacScanner] = useState(false);
  const [showAnalisisSenales, setShowAnalisisSenales] = useState(false);
  const [showInstalaciones, setShowInstalaciones]     = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionUser, setSessionUser] = useState<{
    user: string;
    nombre: string;
    sucursales: number[] | null;
    secciones: string[] | null;
  } | null>(null);

  const puedeVer = (seccion: string) =>
    !sessionUser || !sessionUser.secciones || sessionUser.secciones.includes(seccion);
  const tvRef = useRef<HTMLDivElement>(null);
  const reportesRef = useRef<HTMLDivElement>(null);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>(
    searchParams.get("orgs") ? searchParams.get("orgs")!.split(",") : []
  );
  const [servicio, setServicio] = useState<Servicio>(
    (searchParams.get("svc") as Servicio) ?? "GOTV"
  );

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d) setSessionUser(d); }).catch(() => {});
  }, []);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (servicio !== "GOTV") params.set("svc", servicio);
    if (activeTab !== "graficos") params.set("tab", activeTab);
    if (selectedOrgs.length > 0) params.set("orgs", selectedOrgs.join(","));
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/", { scroll: false });
  }, [servicio, activeTab, selectedOrgs, router]);

  const loadData = useCallback(() => {
    fetch("/api/data")
      .then((res) => res.text())
      .then((text) => {
        const data = parseCSV(text);
        if (data.length > 0) setRows(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtrar por servicio activo
  const servicioRows = rows.filter((r) => r.servicio === servicio);

  const orgStats = buildOrgStats(servicioRows);
  const summaries = buildSummaries(orgStats);
  const totales = buildTotales(servicioRows);
  const hasData = servicioRows.length > 0;
  const orgsActuales = [...new Set(servicioRows.map((r) => r.organizacion))];

  // Filtrar por orgs seleccionadas
  const hasOrgFilter = selectedOrgs.length > 0;
  const filteredRows = hasOrgFilter ? servicioRows.filter((r) => selectedOrgs.includes(r.organizacion)) : servicioRows;
  const filteredOrgStats = hasOrgFilter ? orgStats.filter((o) => selectedOrgs.includes(o.organizacion)) : orgStats;
  const filteredSummaries = hasOrgFilter ? summaries.filter((s) => selectedOrgs.includes(s.organizacion)) : summaries;
  const filteredTotales = buildTotales(filteredRows);
  // Vista detalle solo si hay exactamente 1 org seleccionada
  const singleOrg = selectedOrgs.length === 1 ? selectedOrgs[0] : null;
  const selectedOrgStat = singleOrg ? orgStats.find((o) => o.organizacion === singleOrg) : null;
  const selectedOrgIndex = singleOrg ? orgStats.findIndex((o) => o.organizacion === singleOrg) : -1;

  // ── Vista activa (mutuamente exclusivas) ───────────────────────────────────
  const goHome = () => { setShowServiceView(false); setShowLicencias(false); setShowSucursales(false); setShowMapa(false); setShowReclamos(false); setShowCambioDrop(false); setShowInfraestructura(false); setShowFuentesStock(false); setShowDispositivos(false); setShowMacScanner(false); setShowAnalisisSenales(false); setShowInstalaciones(false); };
  const goTo = (view: "licencias" | "sucursales") => {
    goHome();
    setShowLicencias(view === "licencias");
    setShowSucursales(view === "sucursales");
    setShowTVMenu(false);
  };

  // Cerrar dropdowns al hacer click afuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tvRef.current && !tvRef.current.contains(e.target as Node)) setShowTVMenu(false);
      if (reportesRef.current && !reportesRef.current.contains(e.target as Node)) { setShowReportesMenu(false); setShowReclamosSubmenu(false); setShowStockSubmenu(false); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleOrg = (org: string) => {
    setSelectedOrgs((prev) =>
      prev.includes(org) ? prev.filter((o) => o !== org) : [...prev, org]
    );
  };

  // Totales por servicio (último período de cada uno) para el universo combinado
  const getLastPeriodTotals = (svc: Servicio) => {
    const svcRows = rows.filter((r) => r.servicio === svc);
    if (svcRows.length === 0) return { stb: 0, movil: 0 };
    const lastFecha = [...new Set(svcRows.map((r) => r.fecha))].sort().at(-1)!;
    const filtered = svcRows.filter((r) => r.fecha === lastFecha);
    return {
      stb: filtered.reduce((s, r) => s + r.stb, 0),
      movil: filtered.reduce((s, r) => s + r.movil, 0),
    };
  };
  const gotvLast = getLastPeriodTotals("GOTV");
  const viewtvLast = getLastPeriodTotals("ViewTV");
  const stbUniverso = gotvLast.stb + viewtvLast.stb;
  const movilUniverso = gotvLast.movil + viewtvLast.movil;
  const universoTotal = stbUniverso + movilUniverso;
  const gotvStbPct = stbUniverso > 0 ? Math.round((gotvLast.stb / stbUniverso) * 100) : null;
  const viewtvStbPct = stbUniverso > 0 ? Math.round((viewtvLast.stb / stbUniverso) * 100) : null;
  const gotvMovilPct = movilUniverso > 0 ? Math.round((gotvLast.movil / movilUniverso) * 100) : null;
  const viewtvMovilPct = movilUniverso > 0 ? Math.round((viewtvLast.movil / movilUniverso) * 100) : null;

  const handleDelete = async (row: DataRow) => {
    if (!confirm(`¿Eliminar ${row.organizacion} / ${row.fecha}?`)) return;
    await fetch("/api/data", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servicio: row.servicio, organizacion: row.organizacion, fecha: row.fecha }),
    });
    loadData();
  };

  const handleServicioChange = (s: Servicio) => {
    setServicio(s);
    setSelectedOrgs([]);
  };

  const menuItem = "flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors rounded-lg";

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4">

          {/* Logo */}
          <div className="flex items-center cursor-pointer" onClick={goHome}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ultranet.png" alt="Ultranet Analytics" style={{ width: 160 }} className="opacity-90 object-contain" />
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1">

            {/* TV dropdown */}
            {puedeVer("tv") && <div ref={tvRef} className="relative">
              <button
                onClick={() => { setShowTVMenu(v => !v); setShowReportesMenu(false); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  showTVMenu || showLicencias || showSucursales || showServiceView
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Tv size={15} /> TV
                <ChevronDown size={13} className={`transition-transform ${showTVMenu ? "rotate-180" : ""}`} />
              </button>

              {showTVMenu && (
                <div className="absolute left-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5">
                  <p className="px-3 py-1.5 text-xs text-slate-500 uppercase tracking-wider">Servicio</p>
                  {(["GOTV", "ViewTV"] as Servicio[]).map(s => (
                    <button key={s} onClick={() => { goHome(); handleServicioChange(s); setShowServiceView(true); setShowTVMenu(false); }}
                      className={`${menuItem} ${servicio === s ? (s === "GOTV" ? "text-purple-400 bg-purple-900/20" : "text-cyan-400 bg-cyan-900/20") : ""}`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s === "GOTV" ? "bg-purple-500" : "bg-cyan-400"}`} />
                      {s}
                      {servicio === s && <span className="ml-auto text-xs opacity-50">activo</span>}
                    </button>
                  ))}

                  <div className="border-t border-slate-800 my-1" />
                  <p className="px-3 py-1.5 text-xs text-slate-500 uppercase tracking-wider">Vistas</p>
                  <button onClick={() => goTo("licencias")} className={menuItem}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-indigo-500" /> Licencias
                  </button>
                  <button onClick={() => goTo("sucursales")} className={menuItem}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-sky-400" /> Monitoreo
                  </button>
                  <button onClick={() => { goHome(); setShowInfraestructura(true); setShowTVMenu(false); }} className={menuItem}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400" /> Infraestructura
                  </button>
                  <button onClick={() => { goHome(); setShowAnalisisSenales(true); setShowTVMenu(false); }} className={menuItem}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-400" /> Análisis de señales
                  </button>

                  <div className="border-t border-slate-800 my-1" />
                  <p className="px-3 py-1.5 text-xs text-slate-500 uppercase tracking-wider">Acciones</p>
                  <button onClick={() => { setShowHistory(true); setShowTVMenu(false); }} className={menuItem}>
                    <History size={14} className="text-slate-400 flex-shrink-0" /> Historial de cambios
                  </button>
                  {hasData && <>
                    <button onClick={() => { exportToExcel(filteredRows, filteredOrgStats, servicio); setShowTVMenu(false); }} className={menuItem}>
                      <Sheet size={14} className="text-teal-400 flex-shrink-0" /> Exportar Excel
                    </button>
                    <button onClick={() => { exportToPDF(filteredRows, filteredOrgStats, servicio); setShowTVMenu(false); }} className={menuItem}>
                      <FileDown size={14} className="text-emerald-400 flex-shrink-0" /> Exportar PDF
                    </button>
                  </>}
                </div>
              )}
            </div>}

            {/* Reportes dropdown */}
            {(puedeVer("mapa") || puedeVer("fuentes") || puedeVer("dispositivos")) && <div ref={reportesRef} className="relative">
              <button
                onClick={() => { setShowReportesMenu(v => !v); setShowTVMenu(false); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  showReportesMenu ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <BarChart3 size={15} /> Reportes
                <ChevronDown size={13} className={`transition-transform ${showReportesMenu ? "rotate-180" : ""}`} />
              </button>
              {showReportesMenu && (
                <div className="absolute left-0 top-full mt-2 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5">
                  {puedeVer("mapa") && <>
                    {/* Reclamos — va directo al dashboard; chevron expande sub-ítem */}
                    <div className="flex items-center rounded-lg overflow-hidden">
                      <button
                        onClick={() => { goHome(); setShowReclamos(true); setShowReportesMenu(false); setShowReclamosSubmenu(false); }}
                        className="flex items-center gap-2.5 flex-1 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-rose-500" />
                        Reclamos
                      </button>
                      <button
                        onClick={() => setShowReclamosSubmenu((v) => !v)}
                        className="px-2.5 py-2 text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
                        title="Sub-ítems"
                      >
                        <ChevronDown size={13} className={`transition-transform ${showReclamosSubmenu ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                    {showReclamosSubmenu && (
                      <button
                        onClick={() => { goHome(); setShowCambioDrop(true); setShowReportesMenu(false); setShowReclamosSubmenu(false); }}
                        className={`${menuItem} pl-9 text-xs`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-rose-400" />
                        Cambio de Drop
                      </button>
                    )}

                    <button onClick={() => { goHome(); setShowInstalaciones(true); setShowReportesMenu(false); }} className={menuItem}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400" />
                      Instalaciones
                    </button>
                    <button onClick={() => { goHome(); setShowMapa(true); setShowReportesMenu(false); }} className={menuItem}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500" />
                      Mapa
                    </button>
                  </>}

                  {(puedeVer("fuentes") || puedeVer("dispositivos")) && <>
                    <div className="border-t border-slate-800 my-1" />
                    <div className="flex items-center rounded-lg overflow-hidden">
                      <button
                        onClick={() => setShowStockSubmenu(v => !v)}
                        className="flex items-center gap-2.5 flex-1 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-sky-400" />
                        Stock
                      </button>
                      <button
                        onClick={() => setShowStockSubmenu(v => !v)}
                        className="px-2 py-2 text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
                      >
                        <ChevronDown size={12} className={`transition-transform ${showStockSubmenu ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                    {showStockSubmenu && <>
                      {puedeVer("fuentes") && (
                        <button
                          onClick={() => { goHome(); setShowFuentesStock(true); setShowReportesMenu(false); }}
                          className={`${menuItem} pl-9 text-xs`}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-sky-400" />
                          Fuentes
                        </button>
                      )}
                      {puedeVer("dispositivos") && (
                        <button
                          onClick={() => { goHome(); setShowDispositivos(true); setShowReportesMenu(false); }}
                          className={`${menuItem} pl-9 text-xs`}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-violet-400" />
                          Dispositivos
                        </button>
                      )}
                      {puedeVer("dispositivos") && (
                        <button
                          onClick={() => { goHome(); setShowMacScanner(true); setShowReportesMenu(false); }}
                          className={`${menuItem} pl-9 text-xs`}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-cyan-400" />
                          Rastreo de dispositivo
                        </button>
                      )}
                    </>}
                  </>}
                </div>
              )}
            </div>}
          </nav>

          {/* Derecha */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {showServiceView && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                <PlusCircle size={15} /> <span className="hidden sm:inline">Cargar datos</span>
              </button>
            )}
            {sessionUser && (
              <span className="text-sm text-slate-400 hidden sm:block">
                Usuario: <span className="text-white font-medium">{sessionUser.user}</span>
              </span>
            )}
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Historial flotante */}
      <HistoryPanel open={showHistory} onClose={() => setShowHistory(false)} onRestored={loadData} />

      {showLicencias && (
        <LicenciasView
          gotvStb={gotvLast.stb}
          gotvMovil={gotvLast.movil}
          viewtvStb={viewtvLast.stb}
          viewtvMovil={viewtvLast.movil}
          rows={rows}
          onClose={goHome}
        />
      )}
      {showSucursales && (
        <SucursalesView
          gotvOrgs={[...new Set(rows.filter(r => r.servicio === "GOTV").map(r => r.organizacion))].sort()}
          onClose={goHome}
        />
      )}

      {showMapa && <MapaView onClose={goHome} sucursalesPermitidas={sessionUser?.sucursales ?? null} />}
      {showReclamos && <ReclamosIncidenciasRed onBack={goHome} onClose={goHome} />}
      {showCambioDrop && <ReclamosCambioDrop onBack={() => { setShowCambioDrop(false); setShowReclamos(true); }} onClose={goHome} />}
      {showInfraestructura && <InfraestructuraView onClose={goHome} />}
      {showFuentesStock && <FuentesStockView onClose={goHome} />}
      {showDispositivos && <DispositivosView onClose={goHome} sucursalesPermitidas={sessionUser?.sucursales ?? null} />}
      {showMacScanner && <MacScannerView onClose={goHome} />}
      {showAnalisisSenales && <AnalisisSenalesView onClose={goHome} />}
      {showInstalaciones && <InstalacionesView onClose={goHome} sucursalesPermitidas={sessionUser?.sucursales ?? null} />}

      <main className={`max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 ${showLicencias || showSucursales || showMapa || showReclamos || showCambioDrop || showInfraestructura || showFuentesStock || showDispositivos || showMacScanner || showAnalisisSenales || showInstalaciones ? "hidden" : ""}`}>

        {/* ── Dashboard principal — solo en home ── */}
        {!showServiceView && sessionUser !== null && puedeVer("tv") && (
          <ClientesTVDashboard sucursalesPermitidas={sessionUser.sucursales} />
        )}

        {showServiceView && hasData && (
          <>
            {/* Filtro de organizaciones */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-slate-400 font-medium text-xs uppercase tracking-wider">Organización</h2>
                {selectedOrgs.length > 0 && (
                  <button
                    onClick={() => setSelectedOrgs([])}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Limpiar selección
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {orgsActuales.length > 1 && (
                  <button
                    onClick={() => setSelectedOrgs([])}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      selectedOrgs.length === 0
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Todas
                  </button>
                )}
                {orgsActuales.map((org) => (
                  <button
                    key={org}
                    onClick={() => toggleOrg(org)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      selectedOrgs.includes(org)
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {org}
                  </button>
                ))}
              </div>
              {selectedOrgs.length > 1 && (
                <p className="text-xs text-slate-500 mt-2">{selectedOrgs.length} organizaciones seleccionadas — vista comparativa</p>
              )}
            </section>

            {/* Vista detalle de una organización (solo 1 seleccionada) */}
            {singleOrg && selectedOrgStat ? (
              <OrgDetail org={selectedOrgStat} index={selectedOrgIndex} />
            ) : (
              <>
                {/* Summary cards */}
                <section>
                  <h2 className="text-slate-300 font-medium text-sm uppercase tracking-wider mb-3">
                    Resumen — último período
                  </h2>
                  <SummaryCards summaries={filteredSummaries} />
                </section>

                {/* Totales globales */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Total STB", value: filteredTotales[filteredTotales.length - 1]?.stb ?? 0, color: "text-indigo-400" },
                    { label: "Total Móvil", value: filteredTotales[filteredTotales.length - 1]?.movil ?? 0, color: "text-emerald-400" },
                    { label: "Total Usuarios", value: (filteredTotales[filteredTotales.length - 1]?.stb ?? 0) + (filteredTotales[filteredTotales.length - 1]?.movil ?? 0), color: "text-amber-400" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-center">
                      <div className="text-slate-400 text-sm mb-1">{stat.label}</div>
                      <div className={`text-3xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* Tabs */}
                <section>
                  <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit mb-5">
                    {([
                      { key: "graficos", label: "Gráficos" },
                      { key: "tabla", label: "Tabla de datos" },
                      { key: "variacion", label: "Variación %" },
                      { key: "distribucion", label: "Distribución" },
                      { key: "proyeccion", label: "Proyección" },
                      { key: "analisis", label: "Análisis" },
                    ] as { key: Tab; label: string }[]).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          activeTab === tab.key
                            ? "bg-indigo-600 text-white"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {activeTab === "graficos" && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <EvolutionChart rows={filteredRows} tipo="stb" title="Evolución STB (decos) por organización" />
                        <EvolutionChart rows={filteredRows} tipo="movil" title="Evolución Móvil (app) por organización" />
                      </div>
                      <TotalesChart totales={filteredTotales} />
                    </div>
                  )}
                  {activeTab === "tabla" && (
                    <DataTable
                      rows={filteredRows}
                      onEdit={(row) => setEditRow(row)}
                      onDelete={handleDelete}
                    />
                  )}
                  {activeTab === "variacion" && <DiffTable orgStats={filteredOrgStats} />}
                  {activeTab === "proyeccion" && <ProjectionTable orgStats={filteredOrgStats} />}
                  {activeTab === "analisis" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <RankingTable orgStats={filteredOrgStats} />
                      <GoalsPanel orgStats={filteredOrgStats} servicio={servicio} />
                    </div>
                  )}
                  {activeTab === "distribucion" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <DonutChart rows={filteredRows} tipo="stb" title="Distribución STB por organización" />
                      <DonutChart rows={filteredRows} tipo="movil" title="Distribución Móvil por organización" />
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {showServiceView && !hasData && (
          <div className="text-center py-24 text-slate-600">
            <BarChart2 size={52} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg">Sin datos para {servicio}</p>
            <p className="text-sm mt-1">
              Usá el botón <span className="text-indigo-400 font-medium">Cargar datos</span> para agregar información
            </p>
          </div>
        )}
      </main>

      {showModal && (
        <DataEntryModal
          organizaciones={orgsActuales}
          servicioActivo={servicio}
          onSaved={loadData}
          onClose={() => setShowModal(false)}
        />
      )}
      {editRow && (
        <DataEntryModal
          organizaciones={orgsActuales}
          servicioActivo={editRow.servicio}
          onSaved={loadData}
          onClose={() => setEditRow(null)}
          editRow={editRow}
        />
      )}
    </div>
  );
}

// Wrapper con Suspense requerido por useSearchParams en Next.js App Router
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
