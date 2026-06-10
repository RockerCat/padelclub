"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, CardContent, Input } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const message = searchParams.get("message");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    message === "error"
      ? "Hubo un error al iniciar sesión. Por favor, intenta de nuevo."
      : null
  );
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

      // Get the logged-in user's id to filter only their own memberships
      const { data: { user } } = await supabase.auth.getUser();

      const { data: memberships } = await supabase
        .from("club_members")
        .select("role, clubs!inner(slug)")
        .eq("profile_id", user!.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: true })
        .limit(1);

      if (!memberships || memberships.length === 0) {
        router.push("/onboarding");
        return;
      }

      const first = memberships[0];
      const club = first.clubs as unknown as { slug: string };
      const slug = club.slug;
      const role = first.role;

      if (role === "OWNER") {
        router.push(`/${slug}/admin/settings`);
      } else {
        router.push(`/${slug}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-block">
          <span className="text-3xl font-black tracking-tight text-white">
            Padel<span className="text-brand-primary">Club</span>
          </span>
        </Link>
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
