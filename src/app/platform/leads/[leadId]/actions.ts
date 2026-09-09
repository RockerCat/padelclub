"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";

type ActionResult<T extends object = object> = { error?: string } & T;

async function requirePlatformAdmin(): Promise<{ error?: string }> {
  if (!(await isPlatformAdmin())) return { error: "Sin permiso." };
  return {};
}

// Cambia el estado del prospecto. demo_at/lost_reason nunca se borran
// automáticamente al salir de demo_scheduled/lost — la RPC
// (update_commercial_lead_status) solo los sobrescribe cuando se manda un
// valor nuevo, preservando historia por defecto.
export async function updateLeadStatus(
  leadId: string,
  status: string,
  demoAt?: string,
  lostReason?: string
): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = await createClient();
  // update_commercial_lead_status added in 20261115000001, not yet in
  // generated types until `npm run types:generate` runs against a DB with
  // this migration applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("update_commercial_lead_status", {
    p_lead_id: leadId,
    p_status: status,
    p_demo_at: demoAt || undefined,
    p_lost_reason: lostReason || undefined,
  });

  if (error) {
    return { error: "No se pudo actualizar el estado. Intenta de nuevo." };
  }

  revalidatePath(`/platform/leads/${leadId}`);
  revalidatePath("/platform/leads");
  return {};
}

export async function updateLeadNotes(leadId: string, notes: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("update_commercial_lead_notes", {
    p_lead_id: leadId,
    p_notes: notes,
  });

  if (error) {
    return { error: "No se pudieron guardar las notas. Intenta de nuevo." };
  }

  revalidatePath(`/platform/leads/${leadId}`);
  return {};
}
