// Única fuente de verdad para la URL pública del detalle de una noticia —
// nunca construida a mano en cada componente/card/acción de compartir.
// club_news.slug (único por club, ver 20261001000001) es el identificador
// real de la ruta; el id uuid sigue existiendo pero ya no es visible aquí.
export function newsDetailPath(clubSlug: string, newsSlug: string): string {
  return `/clubs/${clubSlug}/news/${newsSlug}`;
}
