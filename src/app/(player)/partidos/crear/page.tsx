import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isOpenMatchId, isOpenMatchLevel, listOpenMatchCities } from "@/lib/openMatches";
import { listPadelVenues } from "@/lib/directory";
import { getBogotaNow } from "@/lib/utils/bogotaDatetime";
import { CreateMatchClient } from "./CreateMatchClient";

export const metadata: Metadata = {
  title: "Crear partido | Mi Pádel Club",
  description: "Publica tu partido de pádel y consigue los jugadores que te faltan.",
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

interface Props {
  // lugar = id de un establecimiento del directorio ("Organizar partido aquí").
  searchParams: Promise<{ ciudad?: string; fecha?: string; nivel?: string; lugar?: string }>;
}

export default async function CreateMatchPage({ searchParams }: Props) {
  const { ciudad, fecha, nivel, lugar } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const qs = new URLSearchParams();
    if (ciudad) qs.set("ciudad", ciudad);
    if (fecha) qs.set("fecha", fecha);
    if (nivel) qs.set("nivel", nivel);
    if (lugar) qs.set("lugar", lugar);
    const back = `/partidos/crear${qs.size ? `?${qs}` : ""}`;
    redirect(`/auth/login?next=${encodeURIComponent(back)}`);
  }

  const today = getBogotaNow().dateStr;
  // Preselección desde el directorio: solo si la ficha sigue publicada y
  // está en esa ciudad (lectura pública; el servidor revalida al crear).
  const [cities, preVenues] = await Promise.all([
    listOpenMatchCities(supabase),
    lugar && isOpenMatchId(lugar) && ciudad
      ? listPadelVenues(supabase, { municipality: ciudad.slice(0, 60), limit: 100 }).then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);
  const preVenue = preVenues.find((v) => v.id === lugar) ?? null;
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= today ? fecha : addDays(today, 1);

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="mx-auto max-w-lg px-4 pt-6 pb-20 sm:pt-8">
        <Link href="/partidos" className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Partidos
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-white">Crear partido</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Publica cuándo y dónde quieres jugar. Compártelo por WhatsApp y los jugadores se unen solos.
        </p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-brand-surface p-4 sm:p-6">
          <CreateMatchClient
            citySuggestions={cities.map((c) => c.city)}
            initialVenue={
              preVenue
                ? { id: preVenue.id, name: preVenue.name, municipality: preVenue.municipality, address: preVenue.address, isPublished: true }
                : null
            }
            initial={{
              city: preVenue?.municipality ?? ciudad?.slice(0, 60) ?? "",
              matchDate: date,
              startTime: "19:00",
              level: nivel && isOpenMatchLevel(nivel) ? nivel : "cualquiera",
              venueName: "",
              venueId: preVenue?.id ?? null,
              comment: "",
              courtBooked: false,
              playersAlready: 1,
            }}
          />
        </div>
      </div>
    </div>
  );
}
