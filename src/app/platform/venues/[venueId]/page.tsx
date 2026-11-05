import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { isOpenMatchId } from "@/lib/openMatches";
import { platformGetPadelVenue, venueStatusLabel, venueToFormValues } from "@/lib/directory";
import type { PlatformClubRow } from "../../clubs/PlatformClubsTable";
import { VenueForm } from "../VenueForm";
import { VenueAdminActions } from "./VenueAdminActions";

interface Props {
  params: Promise<{ venueId: string }>;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function PlatformVenueDetailPage({ params }: Props) {
  const { venueId } = await params;
  if (!isOpenMatchId(venueId)) notFound();

  const supabase = await createClient();
  const [{ data: venue, error }, { data: clubsData }] = await Promise.all([
    platformGetPadelVenue(supabase, venueId),
    supabase.rpc("get_platform_clubs_overview"),
  ]);
  if (error) throw new Error(error.message);
  if (!venue) notFound();
  // Mismo cast angosto documentado en /platform/clubs/page.tsx.
  const clubs = ((clubsData ?? []) as unknown as PlatformClubRow[]).map((c) => ({ id: c.id, name: c.name, slug: c.slug }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
      <Link href="/platform/venues" className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" />
        Directorio
      </Link>

      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h1 className="text-xl font-bold text-white break-words">{venue.name}</h1>
        <Badge variant={venue.status === "published" ? "success" : venue.status === "draft" ? "warning" : "default"} size="sm">
          {venueStatusLabel(venue.status)}
        </Badge>
      </div>
      <p className="text-sm text-brand-muted">
        {venue.municipality}, {venue.department}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-brand-surface p-4 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-brand-muted">Fuente</dt>
          <dd className="text-white break-words">
            {venue.sourceLabel ?? "—"}
            {venue.sourceUrl && (
              <a href={venue.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex text-brand-primary" aria-label="Abrir fuente">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-brand-muted">Verificado</dt>
          <dd className="text-white">{formatDate(venue.verifiedAt)}</dd>
        </div>
        <div>
          <dt className="text-brand-muted">Publicado desde</dt>
          <dd className="text-white">{formatDate(venue.publishedAt)}</dd>
        </div>
        <div>
          <dt className="text-brand-muted">Partidos que lo usan</dt>
          <dd className="text-white tabular-nums">{venue.matchCount}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <VenueAdminActions venue={venue} clubs={clubs} />
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-brand-surface p-4 sm:p-6">
        <VenueForm venueId={venue.id} initial={venueToFormValues(venue)} />
      </div>
    </div>
  );
}
