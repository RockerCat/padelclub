import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const pushWebhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("X-Push-Secret");
    if (!pushWebhookSecret || providedSecret !== pushWebhookSecret) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: { notification_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const notificationId = body?.notification_id;
    if (!notificationId) {
      return new Response(JSON.stringify({ ok: false, error: "notification_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .select("id, profile_id, title, message, metadata")
      .eq("id", notificationId)
      .maybeSingle();

    if (notificationError) {
      return new Response(JSON.stringify({ ok: false, error: notificationError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!notification) {
      return new Response(JSON.stringify({ ok: false, error: "Notification not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("expo_push_token")
      .eq("profile_id", notification.profile_id)
      .eq("is_active", true);

    if (tokensError) {
      return new Response(JSON.stringify({ ok: false, error: tokensError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const expoResponses = [];
    for (const tokenRow of tokens) {
      const payload = {
        to: tokenRow.expo_push_token,
        title: notification.title,
        body: notification.message,
        sound: "default",
        data: { notification_id: notification.id },
      };

      try {
        const expoRes = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const expoJson = await expoRes.json();
        expoResponses.push({
          expo_push_token: tokenRow.expo_push_token,
          status: expoRes.status,
          response: expoJson,
        });
      } catch (err) {
        expoResponses.push({
          expo_push_token: tokenRow.expo_push_token,
          status: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: expoResponses.length, responses: expoResponses }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
