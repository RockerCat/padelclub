"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveHour, timeToMinutes as sharedTimeToMinutes } from "@/lib/operatingHours";
import { validateRejectionInput } from "@/lib/reservationRejection";
import { mapUpdateReservationError } from "@/lib/reservationErrors";
import { resolveClubAccess } from "@/lib/clubAccess";

export type ReservationFormState = {
  error?: string;
  success?: boolean;
};

// ─── Permission guard ─────────────────────────────────────────────────────────

async function requireAdminRole(clubId: string) {
  const supabase = await createClient();
  const access = await resolveClubAccess(supabase, clubId);

  if (!access.authorized || !["OWNER", "ADMIN"].includes(access.role)) {
    console.error("[reservations] access denied — clubId:", clubId);
    return { supabase: null, user: null, error: access.authorized ? "Sin permiso." : access.error };
  }

  return { supabase, user: access.user, error: null };
}

// ─── Parse + validate ─────────────────────────────────────────────────────────

function parseFormData(formData: FormData) {
  const courtId = (formData.get("court_id") as string | null)?.trim() ?? "";
  const date = (formData.get("date") as string | null)?.trim() ?? "";
  const rawTime = (formData.get("start_time") as string | null)?.trim() ?? "";
  // Browser sends HH:MM; Postgres time accepts HH:MM but we normalise to HH:MM:SS
  const startTime = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
  const durationMinutes = parseInt(
    (formData.get("duration_minutes") as string | null) ?? "60",
    10
  );
  const type = (formData.get("type") as string | null)?.trim() ?? "match";
  const title = (formData.get("title") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  const playerIds = formData.getAll("players") as string[];

  return { courtId, date, startTime, durationMinutes, type, title, notes, playerIds };
}

// ─── createReservation ────────────────────────────────────────────────────────
// Routed through create_reservation_admin (Phase 7 concurrency fix,
// 20260814000001) — the direct validate-then-insert this action used to
// perform (plus its own checkOperatingHours/checkOverlap calls) is gone;
// every rule is re-validated inside the RPC, inside the same
// advisory-lock-protected transaction update_reservation and
// create_reservation_player also use. reservation_players + notification
// are still handled here afterward, unchanged.

export async function createReservation(
  clubId: string,
  clubSlug: string,
  noRedirect: boolean,
  _prevState: ReservationFormState,
  formData: FormData
): Promise<ReservationFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { courtId, date, startTime, durationMinutes, type, title, notes, playerIds } =
    parseFormData(formData);

  if (!courtId || !date || !startTime) return { error: "Datos incompletos." };

  const { data: reservationId, error } = await supabase.rpc("create_reservation_admin", {
    p_club_id: clubId,
    p_court_id: courtId,
    p_date: date,
    p_start_time: startTime,
    p_duration_minutes: durationMinutes,
    p_type: type,
    p_title: title,
    p_notes: notes,
  });

  if (error) {
    console.error("[createReservation] create_reservation_admin failed:", { clubId, supabaseError: error });
    return { error: mapUpdateReservationError(error) };
  }

  // Insert players
  if (playerIds.length > 0) {
    const { error: playersError } = await supabase
      .from("reservation_players")
      .insert(playerIds.map((profileId) => ({ reservation_id: reservationId, profile_id: profileId })));

    if (playersError) {
      console.error("[createReservation] players insert failed:", {
        reservationId,
        playerIds,
        supabaseError: playersError,
      });
      // Reservation was created; don't block on player insert failure
    } else {
      // Only reached once the players are actually linked (this INSERT is a
      // single statement — either every row lands or none does, so no
      // partial-link case to guard against here). Notifies each linked
      // player that the club booked this for them — best-effort, same
      // convention as every other notify_* RPC call in this module: the
      // reservation + participants are already committed and must never be
      // rolled back over a notification-only failure. Recipients are
      // re-derived server-side from reservation_players itself, never from
      // this action's own playerIds array.
      const { error: notifyError } = await supabase.rpc("notify_reservation_created_for_players", {
        p_reservation_id: reservationId,
      });
      if (notifyError) {
        console.error("[createReservation] notify_reservation_created_for_players failed:", {
          reservationId,
          clubId,
          code: notifyError.code,
          message: notifyError.message,
        });
      }
    }
  }

  if (noRedirect) return { success: true };
  redirect(`/${clubSlug}/admin/reservations`);
}

