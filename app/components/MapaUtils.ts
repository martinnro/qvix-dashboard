export type MapStyle = "dark" | "street" | "satellite" | "satellite-labels" | "light";

export interface NapItem {
  nap: string;
  fibra: string;
  latitud: number;
  longitud: number;
  cantidad: number;
}

export function getNapColor(cantidad: number): string {
  if (cantidad === 0) return "#ffffff";
  if (cantidad >= 8) return "#ef4444";
  if (cantidad >= 6) return "#f59e0b";
  return "#a855f7";
}

const ESTADO_COLOR: Record<number, string> = {
  1:   "#3b82f6",  // Pendiente
  3:   "#22c55e",  // Conectado
  6:   "#f59e0b",  // Suspendido
  9:   "#ef4444",  // Zona No Cableada
  101: "#111827",  // Pendiente En Nodo No Operativo
};

const FALLBACK_PALETTE: Record<number, string> = {
  2:  "#f97316",  // Bajada Lista
  4:  "#a855f7",  // Anulado
  5:  "#ec4899",  // Cortado
  7:  "#78350f",  // Baja Voluntaria
  8:  "#84cc16",  // Rechaza Cableado
  10: "#e11d48",  // Rechaza Modem
  11: "#8b5cf6",  // Incobrable/Irrecuperable
  12: "#d97706",  // Facturacion Manual
  61: "#f97316",  // Suspendido En Gestion De Corte
  63: "#fb923c",  // Gestion Abogados
  64: "#6366f1",  // Pend. Cambio Domic.
  65: "#10b981",  // (sin asignar)
  99: "#94a3b8",  // Unificado TV/Net
};

export function getColorById(id: number): string {
  return ESTADO_COLOR[id] ?? FALLBACK_PALETTE[id] ?? "#94a3b8";
}
