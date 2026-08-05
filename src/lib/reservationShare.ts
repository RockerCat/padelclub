// Texto del mensaje de "WhatsApp" — una sola función, para que los tres
// puntos que ya comparten/copian el enlace de una reserva
// (ReservationTicketPanel, PlayerActivity, ReservationShareView) nunca
// tengan tres versiones ligeramente distintas del mismo mensaje.

const WEEKDAY_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTH_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// "Miércoles 5 de Agosto"
function formatShareDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAY_FULL[dt.getDay()]} ${dt.getDate()} de ${MONTH_FULL[dt.getMonth()]}`;
}

// "4:00 p. m." — 12h en español, siempre con minutos de dos dígitos.
function to12Hour(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h24 = Number(hStr);
  const period = h24 >= 12 ? "p. m." : "a. m.";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mStr.padStart(2, "0")} ${period}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export function buildReservationShareMessage(params: {
  clubName: string;
  creatorName?: string | null;
  date: string; // YYYY-MM-DD
  startTime: string; // "HH:MM" o "HH:MM:SS"
  durationMinutes: number;
  courtName?: string | null;
  isOpen: boolean;
  // Jugadores actuales — solo se usa cuando isOpen es true, para calcular
  // cupos disponibles (4 - playerCount). Si no se conoce, se omite el
  // detalle de cupos por completo en vez de inventar un número.
  playerCount?: number | null;
  // Categoría del creador — se omite completamente (sin coma ni espacio
  // sobrante) cuando no existe.
  category?: string | null;
  url: string;
}): string {
  const start = params.startTime.slice(0, 5);
  const end = addMinutesToTime(start, params.durationMinutes);
  const timeRange = `${to12Hour(start)} – ${to12Hour(end)}`;

  let statusLine: string;
  if (!params.isOpen) {
    statusLine = "🎾 Cerrada";
  } else if (params.playerCount != null) {
    const available = Math.max(0, 4 - params.playerCount);
    const cupoText = available === 1 ? "cupo disponible" : "cupos disponibles";
    const categoryText = params.category ? `, categoría ${params.category}` : "";
    statusLine = `🎾 Abierta (${available} ${cupoText}${categoryText})`;
  } else {
    statusLine = "🎾 Abierta";
  }

  const lines = [
    `*${formatShareDate(params.date)}* 🌟`,
    `⏰ ${timeRange}`,
    params.courtName ? `🎾 ${params.courtName}` : null,
    `📍 ${params.clubName}`,
    params.creatorName ? `💙 Reserva de ${params.creatorName}` : null,
    statusLine,
    "",
    params.url,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}