// ─── updateReservation ────────────────────────────────────────────────────────
// Routed through the centralized update_reservation RPC (Phase 7,
// 20260814000001) — the direct .update() this action used to perform
// (plus its own checkOperatingHours/checkOverlap calls) is gone; every one
// of those rules is now re-validated inside the RPC itself, which also
// re-derives OWNER/ADMIN authorization from auth.uid() instead of trusting
// requireAdminRole alone (kept here only as the same early, friendly gate
// every other action in this file already uses).
//
// Scope of this phase is exactly court/cancha, fecha, hora de inicio,
// duración — type, title, notes, and participants are deliberately no
// longer editable through this action (ReservationForm disables those
// inputs while editingReservationId is set); reservation_players is never
// touched here anymore either.
export async function updateReservation(
  clubId: string,
  clubSlug: string,
  reservationId: string,
  noRedirect: boolean,
  _prevState: ReservationFormState,
  formData: FormData
): Promise<ReservationFormState> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError! };

  const { courtId, date, startTime, durationMinutes } = parseFormData(formData);

  if (!courtId || !date || !startTime) return { error: "Datos incompletos." };

  const { error } = await supabase.rpc("update_reservation", {
    p_reservation_id: reservationId,
    p_court_id: courtId,
    p_date: date,
    p_start_time: startTime,
    p_duration_minutes: durationMinutes,
  });

  if (error) {
    console.error("[updateReservation] update_reservation failed:", { reservationId, clubId, supabaseError: error });
    return { error: mapUpdateReservationError(error) };
  }

  const { error: notifyError } = await supabase.rpc("notify_reservation_updated", {
    p_reservation_id: reservationId,
  });
  if (notifyError) {
    console.error("[updateReservation] notify_reservation_updated failed:", { reservationId, notifyError });
  }

  if (noRedirect) return { success: true };
  redirect(`/${clubSlug}/admin/reservations?updated=1`);
}

// ─── getAvailableSlots ────────────────────────────────────────────────────────

function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type AvailableSlotsResult = {
  slots: string[];
  closed: boolean;
  // Present whenever the day is open — lets a caller rebuild the same day
  // grid (buildDayGrid in CourtAvailabilityTimeline) without a second
  // operating-hours query. Existing callers that only destructure
  // {slots, closed} are unaffected.
  openMins?: number;
  closeMins?: number;
};

export async function getAvailableSlots(
  clubId: string,
  courtId: string,
  date: string,
  durationMinutes: number,
  excludeReservationId?: string
): Promise<AvailableSlotsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { slots: [], closed: false };

  // Effective operating hours for this day
  const [y, mo, d] = date.split("-").map(Number);
  const dayOfWeek = new Date(y, mo - 1, d).getDay();

  const { data: ohRow } = await supabase
    .from("club_operating_hours")
    .select("day_of_week, is_open, opens_at, closes_at")
    .eq("club_id", clubId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  const hours = getEffectiveHour(
    ohRow
      ? [{ day_of_week: dayOfWeek, is_open: ohRow.is_open, opens_at: ohRow.opens_at, closes_at: ohRow.closes_at }]
      : [],
    dayOfWeek
  );

  if (!hours.is_open || !hours.opens_at || !hours.closes_at) {
    return { slots: [], closed: true };
  }

  const openMins = sharedTimeToMinutes(hours.opens_at);
  const closeMins = sharedTimeToMinutes(hours.closes_at);

  // Base 30-min aligned slots; slot is valid only if full duration fits before close
  const baseSlots: string[] = [];
  for (let t = openMins; t + durationMinutes <= closeMins; t += 30) {
    baseSlots.push(minsToTime(t));
  }

  // Filter past slots when date is today (server-side best-effort)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const futureSlots =
    date === todayStr
      ? baseSlots.filter((s) => sharedTimeToMinutes(s) > now.getHours() * 60 + now.getMinutes())
      : baseSlots;

  // Fetch existing confirmed reservations for conflict detection
  let resQuery = supabase
    .from("reservations")
    .select("start_time, duration_minutes")
    .eq("club_id", clubId)
    .eq("court_id", courtId)
    .eq("date", date)
    .eq("status", "confirmed");

  if (excludeReservationId) resQuery = resQuery.neq("id", excludeReservationId);

  const { data: existing } = await resQuery;

  // Slot is blocked if the full window [slotStart, slotStart+duration) overlaps any existing reservation
  const available = futureSlots.filter((slot) => {
    const slotStart = sharedTimeToMinutes(slot);
    const slotEnd = slotStart + durationMinutes;
    return !(existing ?? []).some((r) => {
      const rStart = sharedTimeToMinutes(r.start_time);
      const rEnd = rStart + r.duration_minutes;
      return slotStart < rEnd && slotEnd > rStart;
    });
  });

  return { slots: available, closed: false, openMins, closeMins };
}

