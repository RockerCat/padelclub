"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, CardContent, Input } from "@/components/ui";
import { Mail, ArrowRight } from "lucide-react";

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
}

export function SignupForm({ inviteToken, branding }: SignupFormProps) {
  const router = useRouter();

  const [fullName, setFullName]             = useState("");
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
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

    setLoading(true);

    try {
      const supabase  = createClient();
      const redirectTo = inviteToken
        ? `${window.location.origin}/auth/callback?next=/invite/${inviteToken}`
        : undefined;

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
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
                href={inviteToken ? `/auth/login?next=/invite/${inviteToken}` : "/auth/login"}
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

      // Session present → email confirmation disabled, user is active immediately
      if (data.session) {
        router.push("/clubs?welcome=1");
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
                href={inviteToken ? `/auth/login?next=/invite/${inviteToken}` : "/auth/login"}
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
            href={inviteToken ? `/auth/login?next=/invite/${inviteToken}` : "/auth/login"}
            className="text-brand-primary hover:underline font-medium"
          >
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
