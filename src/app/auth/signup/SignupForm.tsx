"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, CardContent, Input } from "@/components/ui";
import { Mail, ArrowRight } from "lucide-react";
import { getSafeInternalPath } from "@/lib/utils/safeRedirect";
import { normalizePhone, isValidPhone } from "@/lib/utils/phone";

export type InviteBranding = {
  clubName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  roleLabel: string;
};

interface SignupFormProps {
  inviteToken?: string;
  branding?: InviteBranding | null;
  /** e.g. "/alex-club-padel?intent=join-club" — where to land after signup/confirmation, instead of the generic "Crear mi club" welcome screen. Ignored (and the generic flow used) if not a safe in-app path. */
  next?: string;
}

export function SignupForm({ inviteToken, branding, next: rawNext }: SignupFormProps) {
  const router = useRouter();
  const next = getSafeInternalPath(rawNext);
  // inviteToken keeps its own dedicated redirect target (unchanged
  // behavior); next is the generic case this story adds — a plain
  // "/auth/login?next=..." link, same shape either way.
  const loginHref = inviteToken
    ? `/auth/login?next=${encodeURIComponent(`/invite/${inviteToken}`)}`
    : next
      ? `/auth/login?next=${encodeURIComponent(next)}`
      : "/auth/login";

  // El único momento, hoy, donde este formulario compartido (usado por
  // cualquier account_type todavía sin definir — ver Role Philosophy en
  // CLAUDE.md) sabe con certeza que la cuenta será PLAYER: llegó desde
  // "Unirme al club"/"Solicitar acceso" en la página pública de un club
  // (ClubPublicView → /auth/signup?next=<slug>?intent=join-club). La
  // invitación de ADMIN (inviteToken) nunca pasa por aquí. Un registro
  // genérico (sin invite ni next) sigue sin saber si será OWNER o PLAYER,
  // así que el WhatsApp no se pide ahí — se completará más tarde desde Mi
  // Perfil o por el backfill del administrador si hiciera falta.
  const requiresWhatsapp = !inviteToken && !!next && next.includes("intent=join-club");

  const [fullName, setFullName]             = useState("");
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [phone, setPhone]                   = useState("");
  const [error, setError]                   = useState<ReactNode | null>(null);
  const [loading, setLoading]               = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resendStatus, setResendStatus]     = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (requiresWhatsapp) {
      const trimmedPhone = phone.trim();
      if (!trimmedPhone) {
        setError("Ingresa tu número de WhatsApp.");
        return;
      }
      if (!isValidPhone(trimmedPhone)) {
        setError(
          normalizePhone(trimmedPhone).length < 10
            ? "Incluye el código de país."
            : "El número de WhatsApp no es válido."
        );
        return;
      }
    }

    setLoading(true);

    try {
      const supabase  = createClient();
      const redirectTo = inviteToken
        ? `${window.location.origin}/auth/callback?next=/invite/${inviteToken}`
        : next
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          : undefined;

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            ...(requiresWhatsapp ? { phone: normalizePhone(phone.trim()) } : {}),
            ...(branding
              ? { invite_club_name: branding.clubName, invite_role: branding.roleLabel }
              : {}),
          },
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });

      if (authError) {
        if (authError.message.includes("User already registered")) {
          setError(
            <>
              Este correo ya tiene una cuenta.{" "}
              <Link
                href={loginHref}
                className="text-brand-primary hover:underline font-medium"
              >
                Inicia sesión para continuar.
              </Link>
            </>
          );
        } else if (
          authError.message.toLowerCase().includes("rate limit") ||
          authError.message.toLowerCase().includes("too many requests")
        ) {
          setError("Hemos enviado muchos correos en poco tiempo. Espera unos minutos e intenta de nuevo.");
        } else if (authError.message.includes("Invalid email") || authError.message.includes("email_address_invalid")) {
          setError("El correo electrónico no es válido.");
        } else if (authError.message.includes("Password should be")) {
          setError("La contraseña debe tener al menos 6 caracteres.");
        } else if (authError.message.includes("signup_disabled")) {
          setError("El registro está deshabilitado temporalmente. Intenta más tarde.");
        } else {
          setError("Error al crear la cuenta. Por favor, intenta de nuevo.");
        }
        return;
      }

      // Session present → email confirmation disabled, user is active immediately.
      // An invite always wins (its own dedicated destination, /invite/<token>
      // — never lost here just because email confirmation happens to be off),
      // then next (e.g. returning to join a club), then the generic "Crear mi
      // club" welcome screen only when neither applies.
      if (data.session) {
        router.push(inviteToken ? `/invite/${inviteToken}` : next ?? "/clubs?welcome=1");
        return;
      }

      // No session → Supabase sent a confirmation email
      setVerificationSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
        setError("No se pudo conectar al servidor. Verifica tu conexión a internet.");
      } else {
        setError("Error inesperado. Por favor, intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendStatus("sending");
    try {
      const supabase = createClient();
      await supabase.auth.resend({ type: "signup", email });
      setResendStatus("sent");
    } catch {
      setResendStatus("idle");
    }
  }

  // ── Email confirmation screen ────────────────────────────────────────────────
  if (verificationSent) {
    return (
      <Card variant="elevated">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-12 h-12 rounded-2xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-brand-primary" />
            </div>

            <div>
              <h1 className="text-lg font-bold text-white mb-2">Revisa tu correo</h1>
              {branding ? (
                <p className="text-sm text-brand-muted">
                  Te enviamos un enlace para confirmar tu acceso como{" "}
                  <span className="text-white font-medium">{branding.roleLabel}</span>{" "}
                  de {branding.clubName} a{" "}
                  <span className="text-white font-medium">{email}</span>.
                </p>
              ) : (
                <p className="text-sm text-brand-muted">
                  Te enviamos un enlace de confirmación a{" "}
                  <span className="text-white font-medium">{email}</span>.
                  {" "}Después de confirmar podrás iniciar sesión y crear o unirte a clubes.
                </p>
              )}
            </div>

            {/* CTA: go to login */}
            {!branding && (
              <Link
                href={loginHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-brand-bg text-sm font-semibold hover:bg-brand-primary/90 transition-colors"
              >
                Ir a iniciar sesión
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}

            {/* Resend */}
            <div className="text-xs text-brand-muted/60">
              {resendStatus === "sent" ? (
                <span className="text-green-400">Correo reenviado.</span>
              ) : (
                <>
                  ¿No llegó?{" "}
                  <button
                    onClick={handleResend}
                    disabled={resendStatus === "sending"}
                    className="text-brand-primary hover:underline disabled:opacity-50"
                  >
                    {resendStatus === "sending" ? "Enviando..." : "Reenviar correo"}
                  </button>
                  {" · "}
                  <button
                    onClick={() => setVerificationSent(false)}
                    className="text-brand-primary hover:underline"
                  >
                    Cambiar correo
                  </button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Signup form ──────────────────────────────────────────────────────────────
  return (
    <Card variant="elevated">
      <CardHeader>
        <h1 className="text-xl font-bold text-white">Crear cuenta</h1>
        {branding ? (
          <p className="text-sm text-brand-muted mt-1">
            Crea tu cuenta para unirte como{" "}
            <span className="text-white font-medium">{branding.roleLabel}</span>.
          </p>
        ) : (
          <p className="text-sm text-brand-muted mt-1">
            Recibirás un correo para confirmar tu cuenta.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Nombre completo"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ana García"
            required
            autoComplete="name"
          />
          <Input
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            autoComplete="email"
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            hint="Mínimo 6 caracteres"
            required
            autoComplete="new-password"
          />

          {requiresWhatsapp && (
            <Input
              label="WhatsApp"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 317 367 2033"
              hint="Incluye el código de país. Ejemplo: +57 317 367 2033."
              required
              autoComplete="tel"
              inputMode="tel"
            />
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} size="lg" className="w-full mt-2">
            Crear cuenta
          </Button>
        </form>

        <p className="text-center text-sm text-brand-muted mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link
            href={loginHref}
            className="text-brand-primary hover:underline font-medium"
          >
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