// ─── getReservationForEdit ────────────────────────────────────────────────────

export type ReservationEditData = {
  court_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  type: string;
  title: string | null;
  notes: string | null;
  player_ids: string[];
  // Added for the Agenda ticket panel's read-only summary (View mode) —
  // ReservationForm's initialValues only ever destructures the fields
  // above, so these are additive and don't affect the existing edit flow.
  price_amount: number | null;
  price_currency: string | null;
  // Who created it, and whether they're a PLAYER (this reservation started
  // as an approved request) or OWNER/ADMIN (created directly by the club)
  // — the panel's "Origen" field. Never inferred from anything the client
  // sends; both resolved server-side from the real created_by. created_by
  // itself is exposed too — when creator_is_player is true and no explicit
  // reservation_players rows exist, the panel treats this same id as the
  // effective "Jugadores" participant (the requester whose approved
  // request became this reservation), never as a stand-in for JUGADORES
  // when real participants already exist.
  created_by: string;
  creator_name: string | null;
  creator_is_player: boolean;
};

// ─── Pending reservation approval / rejection ─────────────────────────────────

export type PendingActionResult = { success?: boolean; error?: string };

// Dedicated mapping (not the shared mapUpdateReservationError — its
// messages belong to create/edit, not approval) so approvePendingReservation
// keeps its exact original user-facing text. P0003 (duration/operating
// hours) is the one case where the message is passed straight through:
// approve_pending_reservation raises it via the shared
// _check_operating_hours helper, whose RAISE messages are already
// presentable Spanish (the same ones requestReservation/updateReservation
// show) — not a raw SQL error, safe to surface as-is. The single disclosed
// wording difference from the old inline check: the club's own duration
// list now reads "Esta duración no está permitida para este club."
// (the helper's shared wording) instead of the old
// "Duración no permitida por el club." — same meaning, reused text.
function mapApprovePendingReservationError(error: { code?: string | null; message?: string }): string {
  switch (error.code) {
    case "P0002":
      return "Solicitud no encontrada.";
    case "P0004":
      return "La cancha ya no está disponible.";
    case "P0005":
      return "Este club se encuentra archivado.";
    case "P0003":
      return error.message || "El horario ya no es válido para este club.";
    case "23P01":
      return "El horario fue confirmado para otra reserva.";
    case "22023":
      return "La solicitud ya fue procesada.";
    case "42501":
      return "Sin permiso.";
    default:
      return "Error al confirmar la reserva. Intenta nuevamente.";
  }
}

// Routed through approve_pending_reservation (Phase 7 concurrency fix,
// 20260814000001) — takes the exact same shared advisory lock
// (_lock_court_date) and conflict check (_check_reservation_conflict) as
// create_reservation_player/create_reservation_admin/update_reservation,
// so an approval can never race a concurrent create/edit for the same
// court+day into a double booking. Every validation this action already
// performed (club membership/role, pending status, court still active,
// duration/operating hours, conflict against confirmed reservations
// excluding itself) is preserved, just re-derived server-side inside the
// RPC instead of via separate, unprotected queries from this action.
export async function approvePendingReservation(
  clubId: string,
  reservationId: string
): Promise<PendingActionResult> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return { error: authError ?? "Sin permiso." };

  const { error } = await supabase.rpc("approve_pending_reservation", { p_reservation_id: reservationId });

  if (error) {
    console.error("[approvePendingReservation] approve_pending_reservation failed:", {
      reservationId,
      clubId,
      supabaseError: error,
    });
    return { error: mapApprovePendingReservationError(error) };
  }

  // Shares this outcome across every OWNER/ADMIN's own
  // reservation_request_created notification for this reservation (not
  // just the resolver's own) — a plain client UPDATE can't reach other
  // recipients' rows (notifications_update_own is profile_id-scoped), so
  // this goes through a SECURITY DEFINER RPC instead. Best-effort, called
  // only after approve_pending_reservation succeeds — same place, same
  // convention as before: the reservation is already confirmed and must
  // never be rolled back over a notification-sync failure.
  const { error: resolveErr } = await supabase.rpc("resolve_reservation_request_notifications", {
    p_reservation_id: reservationId,
    p_status: "approved",
  });
  if (resolveErr) {
    console.error("[approvePendingReservation] resolve_reservation_request_notifications failed:", {
      reservationId,
      clubId,
      code: resolveErr.code,
      message: resolveErr.message,
    });
  }

  return { success: true };
}

