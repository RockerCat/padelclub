"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { User, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

// Single "Registrarme" CTA, used everywhere the landing/marketing chrome
// used to link straight to "Crear mi club" (Navbar, Hero, Audience's
// closing CTA) — never three separate copies of this same session check.
// Opens a small menu with exactly two options, each reusing an existing,
// unmodified flow:
//
// - "Como jugador" → the generic signup form, with an explicit
//   `next=/clubs` so it lands straight on the club explorer — never
//   SignupForm's own "/clubs?welcome=1" default, which is styled as the
//   OWNER "crea tu primer club" onboarding and must never be shown to a
//   PLAYER-intent signup (see CLAUDE.md → Role Philosophy: the account has
//   no type yet at this point, but the entry point already knows the
//   intent is PLAYER).
// - "Propietario de club" → the exact same signup form, but with
//   `next=/clubs/create` — SignupForm/`/auth/callback` already support an
//   explicit `next` to skip the generic welcome screen (see SignupForm's
//   own docstring: "where to land after signup/confirmation, instead of
//   the generic welcome screen"); this only supplies that existing,
//   already-safe (getSafeInternalPath allows any in-app path) parameter,
//   it does not add a new mechanism.
//
// When a session already exists (mirrors the exact check the old Navbar
// CTA used to run itself), both options skip signup entirely and go
// straight to the real destination (/clubs, /clubs/create) — same logic,
// now centralized here instead of duplicated per caller.
interface RegisterMenuProps {
  triggerContent: React.ReactNode;
  triggerClassName: string;
  align?: "left" | "right";
}

const SIGNUP_PLAYER_HREF = `/auth/signup?next=${encodeURIComponent("/clubs")}`;
const SIGNUP_OWNER_HREF = `/auth/signup?next=${encodeURIComponent("/clubs/create")}`;

export function RegisterMenu({ triggerContent, triggerClassName, align = "left" }: RegisterMenuProps) {
  const [open, setOpen] = useState(false);
  const [playerHref, setPlayerHref] = useState(SIGNUP_PLAYER_HREF);
  const [ownerHref, setOwnerHref] = useState(SIGNUP_OWNER_HREF);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPlayerHref("/clubs");
        setOwnerHref("/clubs/create");
      }
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName}
      >
        {triggerContent}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Registrarme"
          className={cn(
            "absolute top-full mt-2 z-50 w-72 max-w-[85vw] rounded-xl border border-white/15 bg-brand-surface shadow-2xl shadow-black/40 overflow-hidden py-1",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <Link
            href={playerHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors focus:outline-none focus-visible:bg-white/5"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/15">
              <User className="h-4 w-4 text-brand-primary" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Como jugador</p>
              <p className="text-xs text-brand-muted leading-snug mt-0.5">
                Reserva canchas, sigue tu ranking y participa en torneos.
              </p>
            </div>
          </Link>

          <div className="h-px bg-white/10 mx-2" />

          <Link
            href={ownerHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors focus:outline-none focus-visible:bg-white/5"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary/15">
              <Building2 className="h-4 w-4 text-brand-secondary" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Propietario de club</p>
              <p className="text-xs text-brand-muted leading-snug mt-0.5">
                Crea tu club y empieza a gestionarlo hoy mismo.
              </p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
