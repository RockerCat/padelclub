import Link from "next/link";
import { ShieldAlert } from "lucide-react";

// Persistent, discreet indicator that the current session is operating
// with SUPERADMIN elevated access (never a real club_members row) — never
// lets this read as the person actually being the club's OWNER. Rendered
// by [club]/layout.tsx only when isSuperadminAccess is true.
export function SuperadminAccessBanner({ clubId }: { clubId: string }) {
  return (
    <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm text-violet-300">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        Administrando como SUPERADMIN
      </div>
      <Link
        href={`/platform/clubs/${clubId}`}
        className="text-xs font-medium text-violet-300 hover:text-violet-200 transition-colors underline underline-offset-2 shrink-0"
      >
        Volver a Plataforma
      </Link>
    </div>
  );
}