export async function rejectPendingReservation(
  clubId: string,
  reservationId: string,
  reasonCode: string,
  reasonComment: string
): Promise<PendingActionResult> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return { error: authError ?? "Sin permiso." };

  const { data: res } = await supabase
    .from("reservations")
    .select("id, status")
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .single();

  if (!res) return { error: "Solicitud no encontrada." };
  if (res.status !== "pending") return { error: "La solicitud ya fue procesada." };

  // Never trust a motivo/comment composed on the client — codes and length
  // are re-validated here, and the final player-facing text is built from
  // that same lookup table, not from anything the client sent as "final text".
  const validated = validateRejectionInput(reasonCode, reasonComment);
  if ("error" in validated) return { error: validated.error };

  // .eq("status", "pending") is the atomic decision point — see
  // approvePendingReservation for the concurrency reasoning shared by both.
  const { data: updated, error: updateErr } = await supabase
    .from("reservations")
    .update({
      status: "rejected",
      rejection_reason_code: validated.reasonCode,
      rejection_reason: validated.reasonText,
      rejected_by: user.id,
      rejected_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    console.error("[rejectPendingReservation]", updateErr);
    return { error: "Error al rechazar la solicitud. Intenta nuevamente." };
  }
  if (!updated) {
    return { error: "La solicitud ya fue procesada." };
  }

  // Notifies the player and shares the resolution with every other
  // OWNER/ADMIN's own reservation_request_created notification — best
  // effort, same convention as notify_reservation_request_created in
  // requestReservation: the reservation is already rejected and must never
  // be rolled back over a notification-sync failure.
  const { error: notifyErr } = await supabase.rpc("notify_reservation_rejected", {
    p_reservation_id: reservationId,
  });
  if (notifyErr) {
    console.error("[rejectPendingReservation] notify_reservation_rejected failed:", {
      reservationId,
      clubId,
      code: notifyErr.code,
      message: notifyErr.message,
    });
  }

  return { success: true };
}

export async function getReservationForEdit(
  clubId: string,
  reservationId: string
): Promise<ReservationEditData | null> {
  const { supabase, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase) return null;

  const { data } = await supabase
    .from("reservations")
    .select(
      "court_id, date, start_time, duration_minutes, type, title, notes, status, created_by, price_amount, price_currency, reservation_players(profile_id)"
    )
    .eq("id", reservationId)
    .eq("club_id", clubId)
    .single();

  if (!data || data.status === "cancelled" || data.status === "rejected") return null;

  const [{ data: creatorProfile }, { data: creatorMembership }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", data.created_by).maybeSingle(),
    supabase
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("profile_id", data.created_by)
      .maybeSingle(),
  ]);

  return {
    court_id: data.court_id,
    date: data.date,
    start_time: data.start_time,
    duration_minutes: data.duration_minutes,
    type: data.type,
    title: data.title ?? null,
    notes: data.notes ?? null,
    player_ids: (data.reservation_players as unknown as Array<{ profile_id: string }>).map(
      (rp) => rp.profile_id
    ),
    price_amount: data.price_amount,
    price_currency: data.price_currency,
    created_by: data.created_by,
    creator_name: creatorProfile?.full_name ?? null,
    creator_is_player: creatorMembership?.role === "PLAYER",
  };
}

// ─── cancelReservation ────────────────────────────────────────────────────────
// Routed through the same centralized cancel_reservation RPC (Phase 4,
// 20260811000001) the new PLAYER-facing cancelMyReservation uses — one
// place decides who can cancel what, instead of this action's own direct
// .update(). requireAdminRole stays as the first gate (preserves this
// action's existing behavior for a non-admin caller), with cancel_reservation
// re-deriving the same OWNER/ADMIN check internally regardless. Unlike the
// old direct update, this now also fires notify_reservation_cancelled so
// affected players are actually notified — a gap the old path never covered.
export async function cancelReservation(
  clubId: string,
  clubSlug: string,
  reservationId: string
): Promise<void> {
  const { supabase, user, error: authError } = await requireAdminRole(clubId);
  if (authError || !supabase || !user) return;

  const { error } = await supabase.rpc("cancel_reservation", { p_reservation_id: reservationId });

  if (error) {
    console.error("[cancelReservation] cancel_reservation failed:", { reservationId, supabaseError: error });
  } else {
    const { error: notifyError } = await supabase.rpc("notify_reservation_cancelled", {
      p_reservation_id: reservationId,
    });
    if (notifyError) {
      console.error("[cancelReservation] notify_reservation_cancelled failed:", { reservationId, notifyError });
    }
  }

  redirect(`/${clubSlug}/admin/reservations?cancelled=1`);
}
