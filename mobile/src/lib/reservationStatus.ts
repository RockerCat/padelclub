import { Ban, Check, Clock, Hourglass, X, type LucideIcon } from "lucide-react-native";
import type { MyReservation } from "./playerReservations";
import { theme } from "./theme";

// Portado de ACTIVITY_STATUS en src/components/reservations/PlayerActivity.tsx
// (app web) — mismas etiquetas y mismo significado por status (ver
// CLAUDE.md → Reservation Status Principles: pending/confirmed/cancelled/
// rejected/expired nunca son intercambiables), adaptado de clases Tailwind
// a colores planos para React Native.
export const RESERVATION_STATUS: Record<MyReservation["status"], { label: string; color: string }> = {
  pending: { label: "Pendiente", color: theme.colors.warning },
  confirmed: { label: "Aprobada", color: theme.colors.success },
  rejected: { label: "Rechazada", color: theme.colors.danger },
  cancelled: { label: "Cancelada", color: theme.colors.muted },
  expired: { label: "Expirada", color: theme.colors.expired },
};

// Portado de STATUS_LABEL en ReservationShareView.tsx (app web) — la web
// usa deliberadamente un texto MÁS largo/formal acá que en la tarjeta de
// "Mis reservas"/"Mis solicitudes" (p. ej. "Confirmada" en vez de
// "Aprobada", "Pendiente de aprobación" en vez de "Pendiente") — mismo
// status, dos redacciones reales y distintas según la pantalla. Nunca
// unificar ambos mapas en uno solo.
// icon: mismo ícono lucide que STATUS_LABEL usa en la web (Check/Clock/
// XIcon/Ban/Hourglass, w-3.5 h-3.5 = 14px junto al texto).
export const DETAIL_STATUS: Record<MyReservation["status"], { label: string; color: string; icon: LucideIcon }> = {
  confirmed: { label: "Confirmada", color: theme.colors.success, icon: Check },
  pending: { label: "Pendiente de aprobación", color: theme.colors.warning, icon: Clock },
  rejected: { label: "Rechazada", color: theme.colors.danger, icon: X },
  cancelled: { label: "Cancelada", color: theme.colors.muted, icon: Ban },
  expired: { label: "Expirada", color: theme.colors.expired, icon: Hourglass },
};
