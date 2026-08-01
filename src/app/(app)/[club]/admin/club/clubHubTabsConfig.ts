import { Globe, Megaphone, ShieldCheck, Settings, type LucideIcon } from "lucide-react";
import { type ClubHubTabKey } from "@/lib/clubHubPaths";

export type { ClubHubTabKey };

// Plain config + pure logic — deliberately NOT a "use client" module (same
// reasoning as dashboardTabsConfig.ts), so page.tsx (Server Component) can
// import it directly.

export const CLUB_HUB_TABS: Array<{
  key: ClubHubTabKey;
  label: string;
  mobileLabel: string;
  Icon: LucideIcon;
  // Equipo has zero real access for ADMIN today (team/page.tsx redirects
  // ADMIN away entirely) — never widen that just to fill a tab; hide it
  // outright instead of showing a tab that always 403s. Configuración is
  // OWNER-only for the same reason: an ADMIN operates the club day to day
  // but never owns its configuration (hours, pricing, location, sport
  // defaults) — see CLAUDE.md → Role Philosophy.
  ownerOnly?: boolean;
}> = [
  { key: "perfil_publico", label: "Perfil público", mobileLabel: "Perfil", Icon: Globe },
  { key: "noticias", label: "Noticias", mobileLabel: "Noticias", Icon: Megaphone },
  { key: "equipo", label: "Equipo", mobileLabel: "Equipo", Icon: ShieldCheck, ownerOnly: true },
  { key: "configuracion", label: "Configuración", mobileLabel: "Config", Icon: Settings, ownerOnly: true },
];

export function clubHubTabsForRole(role: "OWNER" | "ADMIN") {
  return CLUB_HUB_TABS.filter((tab) => !tab.ownerOnly || role === "OWNER");
}

// Server-side clamp — never trusts a client-supplied tab for a capability
// the role doesn't actually have (Equipo/Configuración, both OWNER-only).
// An ADMIN requesting ?tab=equipo or ?tab=configuracion directly (typed
// URL, stale bookmark, etc.) falls back to the default view instead of
// rendering that content — the same rule the tab bar's own filtering
// already implies, just enforced again here so it can never be bypassed
// by skipping the UI.
export function resolveClubHubTab(raw: string | undefined, role: "OWNER" | "ADMIN"): ClubHubTabKey {
  if (raw === "equipo" || raw === "configuracion") return role === "OWNER" ? raw : "perfil_publico";
  if (raw === "noticias") return raw;
  return "perfil_publico";
}
