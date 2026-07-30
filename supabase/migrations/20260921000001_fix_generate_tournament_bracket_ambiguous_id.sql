-- ============================================================
-- Fix: "column reference \"id\" is ambiguous" en generate_tournament_bracket
-- (módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Bug confirmado en producción (ejecutado como OWNER):
--
--   ERROR: 42702: column reference "id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   QUERY: INSERT INTO public.tournament_matches (...) VALUES (...) RETURNING id
--   CONTEXT: PL/pgSQL function generate_tournament_bracket(uuid) line 117.
--
-- Causa exacta: el RETURNS TABLE de esta función (vigente desde
-- 20260918000001_fix_tournament_lifecycle_returns_regression.sql, que ya
-- reemplazó por completo la versión original de 20260911000001) declara
-- una columna de salida llamada `id`. Dentro del cuerpo PL/pgSQL, ese `id`
-- de salida existe como variable implícita en el mismo espacio de nombres
-- que las variables DECLARE — así que las dos sentencias
-- `INSERT INTO public.tournament_matches (...) ... RETURNING id INTO
-- v_match_id;` (ronda 1 y rondas posteriores) quedan ambiguas entre esa
-- variable de salida `id` y la columna real `tournament_matches.id`.
-- Auditado el resto del cuerpo completo en busca de la misma clase de
-- referencia no calificada frente a cualquier columna de salida del
-- RETURNS TABLE (id, club_id, name, description, category, bracket_size,
-- status, visibility, registration_opens_at, registration_closes_at,
-- starts_at, ends_at, bracket_generated_at, completed_at, completed_by,
-- cancelled_at, cancelled_by, created_by, created_at, updated_at,
-- secondary_category) — confirmado que TODAS las demás consultas del
-- cuerpo ya calificaban cada columna con su alias de tabla/variable
-- (t., tm., te., cm., v_tournament.) desde el origen; los únicos dos
-- puntos ambiguos reales son las dos RETURNING id de arriba. En
-- particular:
--   - Las listas de columnas de INSERT INTO ... (col1, col2, ...) nunca
--     son ambiguas (se resuelven siempre contra la tabla destino, no
--     contra el espacio de nombres PL/pgSQL).
--   - El SET status = ... de la UPDATE final tampoco lo es (el target de
--     un SET siempre se resuelve contra la tabla actualizada).
--   - El RETURN QUERY SELECT final ya usa v_tournament.id/... (calificado
--     contra la variable de registro), nunca un `id` suelto.
--
-- Corrección puramente mecánica y localizada: se agrega un alias
-- explícito a la tabla destino de cada INSERT (`AS tm`) y se califica el
-- RETURNING con ese alias (`RETURNING tm.id`) — el patrón exacto que
-- Postgres soporta para desambiguar un RETURNING frente a cualquier otro
-- identificador del mismo nombre. Nada más cambia: misma firma de
-- entrada, mismo RETURNS TABLE (21 columnas, incluida
-- secondary_category), mismo SECURITY DEFINER, mismo SET search_path,
-- misma autorización OWNER/ADMIN, mismas validaciones de estado/cupo/
-- categoría/miembros, mismo sorteo aleatorio, misma construcción de
-- rondas, mismos grants. Se usa CREATE OR REPLACE FUNCTION (nunca DROP)
-- porque la firma y el tipo de retorno no cambian.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_tournament_bracket(
  p_tournament_id uuid
)
RETURNS TABLE (
  id                      uuid,
  club_id                 uuid,
  name                    text,
  description             text,
  category                text,
  bracket_size            integer,
  status                  text,
  visibility              text,
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  bracket_generated_at    timestamptz,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz,
  secondary_category      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_member      public.club_members%ROWTYPE;
  v_tournament         public.tournaments%ROWTYPE;
  v_entry_ids          uuid[];
  v_bad_count          int;
  v_total_rounds       int;
  v_matches_in_round   int;
  v_round              int;
  v_match_id           uuid;
  v_round_matches      uuid[];
  v_prev_round_matches uuid[];
  v_total_created      int;
  v_first_round_count  int;
  v_updated_count      int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to generate the bracket for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to generate the bracket for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_tournament.status <> 'registration_closed' THEN
    RAISE EXCEPTION 'Tournament must have registration closed before generating the bracket' USING ERRCODE = '22023';
  END IF;

  -- Defensivo: si ya existen partidos aunque el estado siga
  -- registration_closed, es una inconsistencia estructural — nunca se
  -- regenera ni se borra, se rechaza explícitamente.
  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm WHERE tm.tournament_id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'Tournament already has a generated bracket' USING ERRCODE = '22023';
  END IF;

  -- Sorteo aleatorio, una sola vez — array_agg ya tiene precedente real
  -- en este esquema; random() no, pero no existe ranking/seeding
  -- aprobado todavía, así que esta es la única política posible.
  SELECT array_agg(te.id ORDER BY random()) INTO v_entry_ids
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id
    AND te.status = 'confirmed';

  IF v_entry_ids IS NULL OR array_length(v_entry_ids, 1) <> v_tournament.bracket_size THEN
    RAISE EXCEPTION 'Confirmed entry count does not match the tournament bracket size' USING ERRCODE = '22023';
  END IF;

  -- Defensivo: aunque las FKs ya protegen club/categoría en la
  -- inscripción, se revalida aquí antes de generar nada.
  SELECT count(*) INTO v_bad_count
  FROM public.tournament_entries AS te
  WHERE te.id = ANY(v_entry_ids)
    AND (te.club_id <> v_tournament.club_id OR te.category <> v_tournament.category);

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'A confirmed entry does not match this tournament club or category' USING ERRCODE = '22023';
  END IF;

  -- Verificación agrupada por tournament_entry_id: un LEFT JOIN contra
  -- unnest(v_entry_ids) detecta también una entry con CERO miembros (que
  -- un simple GROUP BY jamás mostraría, al no tener ninguna fila que
  -- agrupar) — no solo el total global de miembros.
  SELECT count(*) INTO v_bad_count
  FROM unnest(v_entry_ids) AS entry_id
  LEFT JOIN (
    SELECT tem.tournament_entry_id, count(*) AS member_count
    FROM public.tournament_entry_members AS tem
    WHERE tem.tournament_entry_id = ANY(v_entry_ids)
    GROUP BY tem.tournament_entry_id
  ) AS member_counts ON member_counts.tournament_entry_id = entry_id
  WHERE COALESCE(member_counts.member_count, 0) <> 2;

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'A confirmed entry does not have exactly two members' USING ERRCODE = '22023';
  END IF;

  CASE v_tournament.bracket_size
    WHEN 4 THEN v_total_rounds := 2;
    WHEN 8 THEN v_total_rounds := 3;
    WHEN 16 THEN v_total_rounds := 4;
    ELSE
      RAISE EXCEPTION 'Unsupported bracket size' USING ERRCODE = '22023';
  END CASE;

  -- ─── Ronda 1: entradas materializadas directamente, sin fuentes ──────
  v_matches_in_round := v_tournament.bracket_size / 2;
  v_round_matches := ARRAY[]::uuid[];

  FOR i IN 1..v_matches_in_round LOOP
    -- FIX: alias explícito `AS tm` + `RETURNING tm.id` — antes `RETURNING
    -- id` era ambiguo frente a la columna de salida `id` del propio
    -- RETURNS TABLE de esta función.
    INSERT INTO public.tournament_matches AS tm (
      tournament_id, club_id, round_number, match_number, status,
      entry_one_id, entry_two_id, created_by, updated_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, 1, i, 'pending',
      v_entry_ids[2 * i - 1], v_entry_ids[2 * i], auth.uid(), auth.uid()
    )
    RETURNING tm.id INTO v_match_id;

    v_round_matches := array_append(v_round_matches, v_match_id);
  END LOOP;

  -- ─── Rondas posteriores: solo fuentes, sin entradas ───────────────────
  -- Insertadas siempre en orden ascendente — las FKs autorreferenciadas
  -- exigen que la fuente ya exista antes de crear el partido que la
  -- referencia.
  FOR v_round IN 2..v_total_rounds LOOP
    v_prev_round_matches := v_round_matches;
    v_round_matches := ARRAY[]::uuid[];
    v_matches_in_round := v_matches_in_round / 2;

    FOR i IN 1..v_matches_in_round LOOP
      -- FIX: mismo alias + RETURNING calificado que en la ronda 1.
      INSERT INTO public.tournament_matches AS tm (
        tournament_id, club_id, round_number, match_number, status,
        source_match_one_id, source_match_two_id, created_by, updated_by
      ) VALUES (
        p_tournament_id, v_tournament.club_id, v_round, i, 'pending',
        v_prev_round_matches[2 * i - 1], v_prev_round_matches[2 * i], auth.uid(), auth.uid()
      )
      RETURNING tm.id INTO v_match_id;

      v_round_matches := array_append(v_round_matches, v_match_id);
    END LOOP;
  END LOOP;

  -- ─── Validación interna antes de transicionar el torneo ───────────────
  SELECT count(*) INTO v_total_created
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = p_tournament_id;

  IF v_total_created <> v_tournament.bracket_size - 1 THEN
    RAISE EXCEPTION 'Bracket generation produced an unexpected number of matches' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_first_round_count
  FROM public.tournament_matches AS tm
  WHERE tm.tournament_id = p_tournament_id AND tm.round_number = 1;

  IF v_first_round_count <> v_tournament.bracket_size / 2 THEN
    RAISE EXCEPTION 'Bracket generation produced an unexpected first round' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = p_tournament_id AND tm.round_number = 1
      AND (tm.entry_one_id IS NULL OR tm.entry_two_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'A first round match is missing a participant' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = p_tournament_id AND tm.round_number > 1
      AND (tm.entry_one_id IS NOT NULL OR tm.entry_two_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'A later round match was created with a materialized participant' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = p_tournament_id AND tm.round_number > 1
      AND (tm.source_match_one_id IS NULL OR tm.source_match_two_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'A later round match is missing a source match' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches AS tm
    WHERE tm.tournament_id = p_tournament_id AND tm.round_number = 1
      AND (tm.source_match_one_id IS NOT NULL OR tm.source_match_two_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'A first round match was created with a source match' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'bracket_generated', bracket_generated_at = now()
  WHERE t.id = p_tournament_id AND t.status = 'registration_closed';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Tournament state changed concurrently' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id;

  RETURN QUERY SELECT
    v_tournament.id, v_tournament.club_id, v_tournament.name, v_tournament.description,
    v_tournament.category, v_tournament.bracket_size, v_tournament.status, v_tournament.visibility,
    v_tournament.registration_opens_at, v_tournament.registration_closes_at,
    v_tournament.starts_at, v_tournament.ends_at, v_tournament.bracket_generated_at,
    v_tournament.completed_at, v_tournament.completed_by, v_tournament.cancelled_at,
    v_tournament.cancelled_by, v_tournament.created_by, v_tournament.created_at,
    v_tournament.updated_at, v_tournament.secondary_category;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_tournament_bracket(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_tournament_bracket(uuid) TO authenticated;
