import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Portado de addReservationExtraTime en actions.ts (app web,
// src/app/(app)/[club]/admin/reservations/) — misma RPC exacta
// (add_reservation_extra_time, SECURITY DEFINER, mismo advisory lock/
// conflict-check que el resto del módulo), mismas validaciones de forma
// (minutos enteros > 0, valor >= 0) y mismo mapeo de errores. Solo una
// reserva confirmada es extensible — la propia RPC lo re-valida, esto
// nunca reduce duración ni cambia cancha/fecha/jugadores/tipo/creador.

export type AddExtraTimeResult = {
  success?: boolean;
  error?: string;
  reservation?: {
    duration_minutes: number;
    extra_minutes: number;
    extra_amount: number;
    extra_currency: string | null;
  };
};

function mapAddExtraTimeError(error: { code?: string | null; message?: string }): string {
  switch (error.code) {
    case "42501":
      return "No tienes permiso para agregar tiempo extra a esta reserva.";
    case "P0002":
      return "La reserva o la cancha ya no está disponible.";
    case "P0005":
      return "Este club se encuentra archivado.";
    case "22023":
      return error.message || "Esta reserva ya no admite tiempo extra.";
    case "P0003":
      return error.message || "La extensión no es válida para el horario del club.";
    case "23P01":
      return "Ese tiempo extra choca con otra reserva confirmada. Elige menos minutos u otro horario.";
    default:
      return "Error al agregar el tiempo extra. Intenta de nuevo.";
  }
}

export async function addReservationExtraTime(
  supabase: SupabaseClient<Database>,
  reservationId: string,
  extraMinutes: number,
  extraAmount: number,
  note: string
): Promise<AddExtraTimeResult> {
  if (!Number.isInteger(extraMinutes) || extraMinutes <= 0) {
    return { error: "Los minutos adicionales deben ser un número entero mayor que 0." };
  }
  if (!Number.isFinite(extraAmount) || extraAmount < 0) {
    return { error: "El valor adicional no puede ser negativo." };
  }

  const { data, error } = await supabase.rpc("add_reservation_extra_time", {
    p_reservation_id: reservationId,
    p_extra_minutes: extraMinutes,
    p_extra_amount: extraAmount,
    p_note: note.trim() || null,
  });

  if (error) return { error: mapAddExtraTimeError(error) };

  // Best-effort, misma convención que el resto del módulo: la extensión ya
  // quedó aplicada y nunca se revierte por un fallo de notificación.
  await supabase.rpc("notify_reservation_extra_time_added", {
    p_reservation_id: reservationId,
    p_extra_minutes: extraMinutes,
  });

  return {
    success: true,
    reservation: {
      duration_minutes: data.duration_minutes,
      extra_minutes: data.extra_minutes,
      extra_amount: data.extra_amount,
      extra_currency: data.extra_currency,
    },
  };
}
