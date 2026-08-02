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
  // outright instead of showing a tab that always 403s. Configuración used
  // to be OWNER-only for the same reason, but real club operation showed
  // ADMIN also needs it day to day (horarios, tarifas, cierre puntual) —
  // it's now available to both, with only the OWNER-only actions inside it
  // (Archivar club) still gated per-section. See CLAUDE.md → Role Philosophy.
  ownerOnly?: boolean;
}> = [
  { key: "perfil_publico", label: "Perfil público", mobileLabel: "Perfil", Icon: Globe },
  { key: "noticias", label: "Noticias", mobileLabel: "Noticias", Icon: Megaphone },
  { key: "equipo", label: "Equipo", mobileLabel: "Equipo", Icon: ShieldCheck, ownerOnly: true },
  { key: "configuracion", label: "Configuración", mobileLabel: "Config", Icon: Settings },
];

export function clubHubTabsForRole(role: "OWNER" | "ADMIN") {
  return CLUB_HUB_TABS.filter((tab) => !tab.ownerOnly || role === "OWNER");
}

// Server-side clamp — never trusts a client-supplied tab for a capability
// the role doesn't actually have (Equipo, still OWNER-only). An ADMIN
// requesting ?tab=equipo directly (typed URL, stale bookmark, etc.) falls
// back to the default view instead of rendering that content — the same
// rule the tab bar's own filtering already implies, just enforced again
// here so it can never be bypassed by skipping the UI. Configuración is now
// valid for both roles — the section-level OWNER-only gating (Archivar
// club) lives inside SettingsModules itself, not here.
export function resolveClubHubTab(raw: string | undefined, role: "OWNER" | "ADMIN"): ClubHubTabKey {
  if (raw === "equipo") return role === "OWNER" ? raw : "perfil_publico";
  if (raw === "noticias" || raw === "configuracion") return raw;
  return "perfil_publico";
}
