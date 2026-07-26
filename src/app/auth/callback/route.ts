import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";
import { getSafeInternalPath } from "@/lib/utils/safeRedirect";
import { resolveClubEntryPath } from "@/lib/utils/navigation";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  // Rejects absolute/protocol-relative URLs — an open-redirect guard for
  // ?next=, which round-trips through the confirmation email untouched.
  const safeNext = getSafeInternalPath(searchParams.get("next"));
  const next = safeNext ?? "/clubs";

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
      // Only the default destination (no explicit ?next=) is eligible for
      // the platform-admin override and the smart club-entry decision — an
      // explicit, valid ?next= (invites, deep links into protected routes,
      // join-club returns) always wins, so those flows stay untouched.
      if (!safeNext && data.user) {
        if (await checkProfileIsPlatformAdmin(supabase, data.user.id)) {
          return NextResponse.redirect(`${origin}/platform`);
        }
        // Single point of decision (shared with LoginForm) — 0 clubs →
        // /clubs; 1 club → straight there; 2+ clubs → last_club_id if it
        // still points at an active membership, otherwise /clubs. Gives
        // OAuth/magic-link/invite logins the same entry behavior password
        // login already had, instead of always falling back to /clubs.
        const destination = await resolveClubEntryPath(supabase, data.user.id);
        return NextResponse.redirect(`${origin}${destination}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?message=error`);
}
