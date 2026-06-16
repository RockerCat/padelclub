"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, ChevronRight, X } from "lucide-react";

interface Props {
  clubId: string;
  clubSlug: string;
  hasPublicPage: boolean;
  hasCourts: boolean;
  hasHours: boolean;
  hasMembers: boolean;
  hasReservations: boolean;
}

const DISMISSED_KEY = (id: string) => `padelclub_onboarding_dismissed_${id}`;

export function OnboardingChecklist({ clubId, clubSlug, hasPublicPage, hasCourts, hasHours, hasMembers, hasReservations }: Props) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(localStorage.getItem(DISMISSED_KEY(clubId)) === "1");
  }, [clubId]);

  const steps = [
    { label: "Personalizar página pública", done: hasPublicPage,    href: `/${clubSlug}/admin/settings` },
    { label: "Agregar primera cancha",      done: hasCourts,        href: `/${clubSlug}/admin/courts` },
    { label: "Configurar horarios",         done: hasHours,         href: `/${clubSlug}/admin/settings` },
    { label: "Invitar jugadores",           done: hasMembers,       href: `/${clubSlug}/admin/players` },
    { label: "Crear primera reserva",       done: hasReservations,  href: `/${clubSlug}/admin/reservations/new` },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone        = completedCount === steps.length;

  if (!mounted || dismissed || allDone) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY(clubId), "1");
    setDismissed(true);
  }

  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 mb-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Configura tu club</h2>
          <p className="text-xs text-brand-muted mt-0.5">Completa estos pasos para empezar a operar.</p>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Ocultar"
          className="text-brand-muted/40 hover:text-brand-muted transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-brand-muted">{completedCount} de {steps.length} completados</span>
          <span className="text-[11px] font-semibold" style={{ color: "var(--club-primary)" }}>{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, backgroundColor: "var(--club-primary)" }}
          />
        </div>
      </div>

      {/* Always-done: Club creado */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5">
        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-green-500/15">
          <Check className="w-3 h-3 text-green-400" />
        </div>
        <span className="text-sm text-brand-muted/50 line-through">Club creado</span>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-0.5">
        {steps.map((step, i) =>
          step.done ? (
            <div key={step.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-green-500/15">
                <Check className="w-3 h-3 text-green-400" />
              </div>
              <span className="text-sm text-brand-muted/50 line-through">{step.label}</span>
            </div>
          ) : (
            <Link
              key={step.label}
              href={step.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group"
            >
              <div
                className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 text-[10px] font-bold"
                style={{
                  borderColor: "color-mix(in srgb, var(--club-primary) 40%, transparent)",
                  color: "var(--club-primary)",
                }}
              >
                {i + 1}
              </div>
              <span className="text-sm text-white flex-1">{step.label}</span>
              <ChevronRight className="w-4 h-4 text-brand-muted/30 group-hover:text-brand-muted transition-colors shrink-0" />
            </Link>
          )
        )}
      </div>

    </div>
  );
}
