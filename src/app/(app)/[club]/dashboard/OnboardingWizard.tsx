"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, X, PartyPopper } from "lucide-react";
import { Step1Identity, type Step1Club } from "./onboarding/Step1Identity";
import { Step2Location, type Step2LocationClub } from "./onboarding/Step2Location";
import { Step4Operations } from "./onboarding/Step4Operations";
import { Step5Court } from "./onboarding/Step5Court";
import type { OperatingHour } from "@/lib/operatingHours";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardClub = Step1Club &
  Step2LocationClub & {
    slug: string;
    allowed_reservation_durations: number[];
  };

interface OnboardingWizardProps {
  club: WizardClub;
  initialHours: OperatingHour[];
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
  step4Done: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DISMISSED_KEY = (id: string) => `padelclub_onboarding_dismissed_v2_${id}`;
const TOTAL_STEPS = 4;
const COMPLETE_STEP = TOTAL_STEPS + 1;
const ONBOARDING_PARAMS = ["new", "setupStep", "setupComplete"];

const STEPS = [
  { title: "Perfil público del club",    subtitle: "Descripción, visibilidad y redes sociales." },
  { title: "Ubicación del club",         subtitle: "Ciudad, departamento, país y dirección." },
  { title: "Configura la operación",     subtitle: "Horarios de apertura y duraciones permitidas." },
  { title: "Agrega tu primera cancha",   subtitle: "Infraestructura mínima para recibir reservas." },
] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export function OnboardingWizard({
  club,
  initialHours,
  step1Done,
  step2Done,
  step3Done,
  step4Done,
}: OnboardingWizardProps) {
  const doneArr = [step1Done, step2Done, step3Done, step4Done];
  const completedCount = doneArr.filter(Boolean).length;
  const firstIncompleteIndex = doneArr.findIndex((d) => !d);
  const firstIncompleteStep = firstIncompleteIndex === -1 ? null : firstIncompleteIndex + 1;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  // Reads localStorage (unavailable during SSR) once on mount. This is the
  // documented, justified use of setState-in-effect: syncing React state with
  // an external system that React itself has no other way to observe.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const wasDismissed = localStorage.getItem(DISMISSED_KEY(club.id)) === "1";
    setDismissed(wasDismissed);
  }, [club.id]);

  // Body scroll lock + Escape-to-close for the "configurar más tarde" confirmation modal.
  useEffect(() => {
    if (!showSkipConfirm) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSkipConfirm(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showSkipConfirm]);

  // ─── Derive whether to show the full wizard from the URL — no local state,
  // no effect: the step shown always matches the URL, including Back/Forward. ──
  const isNew = searchParams.get("new") === "1";
  const setupComplete = searchParams.get("setupComplete") === "1";
  const rawSetupStep = searchParams.get("setupStep");
  const parsedSetupStep = rawSetupStep ? Number(rawSetupStep) : NaN;
  const validSetupStep =
    Number.isInteger(parsedSetupStep) && parsedSetupStep >= 1 && parsedSetupStep <= TOTAL_STEPS
      ? parsedSetupStep
      : null;
  const showFullWizard = isNew || validSetupStep !== null || setupComplete;
  const effectiveStep = setupComplete
    ? COMPLETE_STEP
    : validSetupStep ?? firstIncompleteStep ?? COMPLETE_STEP;

  const clearOnboardingParams = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ONBOARDING_PARAMS) params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY(club.id), "1");
    setDismissed(true);
    clearOnboardingParams();
  }, [club.id, clearOnboardingParams]);

  const handleContinueSetup = useCallback(() => {
    if (firstIncompleteStep === null) return;
    router.push(`${pathname}?setupStep=${firstIncompleteStep}`, { scroll: false });
  }, [firstIncompleteStep, pathname, router]);

  // COMPLETE_STEP is the completion screen — keep setupStep at the last real
  // step in the URL alongside setupComplete=1 so browser Back lands back on
  // that step instead of a blank query.
  const navigateToStep = useCallback((step: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (step === COMPLETE_STEP) {
      params.set("setupStep", String(TOTAL_STEPS));
      params.set("setupComplete", "1");
    } else {
      params.set("setupStep", String(step));
      params.delete("setupComplete");
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const goNext = useCallback((step: number) => {
    navigateToStep(step < TOTAL_STEPS ? step + 1 : COMPLETE_STEP);
  }, [navigateToStep]);

  const goPrev = useCallback((step: number) => {
    navigateToStep(step - 1);
  }, [navigateToStep]);

  if (!mounted) return null;

  // ─── Full wizard: only when explicitly requested via URL ─────────────────────
  if (showFullWizard) {
    // ─── Completion view ─────────────────────────────────────────────────────
    if (effectiveStep === COMPLETE_STEP) {
      return (
        <div className="mb-8">
          <div className="flex items-start gap-4 rounded-2xl border border-green-500/20 bg-green-500/5 px-5 py-5 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-500/15 shrink-0">
              <PartyPopper className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-white">
                ¡Tu club está listo para comenzar!
              </p>
              <p className="text-sm text-brand-muted/70 mt-1">
                Completaste la configuración inicial de tu club. Encontrarás los próximos pasos
                recomendados más abajo, en tu Dashboard.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-full h-10 rounded-xl border border-white/10 text-sm text-brand-muted hover:text-white hover:border-white/20 transition-colors"
          >
            Cerrar
          </button>
        </div>
      );
    }

    // ─── Wizard step view ─────────────────────────────────────────────────────
    const isLastStep = effectiveStep === TOTAL_STEPS;
    const stepNeedsForm =
      effectiveStep === 1 ||
      effectiveStep === 2 ||
      (effectiveStep === 4 && !step4Done);
    const formId = `onboarding-step-${effectiveStep}`;
    const stepData = STEPS[effectiveStep - 1];

    return (
      <div className="mb-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Configura tu club</h2>
            <p className="text-xs text-brand-muted/70 mt-0.5">
              Estos pasos te ayudarán a personalizar tu club. Puedes completarlos ahora o más adelante.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Ocultar onboarding"
            className="text-brand-muted/30 hover:text-brand-muted transition-colors shrink-0 mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center mb-3">
          {[1, 2, 3, 4].map((step, i) => (
            <Fragment key={step}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all"
                style={
                  doneArr[step - 1]
                    ? { backgroundColor: "rgba(34,197,94,0.15)" }
                    : effectiveStep === step
                    ? {
                        border: "1px solid var(--club-primary, #B7E000)",
                        color: "var(--club-primary, #B7E000)",
                        backgroundColor:
                          "color-mix(in srgb, var(--club-primary, #B7E000) 10%, transparent)",
                      }
                    : { border: "1px solid rgba(255,255,255,0.15)", color: "#94A3B8" }
                }
              >
                {doneArr[step - 1] ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <span>{step}</span>
                )}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div
                  className="flex-1 h-px mx-1"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                />
              )}
            </Fragment>
          ))}
        </div>

        {/* Paso X de N + progress */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-brand-muted/60">Paso {effectiveStep} de {TOTAL_STEPS}</span>
            <span
              className="text-[11px] font-semibold"
              style={{ color: "var(--club-primary, #B7E000)" }}
            >
              {Math.round((completedCount / TOTAL_STEPS) * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round((completedCount / TOTAL_STEPS) * 100)}%`,
                backgroundColor: "var(--club-primary, #B7E000)",
              }}
            />
          </div>
        </div>

        {/* Step card */}
        <div className="rounded-2xl border border-white/10 bg-brand-surface overflow-hidden">
          {/* Step title */}
          <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
            <p className="text-sm font-semibold text-white">{stepData.title}</p>
            <p className="text-xs text-brand-muted/60 mt-0.5">{stepData.subtitle}</p>
          </div>

          {/* Step content */}
          <div className="px-5 py-5">
            {effectiveStep === 1 && (
              <Step1Identity club={club} formId={formId} onNext={() => goNext(1)} />
            )}
            {effectiveStep === 2 && (
              <Step2Location club={club} formId={formId} onNext={() => goNext(2)} />
            )}
            {effectiveStep === 3 && (
              <Step4Operations
                clubId={club.id}
                initialHours={initialHours}
                allowedDurations={club.allowed_reservation_durations}
              />
            )}
            {effectiveStep === 4 && (
              <Step5Court
                clubId={club.id}
                clubSlug={club.slug}
                formId={formId}
                alreadyHasCourt={step4Done}
                onNext={() => goNext(4)}
              />
            )}
          </div>

          {/* Operation step save reminder — real validation, not just hint text */}
          {effectiveStep === 3 && !step3Done && (
            <div className="px-5 -mt-3 mb-4">
              <p className="text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/15 rounded-xl px-3 py-2.5">
                Guarda los horarios y las duraciones antes de continuar.
              </p>
            </div>
          )}

          {/* Navigation bar */}
          <div className="px-5 py-4 border-t border-white/[0.06] flex items-center gap-3">
            {effectiveStep > 1 ? (
              <button
                type="button"
                onClick={() => goPrev(effectiveStep)}
                className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm text-brand-muted hover:text-white border border-white/10 hover:border-white/20 transition-colors shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
            ) : (
              <div className="shrink-0" />
            )}

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setShowSkipConfirm(true)}
              className="h-10 px-4 rounded-xl text-sm text-brand-muted/70 hover:text-white transition-colors shrink-0"
            >
              Configurar más tarde
            </button>

            {stepNeedsForm ? (
              <button
                type="submit"
                form={formId}
                className="h-10 px-5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 shrink-0"
                style={{ backgroundColor: "var(--club-primary, #B7E000)", color: "#001A24" }}
              >
                {isLastStep ? "Finalizar" : "Guardar y continuar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goNext(effectiveStep)}
                disabled={effectiveStep === 3 && !step3Done}
                className="h-10 px-5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
                style={{ backgroundColor: "var(--club-primary, #B7E000)", color: "#001A24" }}
              >
                {effectiveStep === 3 ? "Continuar" : "Finalizar"}
              </button>
            )}
          </div>
        </div>

        {/* "Configurar más tarde" confirmation modal */}
        {showSkipConfirm && (
          <>
            <div
              className="fixed inset-0 z-[400] bg-black/60"
              onClick={() => setShowSkipConfirm(false)}
            />
            <div className="fixed inset-0 z-[401] flex items-center justify-center px-4">
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#082735] p-6">
                <p className="text-base font-bold text-white">¿Deseas continuar más tarde?</p>
                <p className="text-sm text-brand-muted/70 mt-2">
                  Puedes empezar a usar MiPadelClub ahora mismo.
                </p>
                <p className="text-sm text-brand-muted/70 mt-2">
                  La información que estás omitiendo podrá completarse más adelante desde el
                  Dashboard o desde Configuración.
                </p>

                <div className="flex flex-col gap-2 mt-5">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="h-10 px-5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
                    style={{ backgroundColor: "var(--club-primary, #B7E000)", color: "#001A24" }}
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSkipConfirm(false)}
                    className="h-10 px-5 rounded-xl text-sm text-brand-muted hover:text-white border border-white/10 hover:border-white/20 transition-colors"
                  >
                    Seguir configurando
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── No trigger params: dashboard stays primary ──────────────────────────────
  if (dismissed || firstIncompleteStep === null) return null;

  // ─── Compact reminder — club incomplete, wizard not explicitly requested ─────
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-white/10 bg-brand-surface px-5 py-4">
      <div>
        <p className="text-sm font-semibold text-white">Termina de configurar tu club</p>
        <p className="text-xs text-brand-muted/70 mt-0.5">
          Puedes completar estos pasos cuando quieras.
        </p>
      </div>
      <button
        type="button"
        onClick={handleContinueSetup}
        className="h-9 px-4 rounded-xl text-sm font-semibold whitespace-nowrap transition-all hover:brightness-110 shrink-0"
        style={{ backgroundColor: "var(--club-primary, #B7E000)", color: "#001A24" }}
      >
        Continuar configuración
      </button>
    </div>
  );
}
