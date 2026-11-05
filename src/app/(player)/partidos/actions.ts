"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  cancelOpenMatch,
  confirmOpenMatchAttendance,
  createOpenMatch,
  joinOpenMatch,
  leaveOpenMatch,
  openMatchErrorMessage,
  openMatchPath,
  setOpenMatchGuests,
  updateOpenMatch,
  validateOpenMatchForm,
  type OpenMatch,
  type OpenMatchFormValues,
} from "@/lib/openMatches";
import { getBogotaNow } from "@/lib/utils/bogotaDatetime";
import { listPadelVenues, type PadelVenue } from "@/lib/directory";

// Server Actions de "Encuentra tu partido". Toda regla (autorización,
// cupos, concurrencia, fechas) la aplica el RPC en Postgres; aquí solo se
// normaliza la entrada, se traduce el error y se revalida la vista.

export type OpenMatchActionResult<T = OpenMatch> = { ok: true; data: T } | { ok: false; error: string };

function toWriteInput(v: OpenMatchFormValues) {
  return {
    city: v.city.trim().replace(/\s+/g, " "),
    matchDate: v.matchDate,
    startTime: v.startTime,
    level: v.level,
    // Con establecimiento del directorio, el texto libre sobra (el servidor
    // también lo descarta): una sola fuente para el lugar.
    venueName: v.venueId ? null : v.venueName.trim() || null,
    venueId: v.venueId || null,
    comment: v.comment.trim() || null,
    courtBooked: v.courtBooked,
  };
}

function revalidateMatch(id: string) {
  revalidatePath(openMatchPath(id));
  revalidatePath("/partidos");
  revalidatePath("/partidos/mis-partidos");
}

export async function createOpenMatchAction(values: OpenMatchFormValues): Promise<OpenMatchActionResult<string>> {
  const invalid = validateOpenMatchForm(values, getBogotaNow());
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const { data, error } = await createOpenMatch(supabase, {
    ...toWriteInput(values),
    playersAlready: values.playersAlready ?? 1,
  });
  if (error) return { ok: false, error: openMatchErrorMessage(error) };

  revalidatePath("/partidos");
  revalidatePath("/partidos/mis-partidos");
  return { ok: true, data };
}

// clearVenue: el organizador quitó explícitamente el establecimiento que el
// partido tenía. Sin él, un venueId vacío conserva el actual (servidor).
export async function updateOpenMatchAction(
  id: string,
  values: OpenMatchFormValues,
  opts: { clearVenue?: boolean } = {}
): Promise<OpenMatchActionResult> {
  const invalid = validateOpenMatchForm({ ...values, playersAlready: undefined }, getBogotaNow());
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const { data, error } = await updateOpenMatch(supabase, id, {
    ...toWriteInput(values),
    clearVenue: !values.venueId && opts.clearVenue === true,
  });
  if (error) return { ok: false, error: openMatchErrorMessage(error) };
  revalidateMatch(id);
  return { ok: true, data };
}

type SimpleMutation = (c: Awaited<ReturnType<typeof createClient>>, id: string) => ReturnType<typeof joinOpenMatch>;

async function run(id: string, fn: SimpleMutation): Promise<OpenMatchActionResult> {
  const supabase = await createClient();
  const { data, error } = await fn(supabase, id);
  if (error) return { ok: false, error: openMatchErrorMessage(error) };
  revalidateMatch(id);
  return { ok: true, data };
}

export async function joinOpenMatchAction(id: string) {
  return run(id, joinOpenMatch);
}

export async function leaveOpenMatchAction(id: string) {
  return run(id, leaveOpenMatch);
}

export async function cancelOpenMatchAction(id: string) {
  return run(id, cancelOpenMatch);
}

export async function confirmOpenMatchAttendanceAction(id: string) {
  return run(id, confirmOpenMatchAttendance);
}

export async function setOpenMatchGuestsAction(id: string, guestCount: number): Promise<OpenMatchActionResult> {
  return run(id, (c, matchId) => setOpenMatchGuests(c, matchId, guestCount));
}

// Establecimientos publicados del directorio en la ciudad del partido
// (lectura pública: list_padel_venues). Un fallo devuelve [] — elegir
// lugar es opcional y nunca bloquea crear/editar.
export async function listVenuesForCityAction(city: string): Promise<PadelVenue[]> {
  const clean = city.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 60) return [];
  const supabase = await createClient();
  const { data } = await listPadelVenues(supabase, { municipality: clean, limit: 100 });
  return data ?? [];
}
