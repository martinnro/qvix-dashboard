"use client";
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getColorById, type MapStyle, type NapItem } from "./MapaUtils";

const napIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:28px; height:28px;
    background:#1e293b;
    border:2px solid #a855f7;
    border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 2px 6px rgba(0,0,0,0.7);
  ">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
      <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <circle cx="12" cy="20" r="1" fill="#a855f7"/>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
});

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

interface Props {
  puntos: Punto[];
  mapStyle: MapStyle;
  naps?: NapItem[];
  showNaps?: boolean;
}

export default function MapaLeaflet({ puntos, mapStyle, naps = [], showNaps = false }: Props) {
  const centro: [number, number] = puntos.length > 0
    ? [puntos[0].latitud, puntos[0].longitud]
    : [-28.5, -65.8];

  const style = MAP_STYLES.find((s) => s.key === mapStyle) ?? MAP_STYLES[0];
  const labelsUrl = "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";

  return (
    <MapContainer
      center={centro}
      zoom={13}
      style={{ height: "100%", width: "100%", borderRadius: "0 0 1rem 1rem" }}
      className="z-0"
    >
      <TileLayer url={style.url} attribution={style.attribution} />
      {mapStyle === "satellite-labels" && (
        <TileLayer url={labelsUrl} attribution="" />
      )}
      <FitBounds puntos={puntos} />
      {showNaps && naps.map((n) => (
        <Marker key={n.nap} position={[n.latitud, n.longitud]} icon={napIcon}>
          <Popup>
            <div className="text-sm space-y-0.5">
              <p><strong>NAP:</strong> {n.nap}</p>
              <p><strong>Fibra:</strong> {n.fibra}</p>
            </div>
          </Popup>
        </Marker>
      ))}
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
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
