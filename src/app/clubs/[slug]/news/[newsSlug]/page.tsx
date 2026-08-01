import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatNewsDate } from "@/components/clubs/PublicNewsCard";
import { NewsTournamentChampions } from "@/components/clubs/NewsTournamentChampions";
import { ShareNewsButtons } from "./ShareNewsButtons";
import { NewsDetailEditAction } from "./NewsDetailEditAction";
import { newsDetailPath } from "@/lib/newsPaths";
import { computeTournamentClassification, getTournamentEntriesWithMembers } from "@/lib/tournamentEntries";
import { tournamentCategoryLabel } from "@/lib/tournamentLabels";

interface Props {
  params: Promise<{ slug: string; newsSlug: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, newsSlug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase.from("clubs").select("id").eq("slug", slug).eq("is_active", true).single();
  if (!club) return { title: "Noticia no encontrada | MiPadelClub" };

  const { data: news } = UUID_RE.test(newsSlug)
    ? await supabase.from("club_news").select("title, content").eq("id", newsSlug).eq("club_id", club.id).single()
    : await supabase.from("club_news").select("title, content").eq("slug", newsSlug).eq("club_id", club.id).single();
  if (!news) return { title: "Noticia no encontrada | MiPadelClub" };

  return {
    title: `${news.title} | MiPadelClub`,
    description: news.content.slice(0, 150),
  };
}

export default async function ClubNewsDetailPage({ params }: Props) {
  const { slug, newsSlug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!club) notFound();

  // Selecciona las columnas completas de club_news (no solo las que la
  // vista de lectura necesita): NewsForm/EditNewsModal esperan el tipo
  // ClubNews completo para precargar el modo edición — created_by/
  // created_at/updated_at nunca se muestran ni se editan aquí, solo
  // viajan como parte de la fila para satisfacer ese tipo compartido.
  const NEWS_COLUMNS = "id, club_id, slug, title, content, image_url, created_by, tournament_id, published_at, created_at, updated_at";

  // Compatibilidad con enlaces antiguos basados en UUID: si el parámetro
  // tiene forma de UUID, se resuelve por id (siempre acotado a club_id) y
  // se redirige de inmediato a la URL canónica con slug — mismo patrón ya
  // usado por el detalle de torneo. Nunca se deja indexable la variante
  // por UUID; solo existe la URL con slug de aquí en adelante.
  const { data: news } = UUID_RE.test(newsSlug)
    ? await supabase.from("club_news").select(NEWS_COLUMNS).eq("id", newsSlug).eq("club_id", club.id).single()
    : await supabase.from("club_news").select(NEWS_COLUMNS).eq("slug", newsSlug).eq("club_id", club.id).single();

  if (!news) notFound();

  if (UUID_RE.test(newsSlug)) {
    redirect(newsDetailPath(club.slug, news.slug));
  }

  const path = newsDetailPath(club.slug, news.slug);

  // "Editar noticia" solo para OWNER/ADMIN con membresía ACTIVA en este
  // club — nunca inferido del rol global del usuario ni de un flag del
  // cliente. Un visitante no autenticado o un PLAYER nunca ven el botón;
  // la propia Server Action (updateNews → requireAdminRole) re-valida
  // esto igual del lado del servidor, así que ocultar el botón aquí es
  // solo UX, nunca la defensa real.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const membership = user
    ? (
        await supabase
          .from("club_members")
          .select("role")
          .eq("club_id", club.id)
          .eq("profile_id", user.id)
          .eq("is_active", true)
          .single()
      ).data
    : null;

  const canEditNews = membership?.role === "OWNER" || membership?.role === "ADMIN";

  // Campeones del torneo asociado (si existe) — nunca detectado por
  // título/contenido, siempre a través de news.tournament_id (asociación
  // persistente, ver 20260929000001). Si el torneo no puede recuperarse
  // (inconsistencia, RLS, etc.) la noticia sigue mostrándose normal, sin
  // el bloque deportivo — nunca rompe la página.
  let championRows: ReturnType<typeof computeTournamentClassification> = [];
  let tournamentCategoryText: string | null = null;

  if (news.tournament_id) {
    try {
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("id, club_id, category, secondary_category")
        .eq("id", news.tournament_id)
        .eq("club_id", club.id)
        .single();

      if (tournament) {
        const categories = [tournament.category, tournament.secondary_category].filter((c): c is string => !!c);
        const { entries, error: entriesError } = await getTournamentEntriesWithMembers(
          supabase,
          tournament.id,
          club.id,
          categories
        );

        if (!entriesError) {
          const classification = computeTournamentClassification(entries);
          championRows = classification.filter((row) => row.position === 1);
          tournamentCategoryText = tournamentCategoryLabel(tournament.category, tournament.secondary_category);
        }
      }
    } catch (err) {
      console.error("[news detail] failed to load tournament champions:", err);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Sin enlace de regreso: una noticia puede abrirse desde demasiados
          orígenes distintos (landing pública, perfil público del club,
          dashboards de OWNER/ADMIN/PLAYER, enlaces compartidos, futuras
          notificaciones) para que exista un único "volver a" correcto — el
          usuario vuelve con el back del navegador o el gesto nativo. El
          detalle arranca directamente con la imagen y el contenido. */}

      {/* Desktop (lg+): dos columnas — imagen portrait a la izquierda
          (~35%, con un ancho máximo fijo para que nunca crezca
          indefinidamente en pantallas grandes), fecha/título/campeones/
          contenido a la derecha (~65%, el elemento principal). `lg:items-start`
          (en vez de stretch) deja que la columna de la imagen conserve
          su propia altura natural — así, con una noticia larga, le
          queda "recorrido" a `lg:sticky` para pegarse cerca del borde
          superior del viewport (sin barra superior alguna, ver arriba)
          mientras el texto sigue haciendo scroll a su lado, sin que la
          imagen empuje el contenido hacia abajo. `lg:top-10` coincide con
          el `py-10` propio del contenedor, para que el margen se sienta
          igual antes y durante el scroll. Mobile/tablet angosta: sin
          lg:grid, los bloques son simples <div> en flujo normal — el
          orden real del DOM (imagen, fecha, título, campeones, contenido)
          ya coincide con el orden pedido, sin necesitar ninguna clase de
          reordenamiento. */}
      <div className="max-w-5xl mx-auto px-5 py-10 lg:grid lg:grid-cols-[minmax(0,min(35%,360px))_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <div className="mb-6 lg:mb-0 lg:sticky lg:top-10">
          <div className="rounded-2xl overflow-hidden bg-white/3 border border-white/8 aspect-[3/4]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={news.image_url} alt={news.title} className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-brand-muted">{formatNewsDate(news.published_at)}</p>
            {canEditNews && <NewsDetailEditAction clubId={club.id} news={news} />}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">{news.title}</h1>

          <NewsTournamentChampions champions={championRows} categoryLabel={tournamentCategoryText} />

          <div className="text-sm text-white/80 leading-relaxed whitespace-pre-line mb-8 max-w-prose">
            {news.content}
          </div>

          <ShareNewsButtons title={news.title} path={path} />
        </div>
      </div>
    </div>
  );
}
