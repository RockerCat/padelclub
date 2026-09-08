import { createClient } from "npm:@supabase/supabase-js@2";

// Self-service account deletion — the one privileged step (disabling the
// Auth account) needs the service-role Admin API, which cannot run in
// WEB/Mobile. Both platforms call this same Edge Function via
// supabase.functions.invoke("delete-account"), which automatically
// forwards the caller's own session as the Authorization header — this
// function never accepts a target userId/profileId from the request body,
// by design: the target is always derived from the validated JWT.
//
// verify_jwt = true in supabase/config.toml (the default — this is
// deliberately NOT the send-push pattern, which authenticates via a
// shared secret for server-to-server calls with no end-user session).
//
// Two Supabase clients are used, never interchangeably:
//   - userClient: built from the caller's own JWT (anon key + their
//     Authorization header). Used for delete_own_account() and the
//     avatar Storage cleanup, so auth.uid()/RLS resolve to the real
//     caller — a service-role client would NOT populate auth.uid().
//   - adminClient: service-role key, created only inside this function,
//     used ONLY for the final auth.admin.updateUserById ban/email-scrub
//     step, which is the one operation that genuinely requires it.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ ok: false, error: "Server not configured" }, 500);
    }

    // Forwards the caller's own JWT — every subsequent call on this client
    // runs AS that user (RLS + auth.uid() both resolve to them).
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    // 1. DB-side cleanup + anonymization. Never accepts/uses any id from
    // the request — the RPC itself derives auth.uid() from this same JWT.
    const { error: rpcError } = await userClient.rpc("delete_own_account");
    if (rpcError) {
      // Deletion never partially applied past this point (ban/email-scrub
      // below hasn't run yet) — session stays fully valid, safe to retry.
      return json({ ok: false, error: rpcError.message }, 400);
    }

    // 2. Avatar Storage cleanup — same user-scoped client. Storage RLS
    // (20260827000001) already restricts profile-avatars writes/deletes to
    // the caller's own folder (`{auth.uid()}/...`), so no elevated
    // privilege is needed here. `.list()` first (not just the current
    // avatar_url's derived path) so any orphaned object from a past
    // crashed replace is also cleaned up, not just the most recent one.
    const { data: files } = await userClient.storage.from("profile-avatars").list(user.id);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${f.name}`);
      await userClient.storage.from("profile-avatars").remove(paths);
    }

    // 3. Disable the Auth account — the one step that requires the
    // service role, created here and only here, never sent to any client.
    // Same ban_duration mechanism already in production for platform-admin
    // user suspension (src/app/platform/users/[userId]/actions.ts,
    // setUserBanned): Supabase has no literal "forever" ban, so a ~100-year
    // duration is the documented indefinite-ban workaround. Email is
    // replaced with a non-routable placeholder derived from the user's own
    // id (never sent, never reused) so the real address is freed for reuse
    // and no longer stored; user_metadata is cleared of whatever personal
    // data (e.g. full_name from signup) it may have held.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: banError } = await adminClient.auth.admin.updateUserById(user.id, {
      ban_duration: "876000h",
      email: `deleted-${user.id}@mipadel.club.invalid`,
      user_metadata: {},
    });

    if (banError) {
      // DB side already anonymized/deactivated — only login-disabling
      // failed. Retrying this same endpoint re-runs the (idempotent) RPC
      // harmlessly and retries this step — never leaves two divergent
      // "partially deleted" shapes beyond this single known gap.
      return json(
        { ok: false, error: "Tu información fue eliminada, pero no pudimos deshabilitar el acceso. Contáctanos." },
        500
      );
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
