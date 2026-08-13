-- ─── register_tournament_entry — cierre temporal duro para PLAYER ──────────
-- Bug real confirmado: un torneo con status='registration_open' cuyo
-- registration_closes_at/starts_at ya pasaron seguía aceptando
-- inscripciones de un PLAYER, porque la única validación era el status
-- persistido (nunca se auto-cierra/inicia por tiempo — este MVP no tiene
-- cron, ver CLAUDE.md → Tournament Module Principles). El status
-- persistido sigue siendo la única fuente de verdad para el workflow
-- administrativo (OWNER/ADMIN sigue pudiendo registrar duplas en
-- registration_open/registration_closed/in_progress exactamente igual que
-- antes, sin ningún límite temporal nuevo — esta migración no toca esa
-- rama en absoluto), pero para un PLAYER las fechas reales del torneo
-- imponen además un límite duro: ni un cliente viejo ni una llamada
-- directa al RPC pueden inscribir después de que el propio horario del
-- torneo ya cerró. Cuerpo byte-idéntico a 20261027000001 salvo estas dos
-- validaciones nuevas, insertadas justo después del chequeo de status ya
-- existente en la rama PLAYER. registration_closes_at/starts_at ya son
-- timestamptz reales (no date+time separados como reservations), así que
-- compararlos contra now() es correcto en cualquier huso del
-- proceso/dispositivo que ejecute esto — sin necesidad de anclar a
-- America/Bogota acá (esa conversión ya ocurrió una sola vez, al guardar
-- el valor original).
CREATE OR REPLACE FUNCTION public.register_tournament_entry(
  p_tournament_id       uuid,
  p_club_member_one_id  uuid,
  p_club_member_two_id  uuid
)
RETURNS TABLE (
  id                 uuid,
  tournament_id      uuid,
  club_id            uuid,
  category           text,
  secondary_category text,
  status             text,
  points             integer,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  rejection_reason   text,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament      public.tournaments%ROWTYPE;
  v_caller_member   public.club_members%ROWTYPE;
  v_member_one      public.club_members%ROWTYPE;
  v_member_two      public.club_members%ROWTYPE;
  v_category_one    text;
  v_category_two    text;
  v_high_count      int;
  v_lock_first      uuid;
  v_lock_second     uuid;
  v_conflict_count  int;
  v_entry_count     int;
  v_entry           public.tournament_entries%ROWTYPE;
  v_is_admin        boolean;
  v_club_slug       text;
  v_member_one_name text;
  v_member_two_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments AS t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_club_member_one_id IS NULL OR p_club_member_two_id IS NULL THEN
    RAISE EXCEPTION 'Both players are required' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id = p_club_member_two_id THEN
    RAISE EXCEPTION 'The two players must be different' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_caller_member FROM (
    SELECT cm.* FROM public.club_members AS cm
    WHERE cm.club_id = v_tournament.club_id AND cm.profile_id = auth.uid() AND cm.is_active = true
    UNION ALL
    SELECT NULL::uuid, v_tournament.club_id, auth.uid(), 'OWNER'::text, true, now(), 'Principiante'::text
    WHERE public.is_superadmin_club_access(v_tournament.club_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_members AS cm2
        WHERE cm2.club_id = v_tournament.club_id AND cm2.profile_id = auth.uid() AND cm2.is_active = true
      )
  ) AS x(id, club_id, profile_id, role, is_active, joined_at, category)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  v_is_admin := v_caller_member.role IN ('OWNER', 'ADMIN');

  IF v_is_admin THEN
    IF v_tournament.status NOT IN ('registration_open', 'registration_closed', 'in_progress') THEN
      RAISE EXCEPTION 'Tournament is not accepting new pairs' USING ERRCODE = '22023';
    END IF;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> p_club_member_one_id AND v_caller_member.id <> p_club_member_two_id THEN
      RAISE EXCEPTION 'A player can only register a pair they are part of' USING ERRCODE = '42501';
    END IF;
    IF v_tournament.status <> 'registration_open' THEN
      RAISE EXCEPTION 'Tournament registration is not open' USING ERRCODE = '22023';
    END IF;
    -- Cierre temporal duro (nuevo) — el status persistido puede seguir
    -- diciendo 'registration_open' indefinidamente porque nadie lo cerró/
    -- inició a tiempo; para un PLAYER eso nunca vuelve a habilitar una
    -- inscripción una vez que el horario real del torneo ya pasó.
    IF v_tournament.registration_closes_at IS NOT NULL AND now() >= v_tournament.registration_closes_at THEN
      RAISE EXCEPTION 'Tournament registration window has closed' USING ERRCODE = '22023';
    END IF;
    IF v_tournament.starts_at IS NOT NULL AND now() >= v_tournament.starts_at THEN
      RAISE EXCEPTION 'Tournament registration window has closed' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  PERFORM public._require_club_not_archived(v_tournament.club_id);

  SELECT * INTO v_member_one
  FROM public.club_members AS cm WHERE cm.id = p_club_member_one_id AND cm.club_id = v_tournament.club_id;
  IF NOT FOUND OR v_member_one.is_active IS NOT TRUE OR v_member_one.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Player one is not an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member_two
  FROM public.club_members AS cm WHERE cm.id = p_club_member_two_id AND cm.club_id = v_tournament.club_id;
  IF NOT FOUND OR v_member_two.is_active IS NOT TRUE OR v_member_two.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Player two is not an active PLAYER member of this club' USING ERRCODE = '22023';
  END IF;

  SELECT c.category INTO v_category_one
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_club_member_one_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.category INTO v_category_two
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_club_member_two_id AND s.club_id = v_tournament.club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.secondary_category IS NULL THEN
    IF v_category_one <> v_tournament.category OR v_category_two <> v_tournament.category THEN
      RAISE EXCEPTION 'Player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_category_one NOT IN (v_tournament.category, v_tournament.secondary_category)
       OR v_category_two NOT IN (v_tournament.category, v_tournament.secondary_category) THEN
      RAISE EXCEPTION 'Player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;

    v_high_count := 0;
    IF v_category_one = v_tournament.category THEN v_high_count := v_high_count + 1; END IF;
    IF v_category_two = v_tournament.category THEN v_high_count := v_high_count + 1; END IF;
    IF v_high_count > 1 THEN
      RAISE EXCEPTION 'Invalid combined category pair for this tournament' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_club_member_one_id < p_club_member_two_id THEN
    v_lock_first := p_club_member_one_id; v_lock_second := p_club_member_two_id;
  ELSE
    v_lock_first := p_club_member_two_id; v_lock_second := p_club_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = p_tournament_id
    AND tem.club_member_id IN (p_club_member_one_id, p_club_member_two_id)
    AND tem.is_active = true
    AND te.status IN ('pending', 'confirmed');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has an active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_admin OR v_tournament.status = 'registration_open' THEN
    SELECT count(*) INTO v_entry_count
    FROM public.tournament_entries AS te
    WHERE te.tournament_id = p_tournament_id AND te.status IN ('pending', 'confirmed');

    IF v_entry_count >= v_tournament.max_pairs THEN
      RAISE EXCEPTION 'Tournament has reached its maximum number of pairs' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_is_admin THEN
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, secondary_category, status, confirmed_at, confirmed_by, created_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, v_tournament.secondary_category,
      'confirmed', now(), auth.uid(), auth.uid()
    )
    RETURNING * INTO v_entry;
  ELSE
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, secondary_category, status, created_by
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, v_tournament.secondary_category,
      'pending', auth.uid()
    )
    RETURNING * INTO v_entry;
  END IF;

  INSERT INTO public.tournament_entry_members (tournament_entry_id, tournament_id, club_id, club_member_id)
  VALUES
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_one_id),
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_two_id);

  SELECT c.slug INTO v_club_slug FROM public.clubs AS c WHERE c.id = v_tournament.club_id;

  IF v_is_admin THEN
    PERFORM public._notify_tournament_entry_players(
      v_entry.id,
      'tournament_entry_confirmed',
      'Inscripción confirmada',
      'Fuiste inscrito en el torneo "' || v_tournament.name || '".',
      jsonb_build_object(
        'tournament_id', p_tournament_id,
        'tournament_entry_id', v_entry.id,
        'destination', '/' || v_club_slug || '/tournaments/' || v_tournament.slug
      )
    );
  ELSE
    SELECT p.full_name INTO v_member_one_name FROM public.profiles AS p WHERE p.id = v_member_one.profile_id;
    SELECT p.full_name INTO v_member_two_name FROM public.profiles AS p WHERE p.id = v_member_two.profile_id;

    PERFORM public._notify_club_admins(
      v_tournament.club_id,
      'tournament_entry_created',
      'Nueva solicitud de inscripción',
      COALESCE(v_member_one_name, 'Un jugador') || ' y ' || COALESCE(v_member_two_name, 'un jugador') ||
        ' solicitaron inscribirse al torneo "' || v_tournament.name || '".',
      jsonb_build_object(
        'tournament_id', p_tournament_id,
        'tournament_entry_id', v_entry.id,
        'destination', '/' || v_club_slug || '/admin/tournaments/' || v_tournament.slug
      )
    );
  END IF;

  IF v_is_admin AND v_tournament.status = 'registration_open' THEN
    PERFORM public._close_tournament_registration_for_capacity(p_tournament_id, v_tournament.max_pairs, auth.uid());
  END IF;

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.secondary_category,
    v_entry.status, v_entry.points, v_entry.confirmed_at, v_entry.confirmed_by,
    v_entry.withdrawn_at, v_entry.withdrawn_by, v_entry.rejected_at, v_entry.rejected_by, v_entry.rejection_reason,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) TO authenticated;
