import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  OPEN_MATCH_LEVELS,
  isOpenMatchLevel,
  listOpenMatchCities,
  listOpenMatches,
  maxOpenMatchDate,
} from "@/lib/openMatches";
import { getBogotaNow } from "@/lib/utils/bogotaDatetime";
import { MatchCard } from "@/components/openMatches/MatchCard";

export const metadata: Metadata = {
  title: "Encuentra tu partido de pádel | Mi Pádel Club",
  description:
    "¿Te faltan jugadores? Encuentra partidos de pádel abiertos en tu ciudad o crea el tuyo y complétalo por WhatsApp. Gratis para jugadores.",
};

interface Props {
  searchParams: Promise<{ ciudad?: string; fecha?: string; nivel?: string; cupos?: string }>;
}

const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 [&>option]:bg-brand-surface";

// Descubrimiento público — funciona sin sesión y con cero clubes
// registrados. El filtro es un <form method="get">: sin JavaScript extra,
// y cada búsqueda queda en la URL (compartible, recargable).
export default async function OpenMatchesPage({ searchParams }: Props) {
  const params = await searchParams;
  const city = (params.ciudad ?? "").trim().slice(0, 60);
  const today = getBogotaNow().dateStr;
  const date = params.fecha && /^\d{4}-\d{2}-\d{2}$/.test(params.fecha) ? params.fecha : "";
  const level = params.nivel && isOpenMatchLevel(params.nivel) ? params.nivel : "";
  const spots = ["0", "1", "2", "3"].includes(params.cupos ?? "") ? Number(params.cupos) : 1;

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    matchesResult,
    cities,
  ] = await Promise.all([
    supabase.auth.getUser(),
    listOpenMatches(supabase, { city: city || null, date: date || null, level: level || null, minSpots: spots }),
    listOpenMatchCities(supabase),
  ]);

  const matches = matchesResult.data ?? [];
  const hasFilters = !!(city || date || level || spots !== 1);
  const createQs = new URLSearchParams();
  if (city) createQs.set("ciudad", city);
  if (date) createQs.set("fecha", date);
  if (level) createQs.set("nivel", level);
  const createHref = `/partidos/crear${createQs.size ? `?${createQs}` : ""}`;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:pt-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-brand-primary">Para jugadores · gratis</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Encuentra tu partido</h1>
          <p className="mt-2 max-w-xl text-brand-muted">
            Únete a un partido al que le faltan jugadores o crea el tuyo. No necesitas pertenecer a un club.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href={createHref}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 text-sm font-semibold text-brand-bg hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Crear partido
            </Link>
            {user && (
              <Link
                href="/partidos/mis-partidos"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/5"
              >
                <CalendarCheck className="h-4 w-4" /> Mis partidos
              </Link>
            )}
          </div>
        </header>

        <form method="get" className="mt-8 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-brand-surface p-4 sm:grid-cols-5">
          <div className="col-span-2 flex flex-col gap-1.5">
            <label htmlFor="f-city" className="text-xs font-medium text-white/70">Ciudad</label>
            <input
              id="f-city"
              name="ciudad"
              defaultValue={city}
              list="f-city-list"
              placeholder="Todas"
              maxLength={60}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white placeholder:text-brand-muted/60 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
            />
            <datalist id="f-city-list">
              {cities.map((c) => (
                <option key={c.city} value={c.city} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-date" className="text-xs font-medium text-white/70">Fecha</label>
            <input
              id="f-date"
              type="date"
              name="fecha"
              defaultValue={date}
              min={today}
              max={maxOpenMatchDate(today)}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-level" className="text-xs font-medium text-white/70">Nivel</label>
            <select id="f-level" name="nivel" defaultValue={level} className={selectClass}>
              <option value="">Todos</option>
              {OPEN_MATCH_LEVELS.filter((l) => l.value !== "cualquiera").map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-spots" className="text-xs font-medium text-white/70">Cupos</label>
            <select id="f-spots" name="cupos" defaultValue={String(spots)} className={selectClass}>
              <option value="1">Con cupo</option>
              <option value="2">2 o más</option>
              <option value="3">3 libres</option>
              <option value="0">Incluir completos</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-3 sm:col-span-5">
            <button
              type="submit"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-brand-primary/40 bg-brand-primary/10 px-4 text-sm font-semibold text-brand-primary hover:bg-brand-primary/20 sm:flex-none"
            >
              <Search className="h-4 w-4" /> Buscar
            </button>
            {hasFilters && (
              <Link href="/partidos" className="text-sm text-brand-muted hover:text-white">
                Limpiar filtros
              </Link>
            )}
          </div>
        </form>

        <section className="mt-6" aria-live="polite">
          {matchesResult.error ? (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              No pudimos cargar los partidos. Recarga la página para intentarlo de nuevo.
            </p>
          ) : matches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
              <p className="text-base font-semibold text-white">
                {hasFilters ? "No hay partidos con esos filtros" : "Aún no hay partidos abiertos"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-brand-muted">
                {city
                  ? `Sé el primero en armar uno en ${city}: publícalo y compártelo por WhatsApp.`
                  : "Crea el tuyo en un minuto y compártelo por WhatsApp para completar los cuatro."}
              </p>
              <Link
                href={createHref}
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 text-sm font-semibold text-brand-bg hover:brightness-110"
              >
                <Plus className="h-4 w-4" /> Crear partido
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-brand-muted">
                {matches.length === 1 ? "1 partido" : `${matches.length} partidos`}
                {city ? ` en ${city}` : ""}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {matches.map((m) => (
                  <li key={m.id}>
                    <MatchCard match={m} today={today} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
