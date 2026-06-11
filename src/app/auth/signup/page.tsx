"use client";

import { Suspense, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, CardContent, Input } from "@/components/ui";
import { Mail } from "lucide-react";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ReactNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const redirectTo = inviteToken
        ? `${window.location.origin}/auth/callback?next=/invite/${inviteToken}`
        : undefined;

      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });

      if (authError) {
        if (authError.message.includes("User already registered")) {
          setError(
            <>
              Este correo ya tiene una cuenta.{" "}
              <Link
                href={
                  inviteToken
                    ? `/auth/login?next=/invite/${inviteToken}`
                    : "/auth/login?next=/clubs/create"
                }
                className="text-brand-primary hover:underline font-medium"
              >
                Inicia sesión para continuar.
              </Link>
            </>
          );
        } else if (authError.message.includes("Invalid email")) {
          setError("El correo electrónico no es válido.");
        } else if (authError.message.includes("Password should be")) {
          setError("La contraseña debe tener al menos 6 caracteres.");
        } else {
          setError(authError.message || "Error al crear la cuenta. Por favor, intenta de nuevo.");
        }
        return;
      }

      if (inviteToken) {
        // Show verification pending state — do NOT route away
        setVerificationSent(true);
      } else {
        router.push("/onboarding");
      }
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

  if (verificationSent) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <span className="text-3xl font-black tracking-tight text-white">
                Padel<span className="text-brand-primary">Club</span>
              </span>
            </Link>
          </div>
          <Card variant="elevated">
            <CardContent className="pt-8 pb-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-brand-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white mb-1">Revisa tu correo</h1>
                  <p className="text-sm text-brand-muted">
                    Te enviamos un enlace de confirmación a{" "}
                    <span className="text-white font-medium">{email}</span>.
                  </p>
                  <p className="text-sm text-brand-muted mt-2">
                    Haz clic en el enlace para confirmar tu cuenta y unirte al club.
                  </p>
                </div>
                <p className="text-xs text-brand-muted/60 mt-2">
                  ¿No llegó?{" "}
                  <button
                    onClick={() => setVerificationSent(false)}
                    className="text-brand-primary hover:underline"
                  >
                    Intenta de nuevo
                  </button>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-3xl font-black tracking-tight text-white">
              Padel<span className="text-brand-primary">Club</span>
            </span>
          </Link>
          <p className="text-brand-muted text-sm mt-2">
            {inviteToken ? "Crea tu cuenta para unirte" : "Crea tu cuenta"}
          </p>
        </div>

        <Card variant="elevated">
          <CardHeader>
            <h1 className="text-xl font-bold text-white">Crear cuenta</h1>
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
                href={
                  inviteToken
                    ? `/auth/login?next=/invite/${inviteToken}`
                    : "/auth/login?next=/clubs/create"
                }
                className="text-brand-primary hover:underline font-medium"
              >
                {inviteToken ? "Inicia sesión" : "Inicia sesión para crear otro club"}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
