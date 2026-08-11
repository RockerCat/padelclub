import Svg, { Defs, LinearGradient, Line, Rect, Stop } from "react-native-svg";

// Traducción 1:1 de CourtIllustration.tsx (app web) — mismo SVG puro (sin
// imágenes externas), mismos tintes por superficie, misma geometría
// (viewBox 200x150), vía react-native-svg en vez de <svg> DOM.
export const SURFACE_OPTIONS = [
  { value: "", label: "Sin especificar" },
  { value: "cristal", label: "Cristal" },
  { value: "moqueta", label: "Moqueta" },
  { value: "césped_artificial", label: "Césped artificial" },
  { value: "cemento", label: "Cemento" },
  { value: "tierra", label: "Tierra batida" },
];

const SURFACE_TINTS: Record<string, string> = {
  "": "#64748B",
  cristal: "#2563EB",
  moqueta: "#1E3A8A",
  césped_artificial: "#16A34A",
  cemento: "#6B7280",
  tierra: "#B45309",
};

export function getSurfaceLabel(surface: string | null | undefined): string {
  return SURFACE_OPTIONS.find((opt) => opt.value === (surface ?? ""))?.label ?? SURFACE_OPTIONS[0].label;
}

export function CourtIllustration({ surface, width = 64, height = 48 }: { surface: string | null | undefined; width?: number; height?: number }) {
  const tint = SURFACE_TINTS[surface ?? ""] ?? SURFACE_TINTS[""];

  return (
    <Svg width={width} height={height} viewBox="0 0 200 150">
      <Defs>
        <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.12} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <Rect x={4} y={4} width={192} height={142} rx={10} fill="none" stroke="#475569" strokeWidth={6} strokeOpacity={0.85} />
      <Rect x={16} y={16} width={168} height={118} rx={6} fill={tint} fillOpacity={0.22} stroke={tint} strokeWidth={2} strokeOpacity={0.95} />
      <Line x1={100} y1={16} x2={100} y2={134} stroke={tint} strokeWidth={3} strokeOpacity={0.95} />
      <Line x1={50} y1={16} x2={50} y2={134} stroke={tint} strokeWidth={2} strokeOpacity={0.85} />
      <Line x1={150} y1={16} x2={150} y2={134} stroke={tint} strokeWidth={2} strokeOpacity={0.85} />
      <Line x1={50} y1={75} x2={150} y2={75} stroke={tint} strokeWidth={1.5} strokeOpacity={0.7} />
      <Rect x={16} y={16} width={168} height={118} rx={6} fill="url(#sheen)" />
    </Svg>
  );
}
