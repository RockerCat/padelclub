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
  // outright instead of showing a tab that always 403s.
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
// the role doesn't actually have (Equipo, OWNER-only). An ADMIN requesting
// ?tab=equipo falls back to the default view instead of a 403 page, same
// spirit as the historical-route redirect rule below.
export function resolveClubHubTab(raw: string | undefined, role: "OWNER" | "ADMIN"): ClubHubTabKey {
  if (raw === "equipo") return role === "OWNER" ? "equipo" : "perfil_publico";
  if (raw === "noticias" || raw === "configuracion") return raw;
  return "perfil_publico";
}
