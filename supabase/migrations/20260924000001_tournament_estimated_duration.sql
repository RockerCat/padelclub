-- ============================================================
-- Torneos — reemplaza "Fin del torneo" (ends_at) por una duración
-- estimada (Bloque 2, mejora de UX del formulario)
-- Mi Pádel Club
-- ============================================================
-- ends_at (fecha/hora final) nunca aportó valor real al modelo de evento
-- del Bloque 1: el único consumo de negocio que le quedaba era (a) el
-- CHECK starts_at <= ends_at, (b) la validación equivalente en
-- create_tournament/update_tournament, y (c) exigir que no fuera NULL
-- antes de abrir inscripciones (open_tournament_registration). Las
-- funciones que antes también lo usaban para acotar canchas
-- (create/update_tournament_court_allocation) ya fueron eliminadas en
-- 20260922000001 junto con el resto del modelo de canchas/partidos — no
-- queda ningún consumidor real de una fecha final, solo de una duración
-- aproximada para mostrarle al organizador. Se reemplaza por
-- estimated_duration_minutes (integer), que representa exactamente eso:
-- una duración, no una fecha.
--
-- No mantiene los dos conceptos en paralelo — ends_at se elimina en la
-- misma migración, nunca queda como columna muerta.
-- ============================================================

-- Backfill antes de alterar la forma de la tabla: primero desde
-- starts_at/ends_at cuando ambas existen (duración real ya configurada),
-- luego el resto vía la misma regla que usará el formulario (30 min por
-- pareja) — nunca deja una fila con valor NULL cuando bastaba con
-- derivarlo de datos ya existentes.
ALTER TABLE public.tournaments ADD COLUMN estimated_duration_minutes integer;

UPDATE public.tournaments
SET estimated_duration_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60))::integer
WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL;

UPDATE public.tournaments
SET estimated_duration_minutes = max_pairs * 30
WHERE estimated_duration_minutes IS NULL;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_estimated_duration_positive
  CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0);

-- tournaments_event_window_valid referenciaba starts_at/ends_at — se cae
-- junto con la columna, nunca queda huérfana.
ALTER TABLE public.tournaments DROP CONSTRAINT tournaments_event_window_valid;
ALTER TABLE public.tournaments DROP COLUMN ends_at;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tournaments WHERE estimated_duration_minutes IS NULL) THEN
    RAISE EXCEPTION 'Post-backfill validation failed: some tournaments still have a NULL estimated_duration_minutes';
  END IF;
END $$;
