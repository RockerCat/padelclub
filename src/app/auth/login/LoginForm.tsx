"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveClubEntryPath } from "@/lib/utils/navigation";
import { checkProfileIsPlatformAdmin } from "@/lib/platformAdminQuery";
import { getSafeInternalPath } from "@/lib/utils/safeRedirect";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, CardContent, Input } from "@/components/ui";
import { BrandLogo } from "@/components/layout/BrandLogo";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeInternalPath(searchParams.get("next"));
  const message = searchParams.get("message");
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    if (urlError === "access_denied" || urlError === "otp_expired") {
      return "El enlace de confirmación expiró o ya no es válido. Intenta crear tu cuenta de nuevo.";
    }
    if (message === "error") {
      return "Hubo un error al iniciar sesión. Por favor, intenta de nuevo.";
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (
          authError.message.includes("Invalid login credentials") ||
          authError.message.includes("invalid_credentials")
        ) {
          setError("Correo o contraseña incorrectos.");
        } else if (authError.message.includes("Email not confirmed")) {
          setError("Por favor confirma tu correo electrónico antes de entrar.");
        } else {
          setError("Error al iniciar sesión. Por favor, intenta de nuevo.");
        }
        return;
      }

      // If a ?next= param is present, go there directly
      if (next) {
        router.push(next);
        return;
      }

      // Get the logged-in user's id to determine destination
      const { data: { user } } = await supabase.auth.getUser();

      // Platform admins land on /platform instead of the club selector —
      // this is orthogonal to club_members.role, so it takes priority over
      // (and skips) the membership-based branching below.
      if (await checkProfileIsPlatformAdmin(supabase, user!.id)) {
        router.push("/platform");
        return;
      }

      // Single point of decision (shared with the auth callback route) —
      // 0 clubs → /clubs; 1 club → straight there; 2+ clubs → last_club_id
      // if it still points at an active membership, otherwise /clubs.
      router.push(await resolveClubEntryPath(supabase, user!.id));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <BrandLogo size="md" className="justify-center" />
        <p className="text-brand-muted text-sm mt-2">Accede a tu club</p>
      </div>

      <Card variant="elevated">
        <CardHeader>
          <h1 className="text-xl font-bold text-white">Iniciar sesión</h1>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              required
              autoComplete="current-password"
            />

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <Button
              type="submit"
              loading={loading}
              size="lg"
              className="w-full mt-2"
            >
              Entrar
            </Button>
          </form>

          <p className="text-center text-sm text-brand-muted mt-6">
            ¿No tienes cuenta?{" "}
            <Link
              href="/auth/signup"
              className="text-brand-primary hover:underline font-medium"
            >
              Regístrate
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
