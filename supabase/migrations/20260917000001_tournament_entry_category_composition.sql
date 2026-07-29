-- ============================================================
-- Validación de composición de categorías de la pareja
-- (Hotfix 2.2.1B, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Auditoría previa (obligatoria, confirmada antes de este archivo):
-- club_member_sport_state.club_member_id es PRIMARY KEY — exactamente una
-- fila por jugador, nunca más de una, nunca una por ciclo. La categoría
-- vigente se resuelve exactamente con el mismo patrón ya usado por
-- get_club_category_ranking (20260824000001): JOIN contra
-- club_ranking_cycles ON cycle_id AND ended_at IS NULL — nunca una noción
-- nueva de "vigencia". Cada jugador se resuelve con su propia consulta
-- (WHERE club_member_id = <ese id> AND club_id = <club del torneo>),
-- nunca un COUNT(*) global que pudiera ocultar una fila faltante, una fila
-- duplicada o una fila de otro club.
--
-- Regla (H = tournaments.category, siempre superior; L =
-- tournaments.secondary_category, siempre inferior — el modelo ya lo
-- garantiza desde 20260916000001, no se vuelve a consultar sort_order
-- aquí):
--   - secondary_category IS NULL (torneo simple C): ambos jugadores deben
--     tener category = C exactamente.
--   - secondary_category IS NOT NULL (torneo combinado H+L): ambos
--     jugadores deben pertenecer a {H, L}, y a lo sumo uno de los dos
--     puede ser H (H+L, L+H, L+L permitidos; H+H rechazado). La
--     comparación es simétrica respecto a los dos parámetros — nunca
--     depende de cuál llegó como "uno" o "dos".
--
-- Única función reemplazada: register_tournament_entry. Firma, retorno,
-- LANGUAGE, SECURITY DEFINER, search_path, auth.uid() interno,
-- autorización, advisory locks, validación de duplicados, capacidad,
-- inserción de entry/members y el estado inicial pending/confirmed quedan
-- byte-a-byte idénticos a 20260916000001. La única adición es la nueva
-- validación de sport state + composición, insertada justo después de
-- validar que ambos club_members son PLAYER activos del club correcto y
-- justo antes de los advisory locks — no requiere su propio dominio de
-- lock (es una lectura, sin condición de carrera distinta de las que ya
-- hacían las dos SELECT * INTO v_member_one/v_member_two inmediatamente
-- anteriores, ya ejecutadas antes de esos mismos locks) y rechaza una
-- solicitud inválida antes de pagar el costo de adquirir los locks.
-- ============================================================

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
  status             text,
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  withdrawn_at       timestamptz,
  withdrawn_by       uuid,
  created_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz,
  secondary_category text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tournament     public.tournaments%ROWTYPE;
  v_caller_member  public.club_members%ROWTYPE;
  v_member_one     public.club_members%ROWTYPE;
  v_member_two     public.club_members%ROWTYPE;
  v_category_one   text;
  v_category_two   text;
  v_high_count     int;
  v_lock_first     uuid;
  v_lock_second    uuid;
  v_conflict_count int;
  v_entry_count    int;
  v_entry          public.tournament_entries%ROWTYPE;
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

  IF v_tournament.status <> 'registration_open' THEN
    RAISE EXCEPTION 'Tournament registration is not open' USING ERRCODE = '22023';
  END IF;

  IF v_tournament.registration_opens_at > now() THEN
    RAISE EXCEPTION 'Tournament registration has not opened yet' USING ERRCODE = '22023';
  END IF;

  IF NOT (now() < v_tournament.registration_closes_at) THEN
    RAISE EXCEPTION 'Tournament registration window has closed' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id IS NULL OR p_club_member_two_id IS NULL THEN
    RAISE EXCEPTION 'Both players are required' USING ERRCODE = '22023';
  END IF;

  IF p_club_member_one_id = p_club_member_two_id THEN
    RAISE EXCEPTION 'The two players must be different' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_caller_member
  FROM public.club_members AS cm
  WHERE cm.club_id = v_tournament.club_id
    AND cm.profile_id = auth.uid()
    AND cm.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    NULL;
  ELSIF v_caller_member.role = 'PLAYER' THEN
    IF v_caller_member.id <> p_club_member_one_id AND v_caller_member.id <> p_club_member_two_id THEN
      RAISE EXCEPTION 'A player can only register a pair they are part of' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to register a pair for this tournament' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member_one
  FROM public.club_members AS cm
  WHERE cm.id = p_club_member_one_id AND cm.club_id = v_tournament.club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player one is not a member of this club' USING ERRCODE = '22023';
  END IF;
  IF v_member_one.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Player one does not have an active membership' USING ERRCODE = '22023';
  END IF;
  IF v_member_one.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can register for a tournament' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member_two
  FROM public.club_members AS cm
  WHERE cm.id = p_club_member_two_id AND cm.club_id = v_tournament.club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player two is not a member of this club' USING ERRCODE = '22023';
  END IF;
  IF v_member_two.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Player two does not have an active membership' USING ERRCODE = '22023';
  END IF;
  IF v_member_two.role <> 'PLAYER' THEN
    RAISE EXCEPTION 'Only PLAYER memberships can register for a tournament' USING ERRCODE = '22023';
  END IF;

  -- ─── Sport state + composición de categorías (Hotfix 2.2.1B) ───────────
  -- Cada jugador se resuelve individualmente, nunca con un COUNT global.
  -- Mismo join que get_club_category_ranking: club_member_sport_state
  -- solo tiene una fila por jugador (PK), unida a su ciclo vigente
  -- (ended_at IS NULL) para obtener la categoría real actual.
  SELECT c.category INTO v_category_one
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_club_member_one_id
    AND s.club_id = v_tournament.club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.category INTO v_category_two
  FROM public.club_member_sport_state AS s
  JOIN public.club_ranking_cycles AS c ON c.id = s.cycle_id AND c.ended_at IS NULL
  WHERE s.club_member_id = p_club_member_two_id
    AND s.club_id = v_tournament.club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player sport state not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tournament.secondary_category IS NULL THEN
    -- Torneo de categoría única: ambos deben coincidir exactamente.
    IF v_category_one <> v_tournament.category OR v_category_two <> v_tournament.category THEN
      RAISE EXCEPTION 'Player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Torneo combinado: ambos deben pertenecer a {H, L}; a lo sumo un H.
    -- Simétrico respecto a "uno"/"dos" — nunca depende del orden recibido.
    IF v_category_one NOT IN (v_tournament.category, v_tournament.secondary_category)
       OR v_category_two NOT IN (v_tournament.category, v_tournament.secondary_category) THEN
      RAISE EXCEPTION 'Player category is not allowed for this tournament' USING ERRCODE = '22023';
    END IF;

    v_high_count := 0;
    IF v_category_one = v_tournament.category THEN
      v_high_count := v_high_count + 1;
    END IF;
    IF v_category_two = v_tournament.category THEN
      v_high_count := v_high_count + 1;
    END IF;

    IF v_high_count > 1 THEN
      RAISE EXCEPTION 'Invalid combined category pair for this tournament' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_club_member_one_id < p_club_member_two_id THEN
    v_lock_first := p_club_member_one_id;
    v_lock_second := p_club_member_two_id;
  ELSE
    v_lock_first := p_club_member_two_id;
    v_lock_second := p_club_member_one_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_first::text));
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry:' || p_tournament_id::text || ':' || v_lock_second::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.tournament_entry_members AS tem
  JOIN public.tournament_entries AS te ON te.id = tem.tournament_entry_id
  WHERE tem.tournament_id = p_tournament_id
    AND tem.club_member_id IN (p_club_member_one_id, p_club_member_two_id)
    AND te.status IN ('pending', 'confirmed');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'One of the players already has an active entry in this tournament' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_entry_count
  FROM public.tournament_entries AS te
  WHERE te.tournament_id = p_tournament_id
    AND te.status IN ('pending', 'confirmed');

  IF v_entry_count >= v_tournament.bracket_size THEN
    RAISE EXCEPTION 'Tournament has reached its bracket size' USING ERRCODE = '22023';
  END IF;

  IF v_caller_member.role IN ('OWNER', 'ADMIN') THEN
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, status, confirmed_at, confirmed_by, created_by, secondary_category
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, 'confirmed', now(), auth.uid(), auth.uid(),
      v_tournament.secondary_category
    )
    RETURNING * INTO v_entry;
  ELSE
    INSERT INTO public.tournament_entries (
      tournament_id, club_id, category, status, created_by, secondary_category
    ) VALUES (
      p_tournament_id, v_tournament.club_id, v_tournament.category, 'pending', auth.uid(),
      v_tournament.secondary_category
    )
    RETURNING * INTO v_entry;
  END IF;

  INSERT INTO public.tournament_entry_members (tournament_entry_id, tournament_id, club_id, club_member_id)
  VALUES
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_one_id),
    (v_entry.id, p_tournament_id, v_tournament.club_id, p_club_member_two_id);

  RETURN QUERY SELECT
    v_entry.id, v_entry.tournament_id, v_entry.club_id, v_entry.category, v_entry.status,
    v_entry.confirmed_at, v_entry.confirmed_by, v_entry.withdrawn_at, v_entry.withdrawn_by,
    v_entry.created_by, v_entry.created_at, v_entry.updated_at, v_entry.secondary_category;
END;
$$;

REVOKE ALL ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) TO authenticated;
