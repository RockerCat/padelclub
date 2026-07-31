-- ============================================================
-- Cierre editorial del torneo — vincula una noticia con el torneo
-- que la originó
-- Mi Pádel Club
-- ============================================================
-- Contexto: hasta ahora club_news no tenía ninguna relación con
-- tournaments (confirmado por auditoría — ni columna, ni migración
-- previa la agregó). "Generar noticia" desde un torneo finalizado
-- necesita: (a) poder detectar si ya existe una noticia asociada, sin
-- adivinar por título/contenido/fecha, y (b) garantizar que nunca se
-- publiquen dos noticias para el mismo torneo, incluso ante dos
-- pestañas o solicitudes simultáneas.
--
-- tournament_id es nullable — una noticia normal (sin torneo) nunca lo
-- toca, sigue exactamente igual que antes.
--
-- ON DELETE SET NULL (no CASCADE): un torneo nunca se borra físicamente
-- durante el MVP (CLAUDE.md — Club/Tournament principles, siempre se
-- archiva/cancela, nunca DELETE), pero si en el futuro alguna vía
-- administrativa lo eliminara, la noticia ya publicada debe conservarse
-- como contenido editorial legítimo del club — nunca desaparecer con él.
--
-- Una sola noticia por torneo: índice único parcial sobre tournament_id
-- (solo aplica cuando no es null) — es a la vez el índice pedido sobre
-- la columna y la garantía de unicidad a nivel de base de datos, la
-- única protección real contra una carrera (nunca la UI sola).
ALTER TABLE public.club_news
  ADD COLUMN tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX club_news_one_per_tournament
  ON public.club_news (tournament_id)
  WHERE tournament_id IS NOT NULL;

-- La política de INSERT ya exigía OWNER/ADMIN del club (club_role); se
-- reemplaza (no se edita la migración histórica) para sumar, solo
-- cuando tournament_id no es null: el torneo debe existir, pertenecer
-- al MISMO club de la noticia que se está creando, y estar completed —
-- nunca confiar en que el valor enviado desde el cliente ya sea válido.
-- UPDATE/DELETE no cambian: la app nunca envía tournament_id en un
-- update (ver actions.ts), y esta columna no forma parte del tipo
-- Update en el cliente — queda inmutable después de creada por
-- construcción del propio flujo, no por una política adicional aquí.
DROP POLICY IF EXISTS "club_news_insert_admin" ON public.club_news;
CREATE POLICY "club_news_insert_admin"
  ON public.club_news
  FOR INSERT
  WITH CHECK (
    public.club_role(club_id) IN ('OWNER', 'ADMIN')
    AND (
      tournament_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.tournaments t
        WHERE t.id = tournament_id
          AND t.club_id = club_news.club_id
          AND t.status = 'completed'
      )
    )
  );
