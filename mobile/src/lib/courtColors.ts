// Portado literal de COURT_PALETTE en WeekCalendar.tsx (app web) — mismos
// 6 colores exactos, mismo criterio (colorIndex = índice de la cancha en
// el array ya ordenado por sort_order, ciclado cada 6). Única fuente para
// el dot de la leyenda y el acento del ticket — nunca dos paletas.
export const COURT_PALETTE = [
  { accent: "#B7E000", bg: "rgba(183,224,0,0.10)", border: "rgba(183,224,0,0.25)" },
  { accent: "#1698BE", bg: "rgba(22,152,190,0.10)", border: "rgba(22,152,190,0.25)" },
  { accent: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.25)" },
  { accent: "#FB923C", bg: "rgba(251,146,60,0.10)", border: "rgba(251,146,60,0.25)" },
  { accent: "#A78BFA", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.25)" },
  { accent: "#34D399", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.25)" },
];

// colorIndex puede llegar en -1 (findIndex sin match, p. ej. una cancha
// que se desactivó pero cuya reserva sigue confirmada) — a diferencia de
// la web, donde colorIndex siempre viene de un .map() real y nunca es
// negativo, acá el índice se normaliza para que el módulo de JS (que
// preserva el signo: -1 % 6 === -1, no 5) nunca produzca un índice fuera
// de rango y devuelva undefined.
export function courtColor(colorIndex: number) {
  const safeIndex = ((colorIndex % COURT_PALETTE.length) + COURT_PALETTE.length) % COURT_PALETTE.length;
  return COURT_PALETTE[safeIndex];
}

// Idéntico a TYPE_LABELS en WeekCalendar.tsx.
export const RESERVATION_TYPE_LABELS: Record<string, string> = {
  match: "Partido",
  class: "Clase",
  block: "Bloqueo",
};
