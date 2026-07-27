import { clubRoleLabel } from "@/lib/roleLabels";
import type { ProfileActiveMembership } from "@/lib/profileActivity";

// is_active = true only (get_my_profile_activity already filters this) —
// a departed/deactivated membership never appears here. No administrative
// action lives in this list — pure display.
export function MembershipsList({ memberships }: { memberships: ProfileActiveMembership[] }) {
  return (
    <div className="flex flex-col divide-y divide-white/[0.06]">
      {memberships.map((m, i) => (
        <div key={`${m.clubName}-${i}`} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{m.clubName}</p>
            <p className="text-xs text-brand-muted">{clubRoleLabel(m.role)} · Activa</p>
          </div>
          {m.archived && (
            <span className="text-[10px] font-medium bg-amber-400/10 border border-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-md shrink-0">
              Archivado
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
