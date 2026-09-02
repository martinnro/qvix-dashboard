"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getColorById, getNapColor, type MapStyle, type NapItem } from "./MapaUtils";

export interface PinCustom {
  id: string;
  titulo: string;
  cx?: string;
  abonado?: string;
  barrio?: string;
  lat: number;
  lng: number;
  color: string;
  sucursal: number;
  url_origen?: string;
}

function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeNapIcon(cantidad: number) {
  const color = getNapColor(cantidad);
  return L.divIcon({
    className: "",
    html: `<div style="
      width:30px; height:30px;
      background:#1e293b;
      border:2.5px solid ${color};
      border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 2px 8px rgba(0,0,0,0.8);
      font-size:11px; font-weight:700; color:${color};
      font-family:sans-serif;
    ">${cantidad > 0 ? cantidad : "·"}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

function makePinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:32px; height:32px;
      background:${color};
      border:2.5px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 3px 8px rgba(0,0,0,0.6);
    "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  });
}

export const MAP_STYLES: { key: MapStyle; label: string; url: string; attribution: string }[] = [
  {
    key: "dark",
    label: "Oscuro",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    key: "satellite",
    label: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
  {
    key: "satellite-labels",
    label: "Satélite + calles",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
  {
    key: "street",
    label: "Calles",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    key: "light",
    label: "Claro",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
];

interface Punto {
  id_conexion: number;
  Estado_Servicio: number;
  estado_nombre: string;
  latitud: number;
  longitud: number;
  nap: string | null;
  fecha_baja: string | null;
}

function FitBounds({ puntos }: { puntos: Punto[] }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length === 0) return;
    const lats = puntos.map((p) => p.latitud);
    const lngs = puntos.map((p) => p.longitud);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ], { padding: [40, 40] });
  }, [puntos, map]);
  return null;
}

interface CtxMenuState { x: number; y: number; lat: number; lng: number }

// Captura el click derecho sobre el mapa y avisa al padre dónde mostrar el menú contextual
function ContextMenuCapture({ onOpen, onClose }: { onOpen: (s: CtxMenuState) => void; onClose: () => void }) {
  useMapEvents({
    contextmenu(e) {
      e.originalEvent.preventDefault();
      onOpen({
        x: e.containerPoint.x,
        y: e.containerPoint.y,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    },
    click: onClose,
    movestart: onClose,
    zoomstart: onClose,
  });
  return null;
}

interface Props {
  puntos: Punto[];
  mapStyle: MapStyle;
  naps?: NapItem[];
  showNaps?: boolean;
  pinesCustom?: PinCustom[];
  showPinesCustom?: boolean;
  onNapSelect?: (nap: string | null) => void;
}

export default function MapaLeaflet({
  puntos,
  mapStyle,
  naps = [],
  showNaps = false,
  pinesCustom = [],
  showPinesCustom = false,
  onNapSelect,
}: Props) {
  const centro: [number, number] = puntos.length > 0
    ? [puntos[0].latitud, puntos[0].longitud]
    : [-28.5, -65.8];

  const style = MAP_STYLES.find((s) => s.key === mapStyle) ?? MAP_STYLES[0];
  const labelsUrl = "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";

  // NAP seleccionado — dibuja líneas a todas sus conexiones
  const [napSel, setNapSel] = useState<string | null>(null);

  // Menú contextual (click derecho) — copiar coordenadas
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [copiado, setCopiado] = useState(false);

  const copiarCoordenadas = async () => {
    if (!ctxMenu) return;
    const texto = `${ctxMenu.lat.toFixed(6)}, ${ctxMenu.lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Fallback por si el navegador bloquea el acceso al portapapeles
      const el = document.createElement("textarea");
      el.value = texto;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiado(true);
    setTimeout(() => { setCtxMenu(null); setCopiado(false); }, 700);
  };

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer
        center={centro}
        zoom={13}
        style={{ height: "100%", width: "100%", borderRadius: "0 0 1rem 1rem" }}
        className="z-0"
      >
        <TileLayer url={style.url} attribution={style.attribution} maxNativeZoom={17} maxZoom={22} />
        {mapStyle === "satellite-labels" && (
          <TileLayer url={labelsUrl} attribution="" maxNativeZoom={19} maxZoom={22} />
        )}
        <FitBounds puntos={puntos} />
        <ContextMenuCapture onOpen={setCtxMenu} onClose={() => setCtxMenu(null)} />

        {/* Líneas NAP → todas sus conexiones */}
        {napSel && (() => {
          const nap = naps.find((n) => n.nap === napSel);
          if (!nap) return null;
          return puntos
            .filter((p) => p.nap === napSel)
            .map((p) => {
              const metros = Math.round(distanciaM(nap.latitud, nap.longitud, p.latitud, p.longitud));
              return (
                <Polyline
                  key={p.id_conexion}
                  positions={[[nap.latitud, nap.longitud], [p.latitud, p.longitud]]}
                  pathOptions={{ color: "#000000", weight: 1.5, dashArray: "5 4", opacity: 0.8 }}
                >
                  <Popup>
                    <div className="text-sm space-y-0.5">
                      <p><strong>NAP:</strong> {nap.nap}</p>
                      <p><strong>Conexión:</strong> {p.id_conexion}</p>
                      <p><strong>Distancia:</strong> {metros} m</p>
                    </div>
                  </Popup>
                </Polyline>
              );
            });
        })()}

        {/* NAPs */}
        {showNaps && naps.map((n) => (
          <Marker
            key={n.nap}
            position={[n.latitud, n.longitud]}
            icon={makeNapIcon(n.cantidad)}
            eventHandlers={{
              click: () => {
                const next = napSel === n.nap ? null : n.nap;
                setNapSel(next);
                onNapSelect?.(next);
              },
            }}
          />
        ))}

        {/* Conexiones */}
        {puntos.map((p) => (
          <CircleMarker
            key={p.id_conexion}
            center={[p.latitud, p.longitud]}
            radius={6}
            pathOptions={{
              fillColor: getColorById(p.Estado_Servicio),
              fillOpacity: 0.85,
              color: "#fff",
              weight: 1,
            }}
          >
            <Popup>
              <div className="text-sm space-y-0.5">
                <p><strong>Conexión:</strong> {p.id_conexion}</p>
                <p><strong>Estado:</strong> {p.estado_nombre}</p>
                {p.nap && <p><strong>NAP:</strong> {p.nap}</p>}
                {p.fecha_baja && (
                  <p><strong>Fecha baja:</strong> {new Date(p.fecha_baja).toLocaleDateString("es-AR")}</p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Pines custom */}
        {showPinesCustom && pinesCustom.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={makePinIcon(pin.color)}
          >
            <Popup>
              <div style={{ minWidth: 160 }} className="text-sm space-y-1">
                <p style={{ fontWeight: 700, color: pin.color }}>{pin.titulo}</p>
                {pin.cx && <p><strong>CX:</strong> {pin.cx}</p>}
                {pin.abonado && <p><strong>Abonado:</strong> {pin.abonado}</p>}
                {pin.barrio && <p><strong>Barrio:</strong> {pin.barrio}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Menú contextual — click derecho */}
      {ctxMenu && (
        <div
          className="absolute z-[1000] bg-slate-900 border border-slate-600 rounded-lg shadow-2xl overflow-hidden text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={copiarCoordenadas}
            className="flex items-center gap-2 w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            {copiado ? "✓ Coordenadas copiadas" : `Copiar coordenadas (${ctxMenu.lat.toFixed(6)}, ${ctxMenu.lng.toFixed(6)})`}
          </button>
        </div>
      )}
    </div>
  );
}
