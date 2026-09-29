"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Loader2 } from "lucide-react";

// Centro por defecto (Catamarca) cuando todavía no se marcó ningún punto — mismo fallback que MapaLeaflet.
const DEFAULT_CENTER: [number, number] = [-28.5, -65.8];

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:34px; height:34px;
      background:${color};
      border:3px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 3px 10px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ pos, token }: { pos: [number, number] | null; token: number }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.flyTo(pos, Math.max(map.getZoom(), 16), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return null;
}

// Cuando cambia la sucursal (y todavía no hay un pin marcado a mano), centra el mapa en esa
// localidad en vez de dejar la vista genérica de toda la provincia.
function FlyToCentro({ centro, activo }: { centro: [number, number] | null; activo: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (activo && centro) map.flyTo(centro, 13, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centro?.[0], centro?.[1], activo]);
  return null;
}

export default function UbicacionMapPicker({
  lat,
  lng,
  onChange,
  color = "#4f46e5",
  centro = null,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  color?: string;
  /** Centro por defecto (ej. la localidad de la sucursal elegida) cuando todavía no hay un pin marcado. */
  centro?: [number, number] | null;
}) {
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [flyToken, setFlyToken] = useState(0);

  const pos: [number, number] | null = lat !== null && lng !== null ? [lat, lng] : null;
  const icon = pinIcon(color);

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange(p.coords.latitude, p.coords.longitude);
        setFlyToken((t) => t + 1);
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? "Permiso de ubicación denegado" : "No se pudo obtener tu ubicación");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-slate-600" style={{ height: 260 }}>
        <MapContainer center={pos ?? centro ?? DEFAULT_CENTER} zoom={pos ? 16 : centro ? 13 : 12} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          <ClickHandler onPick={onChange} />
          <FlyTo pos={pos} token={flyToken} />
          <FlyToCentro centro={centro} activo={!pos} />
          {pos && (
            <Marker
              position={pos}
              icon={icon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target.getLatLng();
                  onChange(m.lat, m.lng);
                },
              }}
            />
          )}
        </MapContainer>

        <button
          type="button"
          onClick={usarMiUbicacion}
          disabled={geoLoading}
          className="absolute bottom-2.5 right-2.5 z-[1000] flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium px-3 py-2 rounded-lg shadow-lg transition-colors disabled:opacity-60"
        >
          {geoLoading ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
          Usar mi ubicación
        </button>
      </div>

      <p className="text-xs text-slate-500">
        {pos
          ? `Marcado: ${pos[0].toFixed(5)}, ${pos[1].toFixed(5)} — arrastrá el pin o tocá el mapa para ajustar.`
          : "Tocá el mapa para marcar el domicilio de instalación, o usá tu ubicación actual."}
      </p>
      {geoError && <p className="text-xs text-rose-400">{geoError}</p>}
    </div>
  );
}
