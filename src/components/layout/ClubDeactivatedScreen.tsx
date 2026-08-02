import Link from "next/link";
import { PowerOff } from "lucide-react";

// Rendered by [club]/layout.tsx in place of {children} when clubs.is_active
// is false (SUPERADMIN "Desactivar club") — identical for OWNER, ADMIN and
// PLAYER, per spec. Never an error: no data was deleted, the club can be
// reactivated later. Same visual language as /unauthorized and /not-found
// (centered card, logo, icon-in-rounded-box, heading, paragraph, single
// CTA), amber tone to match this club shell's own existing "archived"
// banner convention — distinct from unauthorized's red (no permission) and
// not-found's brand-primary (doesn't exist).
export function ClubDeactivatedScreen() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="inline-block mb-10">
          <span className="text-3xl font-black tracking-tight text-white">
            <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>Padel<span className="text-brand-primary">Club</span>
          </span>
        </Link>

        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
            <PowerOff className="h-8 w-8 text-amber-400" strokeWidth={1.5} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          Este club se encuentra desactivado por la plataforma.
        </h1>
        <p className="text-brand-muted text-sm mb-8">
          No se ha eliminado ninguna información. Vuelve a intentarlo más adelante.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center h-12 px-6 text-base font-medium rounded-xl bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95 transition-all duration-200 w-full"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
