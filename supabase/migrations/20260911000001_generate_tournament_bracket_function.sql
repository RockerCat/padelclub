-- ============================================================
-- Bracket generation — eliminación directa, 4/8/16
-- (Bloque 1.7, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Una sola función SECURITY DEFINER, una sola transacción. Genera todos
-- los tournament_matches del cuadro de una vez a partir de las
-- inscripciones confirmed, enlaza las rondas posteriores a sus fuentes,
-- y transiciona el torneo a bracket_generated. Nunca programa cancha,
-- nunca materializa participantes más allá de la primera ronda, nunca
-- toca puntos ni notificaciones.
--
-- Autorización: mismo patrón corregido y vigente ya citado en los dos
-- bloques anteriores (20260825000001) — membresía activa consultada
-- directamente, comparación positiva role IN ('OWNER','ADMIN'), nunca
-- club_role() NOT IN (...).
--
-- Concurrencia: sin advisory locks — el propio SELECT ... FOR UPDATE
-- sobre la fila del torneo ya serializa dos intentos concurrentes de
-- generación (mismo patrón que create_tournament/update_tournament/
-- open_tournament_registration en 20260909000001). La comprobación
-- "no existen matches todavía" ocurre bajo ese lock, antes de insertar
-- nada.
--
-- Sorteo: array_agg(... ORDER BY random()) — array_agg ya tiene
-- precedente real en este esquema (record_match_result_rpc,
-- tournament_entry_registration_functions); random() no tiene
-- precedente previo, pero no existe todavía ranking/seeding aprobado
-- para torneos, así que el sorteo puramente aleatorio es la única
-- política posible, exactamente como se decidió en el diseño funcional.
-- Sin parámetro de semilla, nunca proporcionado por el cliente.
--
-- Construcción por rondas: arrays uuid[] en memoria de la función,
-- nunca una tabla temporal ni next_match_id. Los ids de los partidos ya
-- insertados en la ronda R-1 se usan directamente como
-- source_match_one_id/source_match_two_id de la ronda R — las FKs
-- autorreferenciadas exigen que la fuente ya exista, por lo que las
-- rondas se insertan siempre en orden ascendente (nunca la final
-- primero).
--
-- CORRECCIÓN (aplicada antes de la primera ejecución real de esta
-- migración, sin tocar nada más del archivo): la validación de
-- integridad de miembros comparaba solo el TOTAL global de
-- tournament_entry_members contra 2 × bracket_size, lo cual no
-- detecta una entry con 3 miembros compensada por otra con 1 (el total
-- global seguiría cuadrando). Se reemplazó por una verificación
-- agrupada por tournament_entry_id (LEFT JOIN contra
-- unnest(v_entry_ids), para detectar también una entry con CERO
-- miembros, que un GROUP BY simple nunca mostraría). Ver el comentario
-- inline en el propio chequeo, más abajo.
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
  updated_at              timestamptz
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

  -- CORRECCIÓN (previa a la primera aplicación de esta migración): la
  -- versión anterior solo comparaba el TOTAL global de miembros contra
  -- 2 × bracket_size, lo cual no detecta una entry con 3 miembros
  -- compensada por otra con 1 (el total global seguiría siendo
  -- correcto). Se reemplaza por una verificación agrupada por
  -- tournament_entry_id: un LEFT JOIN contra unnest(v_entry_ids)
  -- detecta también una entry con CERO miembros (que un simple
  -- GROUP BY jamás mostraría, al no tener ninguna fila que agrupar).
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
    INSERT INTO public.tournament_matches (
      tournament_id, club_id, round_number, match_number, status,
      entry_one_id, entry_two_id, created_by, updated_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, 1, i, 'pending',
      v_entry_ids[2 * i - 1], v_entry_ids[2 * i], auth.uid(), auth.uid()
    )
    RETURNING id INTO v_match_id;

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
      INSERT INTO public.tournament_matches (
        tournament_id, club_id, round_number, match_number, status,
        source_match_one_id, source_match_two_id, created_by, updated_by
      ) VALUES (
        p_tournament_id, v_tournament.club_id, v_round, i, 'pending',
        v_prev_round_matches[2 * i - 1], v_prev_round_matches[2 * i], auth.uid(), auth.uid()
      )
      RETURNING id INTO v_match_id;

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

  RETURN QUERY SELECT (v_tournament).*;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_tournament_bracket(uuid) FROM PUBLIC;
