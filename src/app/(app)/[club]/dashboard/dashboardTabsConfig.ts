import { CalendarClock, TrendingUp, Activity, Home, type LucideIcon } from "lucide-react";

// Plain config + pure logic — deliberately NOT a "use client" module, so it
// can be imported from page.tsx (Server Component) directly. Every export of
// a "use client" file becomes an opaque client reference when imported from
// server code, even pure functions — calling one throws at runtime. Keeping
// this shared piece client-free is what lets both page.tsx and the client
// DashboardTabs.tsx rely on the exact same tab list/resolution logic.
//
// Four views consolidate what used to be three separate screens (Dashboard,
// Estadísticas, Canchas) into one operational center — see CLAUDE.md "Club
// Identity" / dashboard reorganization block. "operacion" is the default
// (no ?tab= in the URL) so a bare /[club]/dashboard link keeps working.

export type DashboardTabKey = "operacion" | "rendimiento" | "actividad" | "canchas";

export const DASHBOARD_TABS: Array<{
  key: DashboardTabKey;
  label: string;
  mobileLabel: string;
  Icon: LucideIcon;
}> = [
  { key: "operacion", label: "Operación", mobileLabel: "Operación", Icon: CalendarClock },
  { key: "rendimiento", label: "Rendimiento", mobileLabel: "Rendimiento", Icon: TrendingUp },
  { key: "actividad", label: "Actividad reciente", mobileLabel: "Actividad", Icon: Activity },
  { key: "canchas", label: "Canchas", mobileLabel: "Canchas", Icon: Home },
];

export function resolveDashboardTab(raw: string | undefined): DashboardTabKey {
  return raw === "rendimiento" || raw === "actividad" || raw === "canchas" ? raw : "operacion";
}
