-- ============================================================
-- Comercial v2 / Fase 1 — claim_club() inicia el trial comercial
-- Mi Pádel Club
-- ============================================================
-- Extiende claim_club (20261005000001) con una sola línea nueva —
-- PERFORM public.initialize_club_trial(...) — insertada justo después de
-- que la transferencia de OWNER y el registro de auditoría ya están
-- completos, y antes de construir la respuesta. Todo lo demás en esta
-- función es BYTE-IDÉNTICO a la versión vigente: no se reimplementa el
-- claim, no se reordena ninguna validación/lock existente, no se toca
-- pending_claim/club_claim_links/club_claim_events más allá de lo que ya
-- hacía. SET search_path = public se deja sin cambios deliberadamente —
-- esta es una función de seguridad crítica ya auditada; endurecerla a
-- search_path='' es una mejora separada, fuera del alcance de esta fase,
-- para no introducir riesgo en el mismo cambio que agrega la capa
-- comercial (initialize_club_trial en sí, la función nueva de esta fase,
-- sí usa SET search_path = '' — ver 20261115000003).
--
-- Por qué es seguro llamarla aquí y no desde el cliente en una segunda
-- llamada: initialize_club_trial corre DENTRO de la misma invocación de
-- función que el resto del claim, es decir, dentro de la misma transacción
-- del caller — si algo después fallara (no hay nada después salvo un
-- SELECT de solo lectura), todo el claim se revertiría junto con la
-- inicialización comercial. Nunca puede quedar un club reclamado sin
-- trial, ni un trial sin club reclamado.
CREATE OR REPLACE FUNCTION public.claim_club(p_token_hash text, p_ip text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_link                     public.club_claim_links%ROWTYPE;
  v_club_slug                text;
  v_account_type             text;
  v_is_platform_admin        boolean;
  v_pending_claim            boolean;
  v_owner_count              int;
  v_previous_owner_id        uuid;
  v_previous_owner_is_admin  boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  INSERT INTO public.profiles (id) VALUES (auth.uid())
    ON CONFLICT ON CONSTRAINT profiles_pkey DO NOTHING;

  -- Lock 1/3: the claim link/token row.
  SELECT * INTO v_link FROM public.club_claim_links WHERE token_hash = p_token_hash FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_link.status = 'claimed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  IF v_link.status = 'revoked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'revoked');
  END IF;

  -- Lock 2/3: the club row.
  SELECT pending_claim INTO v_pending_claim FROM public.clubs WHERE id = v_link.club_id FOR UPDATE;

  IF NOT v_pending_claim THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  END IF;

  -- Lock 3/3: every active OWNER row for this club — before inspecting or
  -- changing any of them, so a concurrent claim_club call for the same
  -- club can never interleave with this one.
  PERFORM 1 FROM public.club_members
  WHERE club_id = v_link.club_id AND role = 'OWNER' AND is_active = true
  FOR UPDATE;

  SELECT count(*) INTO v_owner_count
  FROM public.club_members
  WHERE club_id = v_link.club_id AND role = 'OWNER' AND is_active = true;

  -- Reject and do NOT attempt to silently repair — either shape here means
  -- something about this club's ownership state is not what
  -- platform_create_pending_club/this same function are supposed to
  -- guarantee, and needs manual review, not an automatic fix.
  IF v_owner_count = 0 THEN
    RAISE EXCEPTION 'Pending club has no active OWNER — data integrity error, requires manual review' USING ERRCODE = '55000';
  ELSIF v_owner_count > 1 THEN
    RAISE EXCEPTION 'Pending club has more than one active OWNER — refusing to claim, requires manual review' USING ERRCODE = '55000';
  END IF;

  SELECT cm.profile_id INTO v_previous_owner_id
  FROM public.club_members cm
  WHERE cm.club_id = v_link.club_id AND cm.role = 'OWNER' AND cm.is_active = true;

  SELECT (p.account_type = 'SUPERADMIN' OR p.is_platform_admin) INTO v_previous_owner_is_admin
  FROM public.profiles p WHERE p.id = v_previous_owner_id;

  IF NOT COALESCE(v_previous_owner_is_admin, false) THEN
    RAISE EXCEPTION 'This club already has a real, non-placeholder owner — claim links only apply to a club still held by its platform-admin placeholder OWNER'
      USING ERRCODE = '23514';
  END IF;

  -- The reclamante cannot be the same SUPERADMIN placeholder OWNER.
  IF v_previous_owner_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_claim_own_placeholder');
  END IF;

  SELECT account_type, is_platform_admin INTO v_account_type, v_is_platform_admin
  FROM public.profiles WHERE id = auth.uid();

  -- No platform admin (this one or any other) may ever become a club's
  -- definitive OWNER — SUPERADMIN's club_members exception above is
  -- strictly limited to the temporary placeholder row, never to this side
  -- of a claim.
  IF v_is_platform_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_type_incompatible');
  END IF;

  IF v_account_type IS NOT NULL AND v_account_type != 'OWNER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_type_incompatible');
  END IF;

  -- Activate the claimant as the club's real, definitive OWNER.
  INSERT INTO public.club_members (club_id, profile_id, role, is_active)
  VALUES (v_link.club_id, auth.uid(), 'OWNER', true);

  UPDATE public.profiles SET account_type = 'OWNER' WHERE id = auth.uid() AND account_type IS NULL;

  -- Retire the SUPERADMIN's temporary OWNER row. clubs.pending_claim is
  -- still true at this exact instant (flipped only in the next statement
  -- below) — enforce_club_members_account_type_consistency's narrow
  -- exception still applies to this UPDATE, so it is allowed through even
  -- though the profile is a SUPERADMIN.
  UPDATE public.club_members
  SET is_active = false
  WHERE club_id = v_link.club_id AND profile_id = v_previous_owner_id;

  -- Guarantee, asserted rather than assumed: exactly one active OWNER now.
  SELECT count(*) INTO v_owner_count
  FROM public.club_members
  WHERE club_id = v_link.club_id AND role = 'OWNER' AND is_active = true;

  IF v_owner_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly one active OWNER after claim, found %', v_owner_count USING ERRCODE = '55000';
  END IF;

  -- Single statement, using the row lock already held above — flips the
  -- persistent eligibility flag (permanently, one-way) while keeping the
  -- club active, exactly as it already was before the claim.
  UPDATE public.clubs SET pending_claim = false, is_active = true WHERE id = v_link.club_id;

  UPDATE public.club_claim_links
  SET status = 'claimed', claimed_at = now(), claimed_by = auth.uid()
  WHERE id = v_link.id;

  INSERT INTO public.club_claim_events
    (club_id, claim_link_id, event_type, actor_id, ip_address, previous_owner_id)
  VALUES
    (v_link.club_id, v_link.id, 'claimed', auth.uid(), LEFT(NULLIF(TRIM(p_ip), ''), 64), v_previous_owner_id);

  -- ── Comercial v2 / Fase 1 — única línea nueva de esta migración ────────
  -- El trial inicia aquí y solo aquí: auth.uid() ya es el OWNER definitivo
  -- real (la fila se insertó arriba), nunca antes de este punto. Idempotente
  -- por construcción (ver 20261115000003) — un reintento de esta misma
  -- transacción, si existiera, no duplicaría la suscripción ni el período.
  PERFORM public.initialize_club_trial(v_link.club_id, auth.uid());

  SELECT slug INTO v_club_slug FROM public.clubs WHERE id = v_link.club_id;

  RETURN jsonb_build_object('success', true, 'club_slug', v_club_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_club(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_club(text, text) TO authenticated;
