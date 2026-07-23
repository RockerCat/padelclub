import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const rawNext = searchParams.get("next");
  const next = rawNext ?? "/clubs";

  // Supabase returned an error (access_denied, otp_expired, etc.)
  if (error) {
    if (next.startsWith("/invite/")) {
      return NextResponse.redirect(
        `${origin}${next}?error=${encodeURIComponent(error)}`
      );
    }
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(error)}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Only the default destination (/clubs) is eligible for the
      // platform-admin override — an explicit ?next= (invites, deep links
      // into protected routes) always wins, so those flows stay untouched.
      if (!rawNext && data.user && (await checkProfileIsPlatformAdmin(supabase, data.user.id))) {
        return NextResponse.redirect(`${origin}/platform`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?message=error`);
}
