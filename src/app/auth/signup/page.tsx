"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, CardContent, Input } from "@/components/ui";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          setError("Ya existe una cuenta con este correo. ¿Quieres iniciar sesión?");
        } else if (authError.message.includes("Invalid email")) {
          setError("El correo electrónico no es válido.");
        } else if (authError.message.includes("Password should be")) {
          setError("La contraseña debe tener al menos 6 caracteres.");
        } else {
          setError("Error al crear la cuenta. Por favor, intenta de nuevo.");
        }
        return;
      }

      router.push(inviteToken ? `/invite/${inviteToken}` : "/onboarding");
    } finally {
      setLoading(false);
    }
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
                href={inviteToken ? `/auth/login?next=/invite/${inviteToken}` : "/auth/login"}
                className="text-brand-primary hover:underline font-medium"
              >
                Inicia sesión
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
