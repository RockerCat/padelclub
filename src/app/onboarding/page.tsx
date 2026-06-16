import { redirect } from "next/navigation";

// /onboarding is no longer the primary entry point for club creation.
// The canonical URL is /clubs/create. Redirect to keep old bookmarks working.
export default function OnboardingPage() {
  redirect("/clubs/create");
}
