import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Single call site for account deletion, shared by WEB and Mobile — both
// invoke the exact same delete-account Edge Function (never a Next.js
// Server Action, which Mobile has no way to reach). supabase.functions.
// invoke() automatically attaches the current session's access token as
// the Authorization header on whichever client instance calls it (browser
// client on WEB, AsyncStorage-backed client on Mobile) — never a
// client-supplied user id anywhere in this call.
export type DeleteAccountResult = { success: true } | { success: false; error: string };

const GENERIC_ERROR = "No se pudo eliminar la cuenta. Intenta de nuevo.";

export async function deleteOwnAccount(supabase: SupabaseClient<Database>): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.functions.invoke("delete-account", { method: "POST" });

  if (error) {
    // A non-2xx response surfaces as a FunctionsHttpError whose `.context`
    // is the raw Response — the Edge Function always returns a JSON body
    // ({ok:false,error}) even on failure, so read that instead of falling
    // back to a bare generic message when it's available.
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.json();
        if (typeof body?.error === "string") return { success: false, error: body.error };
      } catch {
        // fall through to generic message
      }
    }
    return { success: false, error: GENERIC_ERROR };
  }

  if (!data?.ok) {
    return { success: false, error: typeof data?.error === "string" ? data.error : GENERIC_ERROR };
  }

  return { success: true };
}
