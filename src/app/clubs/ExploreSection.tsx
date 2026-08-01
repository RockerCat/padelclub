"use client";

import { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Search, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { getClubEntryPath } from "@/lib/utils/navigation";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";
import { clubRoleLabel } from "@/lib/roleLabels";
import { Badge, FilterDropdown } from "@/components/ui";
import { RegisterMenu } from "@/components/features/marketing/RegisterMenu";

const ClubsMap = dynamic(() => import("./ClubsMap").then((m) => m.ClubsMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
  ),
});

export type DirectoryClub = {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  city: string | null;
  state: string | null;
  description: string | null;
  logo_url: string | null;
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MemberInfo = {
  slug: string;
  role: string;
};

type ClubRelation =
  | { kind: "member"; role: string; slug: string }
  | { kind: "pending" }
  | { kind: "none" };

type VisibilityFilter = "all" | "public" | "private";
const VISIBILITY_OPTIONS: { value: VisibilityFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "public", label: "Públicos" },
  { value: "private", label: "Privados" },
];

type RelationFilter = "all" | "mine" | "not_joined";
const RELATION_OPTIONS: { value: RelationFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "mine", label: "Mis clubes" },
  { value: "not_joined", label: "No inscrito" },
];

const ALL_CITIES = "all";

// Collapses whitespace and casing so "Bogotá", " bogotá " and "Bogotá  "
// count as the same option — the display label keeps the first-seen casing.
function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

// Checked only inside event handlers, never during render/initial state —
// unlike the removed useIsDesktop hook, this never affects what either
// server or client render, so it can't cause a hydration mismatch. Used
// solely to keep "tap a row/card recenters the map" a mobile-only
// interaction, since desktop's own map never moves on a card click today.
function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  if (visibility === "public") {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 lg:mt-1 lg:justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-[11px] font-medium text-emerald-400">Público</span>
        <span className="text-[11px] text-brand-muted/50 lg:hidden">· Cualquier jugador puede unirse</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 mt-1.5 lg:mt-1 lg:justify-center">
      <Lock className="w-3 h-3 text-amber-400/70 shrink-0" />
      <span className="text-[11px] font-medium text-amber-400/80">Privado</span>
      <span className="text-[11px] text-brand-muted/50 lg:hidden">· Requiere aprobación</span>
    </div>
  );
}

function RelationBadge({ relation }: { relation: ClubRelation }) {
  if (relation.kind === "member") {
    return (
      <Badge
        variant={relation.role === "OWNER" ? "primary" : relation.role === "ADMIN" ? "secondary" : "outline"}
        size="sm"
      >
        {clubRoleLabel(relation.role)}
      </Badge>
    );
  }
  if (relation.kind === "pending") {
    return (
      <Badge variant="warning" size="sm">
        Solicitud pendiente
      </Badge>
    );
  }
  return null;
}

interface ClubDirectoryCardProps {
  club: DirectoryClub;
  relation: ClubRelation;
  isActive: boolean;
  onHover: (id: string | null) => void;
  onTap: (club: DirectoryClub) => void;
}

