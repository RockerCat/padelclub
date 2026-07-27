-- ============================================================
-- Personal user profile — Phase 10
-- Mi Pádel Club
-- ============================================================
-- Read-only, self-only aggregate of the authenticated account's own
-- reservation activity across EVERY club they've ever been part of —
-- including clubs they've since left, been deactivated from, or that are
-- now archived. This must be SECURITY DEFINER: the only SELECT policy on
-- `reservations`/`reservation_players` ("club members read reservations" /
-- "club members read reservation_players", 20260611000007) requires
-- club_role(club_id) IS NOT NULL, which itself requires a CURRENTLY ACTIVE
-- club_members row (club_role, 20260610000001) — there is no
-- identity-based fallback in RLS for a user's own historical rows. A plain
-- client-side query (like src/lib/playerReservations.ts already uses for
-- the still-a-member, forward-looking case) would silently return nothing
-- for any club the user has left, been deactivated from, or that's
-- archived — this function exists specifically to read past that gap for
-- the caller's OWN data only, deriving identity exclusively from
-- auth.uid(). No parameter of any kind is accepted — there is no
-- p_profile_id/p_user_id to trust or reject, by construction.
--
-- ─── Personal participation rule (corrected — see audit) ───────────────────
-- reservations.created_by is NOT, by itself, evidence of personal
-- participation. Audited flows (real code, not assumed):
--   - PLAYER's own booking (create_reservation_player,
--     src/app/(app)/[club]/reservations/actions.ts →
--     20260814000001_update_reservation.sql) never inserts into
--     reservation_players at all — created_by is the ONLY evidence of a
--     player's own reservation, and it is always genuine (this RPC is only
--     reachable by an active club member requesting their own slot).
--   - OWNER/ADMIN's admin-created booking (create_reservation_admin +
--     the reservation_players insert in createReservation,
--     src/app/(app)/[club]/admin/reservations/actions.ts:109-112) records
--     the OPERATOR in created_by and the SELECTED PLAYERS in
--     reservation_players. The player picker
--     (admin/reservations/new/page.tsx:63-66) is filtered to
--     `role = 'PLAYER'` — an OWNER/ADMIN can never appear in their own
--     player list, so they can never be added to reservation_players via
--     any existing flow. A club-wide/administrative booking with zero
--     named players is therefore INDISTINGUISHABLE, in the stored data,
--     from an OWNER/ADMIN who "played themselves" — there is no reliable
--     signal to tell them apart, and per this project's own principle of
--     never approximating a metric that can't be computed correctly, the
--     safe choice is to never count it.
--   - This exact ambiguity is already resolved elsewhere in this codebase:
--     getReservationForEdit (admin/reservations/actions.ts:314-325,530)
--     computes `creator_is_player: creatorMembership?.role === "PLAYER"`
--     specifically so the UI never treats an OWNER/ADMIN's created_by as a
--     stand-in participant. This function applies the same distinction,
--     via the caller's global, immutable `profiles.account_type` (an
--     account typed OWNER/ADMIN can never also hold a PLAYER-role
--     club_members row anywhere — enforced by join_public_club/
--     create_join_request/claim_invitation's own account_type checks — so
--     the global account_type is equivalent to a per-club PLAYER role
--     check here, without an extra join).
--
-- Final rule — a reservation counts as the caller's own personal activity
-- if and only if:
--   (a) the caller appears explicitly in reservation_players, OR
--   (b) the caller is reservations.created_by AND their own
--       profiles.account_type is exactly 'PLAYER'.
-- Administrative bookings an OWNER/ADMIN creates for third parties, for
-- the club, or with no named players are NEVER counted under (b) — never
-- inferred from the absence of reservation_players rows. It is expected
-- and correct for an OWNER/ADMIN's personal summary to be all zeros: the
-- current product has no flow that can ever record them as a participant.
--
-- Implementation: public._my_reservations(p_account_type) is the single,
-- internal (never GRANTed to authenticated) source of this predicate —
-- every block below derives its aggregate from a `WITH my_reservations AS
-- (SELECT * FROM public._my_reservations(v_account_type))` CTE that just
-- selects from this one function, so the rule can never drift into a
-- second, slightly different copy. profiles.account_type is fetched
-- EXACTLY ONCE per call, into v_account_type, and passed in — never
-- re-queried per block.
--
-- type = 'block' is excluded from every block below — a court block is
-- not a reservation of the caller's time. Real type values (CHECK
-- constraint, 20260611000007, unchanged since): 'match', 'class', 'block'.
-- Real status values (CHECK constraint, final form per 20260804000001):
-- 'confirmed', 'pending', 'cancelled', 'rejected' — all four are surfaced
-- explicitly, nothing merged (unlike Phase 9's club-level KPI, which
-- combines cancelled+rejected into one figure; this phase keeps them
-- separate per its own explicit metric list).
--
-- Metric definitions (unchanged from the original phase, now computed
-- from the corrected base set): totalReservations = count of deduplicated
-- non-block reservations that are the caller's own personal participation
-- (any status); confirmed/pending/cancelled/rejected = count with that
-- status; matches/classes = count with that type; confirmedMinutes/
-- confirmedHours = sum(duration_minutes) of CONFIRMED reservations only,
-- converted to hours — never called "horas jugadas"/"asistencia" anywhere
-- in the UI layer, since nothing here verifies real attendance. No
-- monetary field, no ranking/ELO/win-loss field exists anywhere in this
-- function.
--
-- Timezone: reservations.date is already a plain America/Bogota local
-- calendar date — it is NEVER reinterpreted as UTC or converted. The only
-- place a real instant conversion happens is computing "what is today, in
-- Bogota" to anchor the 12-month window, via the same
-- `now() AT TIME ZONE 'America/Bogota'` idiom already established
-- elsewhere in this codebase (cancel_reservation, update_reservation,
-- archive_club, etc.) — never `AT TIME ZONE 'UTC'`.
--
-- Index note: reservations.created_by still has no index (confirmed in
-- the prior audit — unchanged by this correction). The corrected rule
-- narrows, rather than widens, how often that branch of the predicate can
-- ever match (it now only ever applies to callers whose own
-- profiles.account_type = 'PLAYER'), but the underlying query still scans
-- `reservations` filtering on `created_by = auth.uid()` for those callers,
-- with no index support. Left unadded — no EXPLAIN against real data
-- volume exists yet to justify it; revisit once real volume is available.
-- ============================================================

