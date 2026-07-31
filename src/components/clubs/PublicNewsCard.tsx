import Link from "next/link";
import { newsDetailPath } from "@/lib/newsPaths";

export interface PublicNewsCardItem {
  id: string;
  slug: string;
  title: string;
  content: string;
  image_url: string;
  published_at: string;
}

interface PublicNewsCardProps {
  clubSlug: string;
  news: PublicNewsCardItem;
}

export function formatNewsDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Shared by the "Noticias recientes" section on ClubPublicView and the full
// /clubs/[slug]/news listing — same card, two call sites, no duplicated JSX.
export function PublicNewsCard({ clubSlug, news }: PublicNewsCardProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden flex flex-col">
      <div className="aspect-video w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={news.image_url} alt={news.title} className="w-full h-full object-cover" />
      </div>
      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <p className="text-xs text-brand-muted">{formatNewsDate(news.published_at)}</p>
        <h3 className="text-sm font-semibold text-white line-clamp-2">{news.title}</h3>
        <p className="text-xs text-white/60 line-clamp-2 flex-1">{news.content}</p>
        <Link
          href={newsDetailPath(clubSlug, news.slug)}
          className="mt-2 inline-flex items-center justify-center h-8 rounded-lg text-xs font-semibold border border-white/15 text-white hover:bg-white/5 transition-colors"
        >
          Ver noticia
        </Link>
      </div>
    </div>
  );
}
