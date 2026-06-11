"use server";

import { createClient } from "@/lib/supabase/server";

type ClaimResult =
  | { success: true; clubSlug: string }
  | { success: false; error: string };

export async function claimInvitation(token: string): Promise<ClaimResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "not_authenticated" };

  const { data, error } = await supabase.rpc("claim_invitation", { p_token: token });

  if (error || !data) {
    return { success: false, error: "invalid_token" };
  }

  const result = data as { success: boolean; error?: string; club_slug?: string };

  if (!result.success) {
    return { success: false, error: result.error ?? "invalid_token" };
  }

  return { success: true, clubSlug: result.club_slug! };
}
