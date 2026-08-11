import { useEffect } from "react";
import { supabase } from "./supabase";

// Portado literal de usePlayerReservationsRealtime en PlayerActivity.tsx
// (app web) — mismo canal, mismos cuatro listeners (notificaciones propias,
// reservas propias creadas/actualizadas, participación agregada). Funciona
// igual en RN: supabase-js usa WebSockets puros para Realtime, sin ninguna
// API de navegador de por medio.
export function usePlayerReservationsRealtime(onChange: () => void) {
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let lastNotificationId: string | null = null;
    let lastReservationEventKey: string | null = null;
    let lastParticipantEventKey: string | null = null;

    function onReservationChange(payload: { new: { id?: string; status?: string } | null }) {
      const row = payload.new;
      const key = row?.id && row?.status ? `${row.id}:${row.status}` : null;
      if (key && key === lastReservationEventKey) return;
      lastReservationEventKey = key;
      onChange();
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      channel = supabase
        .channel(`player-reservations:${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `profile_id=eq.${user.id}` },
          (payload) => {
            const id = (payload.new as { id?: string } | null)?.id ?? null;
            if (id && id === lastNotificationId) return;
            lastNotificationId = id;
            onChange();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "reservations", filter: `created_by=eq.${user.id}` },
          onReservationChange
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reservations", filter: `created_by=eq.${user.id}` },
          onReservationChange
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reservation_players", filter: `profile_id=eq.${user.id}` },
          (payload) => {
            const id = (payload.new as { id?: string } | null)?.id ?? null;
            if (id && id === lastParticipantEventKey) return;
            lastParticipantEventKey = id;
            onChange();
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [onChange]);
}
