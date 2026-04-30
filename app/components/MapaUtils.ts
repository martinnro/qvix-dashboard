export type MapStyle = "dark" | "street" | "satellite" | "satellite-labels" | "light";

export interface NapItem {
  nap: string;
  fibra: string;
  latitud: number;
  longitud: number;
}

const ESTADO_COLOR: Record<number, string> = {
  1:   "#3b82f6",
  3:   "#22c55e",
  6:   "#f59e0b",
  9:   "#ef4444",
  101: "#111827",
};

const FALLBACK_PALETTE: Record<number, string> = {
  2:  "#f97316",
  4:  "#a855f7",
  5:  "#ec4899",
  7:  "#14b8a6",
  8:  "#84cc16",
  10: "#e11d48",
  11: "#8b5cf6",
  12: "#d97706",
  61: "#f97316",
  63: "#fb923c",
  64: "#6366f1",
  65: "#10b981",
  99: "#94a3b8",
};

export function getColorById(id: number): string {
  return ESTADO_COLOR[id] ?? FALLBACK_PALETTE[id] ?? "#94a3b8";
}