-- ─── Private helper: the one participation predicate, reused by every
-- block in get_my_profile_activity — never re-implemented per block ──────
-- SECURITY INVOKER (the default — no elevated-privilege clause needed of
-- its own): this function is never callable directly by `authenticated`
-- (REVOKE ALL FROM PUBLIC below, no GRANT to authenticated/anon) — its
-- only caller is get_my_profile_activity(), which is itself SECURITY
-- DEFINER. A SECURITY DEFINER function's privilege escalation already
-- applies to everything executed within its call, including nested calls
-- to a SECURITY INVOKER function — "invoker" at that point IS the
-- definer (postgres), so this still reads past RLS exactly as before,
-- without needing to declare its own, unnecessary SECURITY DEFINER.
-- auth.uid() is unaffected either way — it reads a session-level setting,
-- not the current role, so it resolves identically here regardless of
-- this function's own security mode.
CREATE OR REPLACE FUNCTION public._my_reservations(p_account_type text)
RETURNS TABLE (
  id uuid,
  club_id uuid,
  court_id uuid,
  date date,
  start_time time,
  duration_minutes integer,
  type text,
  status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public AS $$
  SELECT r.id, r.club_id, r.court_id, r.date, r.start_time, r.duration_minutes, r.type, r.status
  FROM public.reservations r
  LEFT JOIN public.reservation_players rp
    ON rp.reservation_id = r.id AND rp.profile_id = auth.uid()
  WHERE r.type != 'block'
    AND (
      -- (a) explicit participant — always valid, regardless of role
      rp.profile_id IS NOT NULL
      -- (b) creator, but ONLY when the creator's own account is a PLAYER —
      -- an OWNER/ADMIN's created_by is administrative authorship, never
      -- inferred as personal participation
      OR (r.created_by = auth.uid() AND p_account_type = 'PLAYER')
    );
$$;

REVOKE ALL ON FUNCTION public._my_reservations(text) FROM PUBLIC;


CREATE OR REPLACE FUNCTION public.get_my_profile_activity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_account_type   text;
  v_today_bogota   date;
  v_month_start    date;
  v_window_start   date;
  v_summary        jsonb;
  v_type_dist      jsonb;
  v_monthly        jsonb;
  v_recent         jsonb;
  v_memberships    jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Fetched exactly once, passed into every _my_reservations() call below
  -- — never re-queried per block. NULL (untyped account, or no profile
  -- row) safely falls through _my_reservations' own `p_account_type =
  -- 'PLAYER'` check as not-true, excluding the created_by branch entirely.
  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = auth.uid();

  -- "Today" anchored in America/Bogota, never the database session's own
  -- timezone (which may be UTC) — same pattern as every other Bogota-aware
  -- computation in this codebase.
  v_today_bogota := (now() AT TIME ZONE 'America/Bogota')::date;
  v_month_start   := date_trunc('month', v_today_bogota)::date;
  v_window_start  := (v_month_start - interval '11 months')::date;

  -- ─── Resumen personal (all-time — this phase has no period selector) ────
  WITH my_reservations AS (
    SELECT * FROM public._my_reservations(v_account_type)
  )
  SELECT jsonb_build_object(
    'totalReservations', count(*),
    'confirmed',  count(*) FILTER (WHERE status = 'confirmed'),
    'pending',    count(*) FILTER (WHERE status = 'pending'),
    'cancelled',  count(*) FILTER (WHERE status = 'cancelled'),
    'rejected',   count(*) FILTER (WHERE status = 'rejected'),
    'matches',    count(*) FILTER (WHERE type = 'match'),
    'classes',    count(*) FILTER (WHERE type = 'class'),
    'confirmedMinutes', COALESCE(sum(duration_minutes) FILTER (WHERE status = 'confirmed'), 0)
  )
  INTO v_summary
  FROM my_reservations;

  v_summary := v_summary || jsonb_build_object(
    'confirmedHours', round(((v_summary->>'confirmedMinutes')::numeric) / 60.0, 1)
  );

  -- ─── Distribución por tipo — same all-time scope as summary, same
  -- underlying counts by construction (never a second, possibly-drifting
  -- query) — only 'match'/'class' exist as non-block types, so only those
  -- two are shown, never an invented "reserva normal" category ────────────
  v_type_dist := jsonb_build_array(
    jsonb_build_object('type', 'match', 'label', 'Partidos', 'count', (v_summary->>'matches')::int),
    jsonb_build_object('type', 'class', 'label', 'Clases',   'count', (v_summary->>'classes')::int)
  );

  -- ─── Evolución mensual — fixed 12-month window (11 months back through
  -- the current month, inclusive), reservations.date, all statuses,
  -- zero-filled, never created_at ──────────────────────────────────────────
  WITH my_reservations AS (
    SELECT * FROM public._my_reservations(v_account_type)
  ),
  months AS (
    SELECT generate_series(v_window_start::timestamp, v_month_start::timestamp, interval '1 month')::date AS m
  ),
  counts AS (
    SELECT date_trunc('month', mr.date::timestamp)::date AS m, count(*) AS cnt
    FROM my_reservations mr
    WHERE mr.date >= v_window_start
    GROUP BY 1
  )
  SELECT jsonb_agg(
    jsonb_build_object('month', to_char(mo.m, 'YYYY-MM'), 'count', COALESCE(c.cnt, 0))
    ORDER BY mo.m
  )
  INTO v_monthly
  FROM months mo LEFT JOIN counts c ON c.m = mo.m;

  -- ─── Actividad reciente — most recent 15, reservations.date/start_time
  -- descending, never created_at; club/court names joined for display,
  -- never a raw id shown by the UI layer ──────────────────────────────────
  WITH my_reservations AS (
    SELECT * FROM public._my_reservations(v_account_type)
  ),
  recent AS (
    SELECT * FROM my_reservations ORDER BY date DESC, start_time DESC LIMIT 15
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'clubName', c.name,
      'courtName', co.name,
      'date', r.date::text,
      'startTime', to_char(r.start_time, 'HH24:MI'),
      'durationMinutes', r.duration_minutes,
      'type', r.type,
      'status', r.status
    )
    ORDER BY r.date DESC, r.start_time DESC
  )
  INTO v_recent
  FROM recent r
  JOIN public.clubs c ON c.id = r.club_id
  JOIN public.courts co ON co.id = r.court_id;

  -- ─── Membresías actuales — is_active = true only (never a departed/
  -- deactivated membership); archived is purely informational, never used
  -- to filter — Phase 8's archival rules are untouched by this function.
  -- Independent of the participation rule above and of whether the caller
  -- has any personal activity at all ───────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'clubName', c.name,
      'role', cm.role,
      'archived', c.archived_at IS NOT NULL
    )
    ORDER BY c.name
  )
  INTO v_memberships
  FROM public.club_members cm
  JOIN public.clubs c ON c.id = cm.club_id
  WHERE cm.profile_id = auth.uid() AND cm.is_active = true;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'typeDistribution', v_type_dist,
    'monthlyActivity', COALESCE(v_monthly, '[]'::jsonb),
    'recentReservations', COALESCE(v_recent, '[]'::jsonb),
    'activeMemberships', COALESCE(v_memberships, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_activity() TO authenticated;