// Desktop-only compact card (unchanged). See ClubDirectoryRow below for the
// mobile-only compact row that replaces it on small screens.
const ClubDirectoryCard = forwardRef<HTMLDivElement, ClubDirectoryCardProps>(function ClubDirectoryCard(
  { club, relation, isActive, onHover, onTap },
  ref
) {
  const initials = getInitials(club.name);
  const location = [club.city, club.state].filter(Boolean).join(", ");

  return (
    <div
      ref={ref}
      onMouseEnter={() => onHover(club.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(club.id)}
      onBlur={() => onHover(null)}
      onClick={() => onTap(club)}
      style={isActive ? { borderColor: `${CLUB_PRIMARY_COLOR}80` } : undefined}
      className={`flex flex-col gap-4 p-5 rounded-2xl bg-brand-surface border transition-colors lg:gap-2 lg:p-3 lg:rounded-xl ${
        isActive ? "" : "border-white/10 hover:border-white/20"
      }`}
    >
      {/* Identity */}
      <div className="flex items-start gap-3 lg:flex-col lg:items-center lg:text-center lg:gap-1.5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden lg:w-16 lg:h-16 lg:text-lg lg:rounded-2xl"
          style={{
            backgroundColor: `${CLUB_PRIMARY_COLOR}22`,
            color: CLUB_PRIMARY_COLOR,
          }}
        >
          {club.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={club.logo_url}
              alt={`Logo de ${club.name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0 lg:flex-none lg:w-full">
          <div className="flex items-center gap-2 flex-wrap lg:flex-col lg:gap-1">
            <p className="text-sm font-semibold text-white lg:text-xs lg:w-full lg:truncate">{club.name}</p>
            <RelationBadge relation={relation} />
          </div>
          {location && (
            <p className="text-xs text-brand-muted mt-0.5 lg:text-[11px] lg:mt-0.5 lg:truncate lg:w-full">{location}</p>
          )}
          <VisibilityBadge visibility={club.visibility} />
          {club.description && (
            <p className="text-xs text-brand-muted/70 mt-2 line-clamp-2 lg:hidden">
              {club.description}
            </p>
          )}
        </div>
      </div>

      {/* CTA */}
      {relation.kind === "member" ? (
        <Link
          href={getClubEntryPath(relation.slug, relation.role)}
          className="flex items-center justify-center py-2 rounded-xl text-sm font-semibold transition-colors lg:py-1.5 lg:text-[11px] lg:rounded-lg"
          style={{
            backgroundColor: `${CLUB_PRIMARY_COLOR}22`,
            color: CLUB_PRIMARY_COLOR,
            border: `1px solid ${CLUB_PRIMARY_COLOR}44`,
          }}
        >
          <span className="lg:hidden">Entrar al club →</span>
          <span className="hidden lg:inline">Entrar →</span>
        </Link>
      ) : relation.kind === "pending" ? (
        <button
          type="button"
          disabled
          className="flex items-center justify-center py-2 rounded-xl text-sm font-medium border border-amber-500/25 text-amber-400/70 bg-amber-500/10 cursor-not-allowed lg:py-1.5 lg:text-[11px] lg:rounded-lg"
        >
          Solicitud pendiente
        </button>
      ) : (
        <Link
          href={`/${club.slug}`}
          className="flex items-center justify-center py-2 rounded-xl text-sm font-medium border border-white/15 text-white hover:border-white/30 hover:bg-white/5 transition-colors lg:py-1.5 lg:text-[11px] lg:rounded-lg"
        >
          {club.visibility === "public" ? "Ver club →" : "Ver detalles →"}
        </Link>
      )}
    </div>
  );
});

interface ClubDirectoryRowProps {
  club: DirectoryClub;
  relation: ClubRelation;
  isActive: boolean;
  onTap: (club: DirectoryClub) => void;
}

// Mobile-only compact row (desktop keeps ClubDirectoryCard, unchanged). No
// wide CTA button — the whole row navigates, reusing the exact same href
// each relation state already used on its (now-removed) button.
const ClubDirectoryRow = forwardRef<HTMLAnchorElement | HTMLDivElement, ClubDirectoryRowProps>(
  function ClubDirectoryRow({ club, relation, isActive, onTap }, ref) {
    const initials = getInitials(club.name);
    const location = [club.city, club.state].filter(Boolean).join(", ");

    const rowClassName = `flex items-center gap-3 px-3 py-2 rounded-xl bg-brand-surface border transition-colors ${
      isActive ? "" : "border-white/10"
    }`;
    const rowStyle = isActive ? { borderColor: `${CLUB_PRIMARY_COLOR}80` } : undefined;

    const content = (
      <>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden"
          style={{ backgroundColor: `${CLUB_PRIMARY_COLOR}22`, color: CLUB_PRIMARY_COLOR }}
        >
          {club.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.logo_url} alt={`Logo de ${club.name}`} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">{club.name}</p>
            <RelationBadge relation={relation} />
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[11px]">
            {location && <span className="text-brand-muted truncate">{location}</span>}
            {location && <span className="text-brand-muted/40">·</span>}
            <span className="flex items-center gap-1 shrink-0">
              {club.visibility === "public" ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ) : (
                <Lock className="w-2.5 h-2.5 text-amber-400/70" />
              )}
              <span className={club.visibility === "public" ? "text-emerald-400" : "text-amber-400/80"}>
                {club.visibility === "public" ? "Público" : "Privado"}
              </span>
            </span>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-brand-muted/50 shrink-0" />
      </>
    );

    if (relation.kind === "pending") {
      // Same as the removed disabled button: no navigation target at all.
      return (
        <div ref={ref as React.Ref<HTMLDivElement>} onClick={() => onTap(club)} style={rowStyle} className={rowClassName}>
          {content}
        </div>
      );
    }

    const href = relation.kind === "member" ? getClubEntryPath(relation.slug, relation.role) : `/${club.slug}`;

    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        onClick={() => onTap(club)}
        style={rowStyle}
        className={rowClassName}
      >
        {content}
      </Link>
    );
  }
);

interface ExploreSectionProps {
  clubs: DirectoryClub[];
  memberMap: Record<string, MemberInfo>;
  pendingRequestClubIds: string[];
  isAuthenticated: boolean;
}

export function ExploreSection({ clubs, memberMap, pendingRequestClubIds, isAuthenticated }: ExploreSectionProps) {
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState<string>(ALL_CITIES);
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [relationFilter, setRelationFilter] = useState<RelationFilter>("all");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobile-only: explicit "center the map here" override set by tapping a
  // row, taking priority over the auto first-visible-club focus below.
  // Ignored once a filter changes so auto-focus can take back over (see
  // activePanTarget/filterKey below).
  const [panTarget, setPanTarget] = useState<{ id: string; latitude: number; longitude: number } | null>(null);
  const [panTargetFilterKey, setPanTargetFilterKey] = useState<string | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  const pendingSet = useMemo(() => new Set(pendingRequestClubIds), [pendingRequestClubIds]);

  const relationOf = useCallback(
    (club: DirectoryClub): ClubRelation => {
      const member = memberMap[club.id];
      if (member) return { kind: "member", role: member.role, slug: member.slug };
      if (pendingSet.has(club.id)) return { kind: "pending" };
      return { kind: "none" };
    },
    [memberMap, pendingSet]
  );

  // Built from every registered club (never the currently-filtered subset),
  // so picking a city never shrinks the dropdown itself.
  const cityOptions = useMemo(() => {
    const labelByKey = new Map<string, string>();
    for (const c of clubs) {
      const raw = c.city?.trim();
      if (!raw) continue;
      const key = normalizeCityKey(raw);
      if (!labelByKey.has(key)) labelByKey.set(key, raw.replace(/\s+/g, " "));
    }
    const entries = Array.from(labelByKey.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
    return [{ value: ALL_CITIES, label: "Todas las ciudades" }, ...entries.map(([value, label]) => ({ value, label }))];
  }, [clubs]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return clubs.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (cityFilter !== ALL_CITIES && normalizeCityKey(c.city ?? "") !== cityFilter) return false;
      if (visibilityFilter !== "all" && c.visibility !== visibilityFilter) return false;
      if (relationFilter !== "all") {
        const isMine = relationOf(c).kind === "member";
        if (relationFilter === "mine" && !isMine) return false;
        if (relationFilter === "not_joined" && isMine) return false;
      }
      return true;
    });
  }, [clubs, q, cityFilter, visibilityFilter, relationFilter, relationOf]);

  const mapClubs = useMemo(
    () =>
      filtered
        .filter((c): c is DirectoryClub & { latitude: number; longitude: number } => c.latitude != null && c.longitude != null)
        .map((c) => ({ id: c.id, name: c.name, slug: c.slug, latitude: c.latitude, longitude: c.longitude })),
    [filtered]
  );

  // First club in the current list order that has valid coordinates — the
  // map centers on this alone, never on a bounds fit across every marker.
  const focusClub = useMemo(() => {
    const found = mapClubs[0];
    return found ? { id: found.id, latitude: found.latitude, longitude: found.longitude } : null;
  }, [mapClubs]);

  useEffect(() => {
    if (!selectedId) return;
    // Only one of these two refs is ever populated for a given club at a
    // time in practice, but calling scrollIntoView on a display:none
    // element (the hidden breakpoint's list) is a harmless no-op, so both
    // are safe to call unconditionally — each scrolls only its own nearest
    // scrollable ancestor (the mobile list's or desktop list's own
    // overflow-y-auto container), never the page.
    cardRefs.current[selectedId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    rowRefs.current[selectedId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  // A filter change invalidates any manual pan target — the map should go
  // back to auto-focusing the new first-visible club (see focusClub above).
  // Tracked without an effect: panTargetFilterKey just remembers which
  // filter combination panTarget was set under, and the render below
  // ignores it once that combination no longer matches (React's "adjust
  // state during render, not in an effect" pattern for state that must
  // reset — plain state, not a ref, since this project's lint forbids
  // reading refs during render).
  const filterKey = `${q}|${cityFilter}|${visibilityFilter}|${relationFilter}`;
  const activePanTarget = panTargetFilterKey === filterKey ? panTarget : null;

  // Mobile-only (see isDesktopViewport): tapping a row/card both highlights
  // its marker (via selectedId, already read by activeClubId below) and
  // recenters the map on it. Desktop keeps its existing card-click behavior
  // untouched — this is a deliberate no-op there.
  function handleCardTap(club: DirectoryClub) {
    if (isDesktopViewport()) return;
    setSelectedId(club.id);
    if (club.latitude != null && club.longitude != null) {
      setPanTargetFilterKey(filterKey);
      setPanTarget({ id: club.id, latitude: club.latitude, longitude: club.longitude });
    }
  }

  return (
    <section>
      <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
        Explorar clubes
      </h2>

      {clubs.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-brand-muted">No hay clubes disponibles aún.</p>
        </div>
      ) : (
        // Mobile: one bounded column (viewport height minus the sticky
        // header) so the page itself never needs to scroll here — only the
        // list at the bottom does. Desktop: lg:block/lg:h-auto cancel all of
        // that, so this is just a plain wrapper with zero visual effect —
        // the existing desktop layout below is completely unchanged.
        <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:block lg:h-auto">
          {/* Search + filters — fixed-height chrome above map+list on
              mobile; normal document flow on desktop, unchanged. */}
          <div className="shrink-0 flex flex-col gap-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted/60 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar club por nombre"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-brand-surface border border-white/10 text-base md:text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterDropdown
                label="Ciudad"
                value={cityFilter}
                defaultValue={ALL_CITIES}
                options={cityOptions}
                onChange={setCityFilter}
              />
              <FilterDropdown
                label="Visibilidad"
                value={visibilityFilter}
                defaultValue="all"
                options={VISIBILITY_OPTIONS}
                onChange={setVisibilityFilter}
              />
              {isAuthenticated && (
                <FilterDropdown
                  label="Relación"
                  value={relationFilter}
                  defaultValue="all"
                  options={RELATION_OPTIONS}
                  onChange={setRelationFilter}
                />
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-brand-muted">
                {query ? <>No se encontraron clubes con &ldquo;{query}&rdquo;.</> : "No se encontraron clubes con estos filtros."}
              </p>
            </div>
          ) : (
            // DOM order is [desktop cards, map, mobile rows] deliberately —
            // at each breakpoint exactly one of the two lists is display:none
            // and drops out of layout entirely, so the remaining pair's
            // natural DOM order already places them correctly (desktop:
            // cards→left column, map→right; mobile: map above, rows below)
            // with no `order` utilities needed.
            <div className="flex-1 min-h-0 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(380px,460px)_1fr] lg:gap-5 lg:items-start">
              {/* Desktop compact cards */}
              <div className="hidden lg:grid lg:grid-cols-2 lg:gap-2 lg:content-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
                {filtered.map((club) => (
                  <ClubDirectoryCard
                    key={club.id}
                    ref={(el) => {
                      cardRefs.current[club.id] = el;
                    }}
                    club={club}
                    relation={relationOf(club)}
                    isActive={selectedId === club.id}
                    onHover={setHoveredId}
                    onTap={handleCardTap}
                  />
                ))}
              </div>

              {/* Map — same component/instance both breakpoints: a fixed,
                  non-flexible block on mobile (never scrolls with the page),
                  the existing sticky column on desktop (unchanged). */}
              <div className="shrink-0 h-[35vh] rounded-2xl overflow-hidden border border-white/10 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
                <ClubsMap
                  clubs={mapClubs}
                  activeClubId={hoveredId ?? selectedId}
                  onMarkerClick={setSelectedId}
                  focusClub={activePanTarget ?? focusClub}
                />
              </div>

              {/* Mobile compact rows — the only scrollable element on
                  mobile; desktop keeps its existing card grid above. */}
              <div
                className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 lg:hidden"
                style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
              >
                {filtered.map((club) => (
                  <ClubDirectoryRow
                    key={club.id}
                    ref={(el) => {
                      rowRefs.current[club.id] = el;
                    }}
                    club={club}
                    relation={relationOf(club)}
                    isActive={selectedId === club.id}
                    onTap={handleCardTap}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auth CTA for anonymous visitors — outside the bounded mobile
          column, always in normal page flow. */}
      {!isAuthenticated && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 py-5 px-5 rounded-2xl bg-brand-surface border border-white/10">
          <div>
            <p className="text-sm font-medium text-white">¿Ya tienes una cuenta?</p>
            <p className="text-xs text-brand-muted mt-0.5">
              Inicia sesión para ver tus clubes y solicitar acceso.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/auth/login"
              className="px-4 py-2 rounded-xl text-sm font-medium border border-white/20 text-white hover:border-white/40 transition-colors"
            >
              Iniciar sesión
            </Link>
            <RegisterMenu
              align="right"
              triggerClassName="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-primary text-brand-bg hover:bg-brand-primary/90 transition-colors"
              triggerContent={
                <>
                  Registrarme
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}
