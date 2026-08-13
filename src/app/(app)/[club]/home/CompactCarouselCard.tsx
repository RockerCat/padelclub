import Link from "next/link";

// Card mínima para los carruseles compactos de "Página del club" en
// breakpoint mobile (Noticias recientes/Torneos activos/Torneos
// finalizados, ver page.tsx) — solo imagen + título, nunca fecha/
// categoría/estado/metadata (esa información sigue completa en el
// detalle real al que el Link ya navega). Un único componente reutilizado
// por los tres carruseles (mismo shape imagen+título para noticia y
// torneo) — nunca reemplaza PublicNewsCard/TournamentCard, que siguen
// intactos para el grid de desktop y el resto del producto.
export function CompactCarouselCard({ href, imageUrl, title }: { href: string; imageUrl: string | null; title: string }) {
  return (
    <Link href={href} className="block rounded-xl overflow-hidden bg-brand-surface border border-white/10">
      <div className="w-full aspect-[4/3] bg-white/5">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="h-11 px-2.5 py-2 flex items-start">
        <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">{title}</p>
      </div>
    </Link>
  );
}
