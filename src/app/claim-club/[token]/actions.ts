"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hashClaimToken, sanitizeIp } from "@/lib/clubClaim";

type ClaimResult =
  | { success: true; clubSlug: string }
  | { success: false; error: string };

// Best-effort IP capture for the audit trail ONLY — claim_club never reads
// this value for authorization, only writes it to club_claim_events.
//
// This Server Action runs in Vercel's Node.js serverless runtime (no
// `export const runtime = "edge"` anywhere in this route), which does not
// expose a request/socket object to read a peer address from directly —
// `headers()` is the only way to reach client-IP information here, and
// Vercel's edge network sets x-forwarded-for on every request that reaches
// it, prepending the true client IP as the first entry (subsequent entries,
// if any, are intermediate hops). x-real-ip is kept only as a fallback for
// any proxy/preview configuration that sets it instead. Every value that
// makes it out of this function is already normalized/shape-checked by
// sanitizeIp — garbage or missing headers become null, exactly like a
// client that genuinely couldn't be identified.
async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return sanitizeIp(forwarded.split(",")[0]);
  return sanitizeIp(h.get("x-real-ip"));
}

export async function claimClub(token: string): Promise<ClaimResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "not_authenticated" };

  const tokenHash = hashClaimToken(token);
  const ip = await getClientIp();

  // p_ip tiene DEFAULT NULL en SQL; omitirlo con `?? undefined` es
  // equivalente a enviar NULL explícito.
  const { data, error } = await supabase.rpc("claim_club", {
    p_token_hash: tokenHash,
    p_ip: ip ?? undefined,
  });

  if (error || !data) {
    return { success: false, error: "not_found" };
  }

  const result = data as { success: boolean; error?: string; club_slug?: string };

  if (!result.success) {
    return { success: false, error: result.error ?? "not_found" };
  }

  return { success: true, clubSlug: result.club_slug! };
}
