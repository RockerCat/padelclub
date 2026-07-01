import { CalendarClock, TrendingUp, Activity, type LucideIcon } from "lucide-react";

// Plain config + pure logic — deliberately NOT a "use client" module, so it
// can be imported from page.tsx (Server Component) directly. Every export of
// a "use client" file becomes an opaque client reference when imported from
// server code, even pure functions — calling one throws at runtime. Keeping
// this shared piece client-free is what lets both page.tsx and the client
// DashboardTabs.tsx rely on the exact same tab list/resolution logic.

export type DashboardTabKey = "proxima" | "historico" | "actividad";

export const DASHBOARD_TABS: Array<{
  key: DashboardTabKey;
  label: string;
  mobileLabel: string;
  Icon: LucideIcon;
}> = [
  { key: "proxima", label: "Operación Próxima", mobileLabel: "Próxima", Icon: CalendarClock },
  { key: "historico", label: "Rendimiento Histórico", mobileLabel: "Histórico", Icon: TrendingUp },
  { key: "actividad", label: "Actividad Reciente", mobileLabel: "Actividad", Icon: Activity },
];

export function resolveDashboardTab(raw: string | undefined): DashboardTabKey {
  return raw === "historico" || raw === "actividad" ? raw : "proxima";
}
