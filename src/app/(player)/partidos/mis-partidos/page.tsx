import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listMyOpenMatches } from "@/lib/openMatches";
import { getBogotaNow } from "@/lib/utils/bogotaDatetime";
import { MatchCard } from "@/components/openMatches/MatchCard";

export const metadata: Metadata = {
  title: "Mis partidos | Mi Pádel Club",
};

// Partidos organizados por jugadores — distintos de las reservas de cancha
// de un club (/[club]/reservations), que nunca se mezclan aquí.
export default async function MyOpenMatchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent("/partidos/mis-partidos")}`);

  const { data, error } = await listMyOpenMatches(supabase);
  const matches = data ?? [];
  const today = getBogotaNow().dateStr;
  const upcoming = matches.filter((m) => m.phase === "open" || m.phase === "full");
  const past = matches.filter((m) => m.phase === "finished" || m.phase === "cancelled");

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:pt-8">
        <Link href="/partidos" className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Encuentra tu partido
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Mis partidos</h1>
            <p className="mt-1 text-sm text-brand-muted">
              Partidos que organizas o a los que te uniste. No son reservas de cancha de un club.
            </p>
          </div>
          <Link
            href="/partidos/crear"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-brand-bg hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> Crear partido
          </Link>
        </div>

        {error ? (
          <p className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            No pudimos cargar tus partidos. Recarga la página para intentarlo de nuevo.
          </p>
        ) : matches.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 p-8 text-center">
            <p className="font-semibold text-white">Todavía no tienes partidos</p>
            <p className="mt-1 text-sm text-brand-muted">Únete a uno abierto o crea el tuyo.</p>
            <Link href="/partidos" className="mt-4 inline-block text-sm font-semibold text-brand-primary hover:underline">
              Ver partidos abiertos →
            </Link>
          </div>
        ) : (
          <>
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-muted">Próximos</h2>
              {upcoming.length === 0 ? (
                <p className="text-sm text-brand-muted">No tienes partidos próximos.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {upcoming.map((m) => (
                    <li key={m.id}>
                      <MatchCard match={m} today={today} showViewerRole />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {past.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-muted">Anteriores y cancelados</h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {past.map((m) => (
                    <li key={m.id}>
                      <MatchCard match={m} today={today} showViewerRole />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
