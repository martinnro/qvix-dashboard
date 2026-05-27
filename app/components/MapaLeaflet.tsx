"use client";
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getColorById, getNapColor, type MapStyle, type NapItem } from "./MapaUtils";

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
        <Marker key={n.nap} position={[n.latitud, n.longitud]} icon={makeNapIcon(n.cantidad)}>
          <Popup>
            <div className="text-sm space-y-0.5">
              <p><strong>NAP:</strong> {n.nap}</p>
              <p><strong>Fibra:</strong> {n.fibra}</p>
              <p><strong>Conexiones:</strong> {n.cantidad}</p>
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
              {p.nap && <p><strong>NAP:</strong> {p.nap}</p>}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
