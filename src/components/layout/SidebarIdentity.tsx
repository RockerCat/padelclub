import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { cn } from "@/lib/utils/cn";
import type { CommercialPillTone } from "../../../shared/commercial/lifecycle";

// Comercial v2 — pill de estado comercial permanente, opcional y solo para
// el OWNER real (nunca ADMIN/PLAYER/SUPERADMIN con acceso elevado): ese
// gate lo decide el caller (ver src/app/(app)/[club]/layout.tsx), este
// componente solo renderiza lo que recibe. Distinto de los banners
// comerciales existentes (alerta/CTA cuando el OWNER debe actuar) — el pill
// es "estado + acceso a /subscription", siempre visible mientras haya
// suscripción, y ninguno de los dos reemplaza al otro. Mismos 4 tonos que
// el Badge compartido (src/components/ui/Badge.tsx) y la misma asignación
// fase→tono que ya usa /[club]/subscription/page.tsx, para no inventar un
// segundo lenguaje visual para el mismo estado.
const PILL_TONE_CLASSES: Record<CommercialPillTone, string> = {
  default: "bg-white/10 text-white/70 border-white/10 hover:bg-white/15",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25",
  danger: "bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25",
};

export type SidebarSubscriptionPill = { label: string; href: string; tone: CommercialPillTone };

// The signed-in person, shown once near "Mi Perfil"/"Salir" at the bottom
// of the sidebar — deliberately separate from ClubHeader above it (which
// represents the club, never the user). Shared by AppNav (club sidebar,
// OWNER/ADMIN/PLAYER) and PlatformNav (SUPERADMIN) so this exists in one
// place, not two. Reuses PlayerAvatar as-is for the photo/initials circle —
// no new avatar system.
export function SidebarIdentity({
  name,
  email,
  roleLabel,
  avatarUrl,
  subscriptionPill,
}: {
  name: string;
  email: string | null;
  roleLabel: string;
  avatarUrl: string | null;
  /** Comercial v2, OWNER-only — PlatformNav (SUPERADMIN) never passes this. */
  subscriptionPill?: SidebarSubscriptionPill | null;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 rounded-xl bg-white/[0.03] border border-white/5">
      <PlayerAvatar player={{ full_name: name, avatar_url: avatarUrl }} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{name}</p>
        {/* Skipped when name already IS the email (no full_name on the
            profile) — showing the same string twice reads as broken, not
            as extra information. */}
        {email && email !== name && <p className="text-[11px] text-brand-muted/70 truncate">{email}</p>}
        <p className="text-[11px] text-brand-muted truncate">{roleLabel}</p>
        {subscriptionPill && (
          <Link
            href={subscriptionPill.href}
            className={cn(
              "mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-colors max-w-full",
              PILL_TONE_CLASSES[subscriptionPill.tone]
            )}
          >
            <span className="truncate">{subscriptionPill.label}</span>
            <ChevronRight className="w-2.5 h-2.5 shrink-0" />
          </Link>
        )}
      </div>
    </div>
  );
}
