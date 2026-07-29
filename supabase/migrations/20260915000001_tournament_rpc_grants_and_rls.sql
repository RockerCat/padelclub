-- ============================================================
-- Exposición segura de RPCs y RLS de Torneos
-- (Bloque 1.11, módulo de Torneos)
-- Mi Pádel Club
-- ============================================================
-- Esta migración no crea tablas, funciones, columnas ni índices nuevos.
-- Únicamente: (1) GRANT EXECUTE TO authenticated sobre las 17 funciones
-- SECURITY DEFINER ya existentes del módulo de Torneos, todas con REVOKE
-- ALL FROM PUBLIC vigente y cero GRANT previo (confirmado por auditoría
-- de las migraciones 20260909000001 a 20260914000001); (2) ENABLE ROW
-- LEVEL SECURITY sobre las 5 tablas núcleo del módulo (ninguna la tenía
-- activa todavía); (3) GRANT SELECT explícito sobre esas mismas tablas
-- (Postgres evalúa el GRANT de tabla ANTES que las políticas de RLS —
-- sin este GRANT ninguna política siguiente sería alcanzable, el mismo
-- gotcha ya documentado para courts/sport_categories); (4) políticas
-- SELECT mínimas, nunca INSERT/UPDATE/DELETE — toda escritura sigue
-- exclusivamente a través de las RPCs ya existentes.
--
-- Ninguna función nueva se crea en esta migración. tournament_entries y
-- tournament_entry_members se referencian mutuamente en sus reglas de
-- negocio, pero sus políticas de RLS están diseñadas para no crear
-- recursión: tournament_entries nunca consulta tournament_entry_members
-- (usa created_by = auth.uid(), ya presente en la propia fila, en lugar
-- de una función nueva); tournament_entry_members sí consulta
-- tournament_entries (solo para status = 'confirmed'), pero como esa
-- referencia es unidireccional, jamás se cierra el ciclo. Contrapartida
-- explícita y aceptada: un jugador agregado por un OWNER/ADMIN a una
-- entry todavía pendiente (no creada por él) no puede leerla ni ver sus
-- miembros hasta que se confirme — la propia RPC de retiro/confirmación
-- sigue funcionando igual, porque las RPCs son SECURITY DEFINER y no
-- dependen de RLS. Resolver esta brecha de lectura con un helper
-- SECURITY DEFINER dedicado queda para un bloque futuro, ya que esta
-- iteración excluye explícitamente CREATE FUNCTION.
--
-- club_player_point_movements y club_member_sport_state quedan
-- completamente intocados: ya tienen RLS activo con cero políticas
-- desde 20260820000001 (acceso deliberadamente cerrado a
-- authenticated/anon, solo alcanzable vía SECURITY DEFINER/service_role)
-- y esta iteración no expande su exposición.
--
-- Auditoría de precedentes reales reutilizados: is_club_member(uuid) y
-- club_role(uuid) (20260610000001) como únicos helpers de autorización;
-- el patrón de políticas aditivas/OR sin bloque único (courts, clubs);
-- courts_select_public_club / clubs_select_active (sin cláusula TO, es
-- decir alcanzables por anon) como precedente real y directo de que la
-- arquitectura pública ya depende de RLS directa para anon en páginas
-- públicas — reutilizado aquí para tournaments y tournament_matches
-- cuando el torneo es público, su club es público, activo y no
-- archivado, y el torneo no está en draft. clubs.visibility se
-- revalida de forma independiente en cada política pública (no solo
-- tournaments.visibility) porque el trigger de cascada
-- clubs.visibility → tournaments.visibility descrito en el diseño
-- original nunca llegó a implementarse en ningún bloque 1.3–1.10 —
-- confirmado por grep, cero triggers de ese nombre existen — así que
-- ambas condiciones se verifican explícitamente en vez de confiar en
-- una sola.
--
-- SUPERADMIN: ninguna política de ninguna tabla club-scoped existente
-- (clubs, courts, club_members, ...) referencia is_platform_admin
-- (confirmado por grep sobre supabase/migrations/*.sql) — consistente
-- con CLAUDE.md (SUPERADMIN nunca tiene fila en club_members, nunca
-- opera dentro de un club). Ninguna política aquí necesita, por tanto,
-- una cláusula especial para SUPERADMIN.
--
-- FORCE ROW LEVEL SECURITY: no se usa en ninguna tabla existente del
-- proyecto y no se introduce aquí.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────
-- 1. GRANT EXECUTE — las 17 funciones SECURITY DEFINER del módulo
-- ────────────────────────────────────────────────────────────────────────

-- 20260909000001_tournament_admin_functions.sql
GRANT EXECUTE ON FUNCTION public.create_tournament(
  uuid, text, text, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tournament(
  uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_tournament_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_tournament_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_tournament(uuid) TO authenticated;

-- 20260910000001_tournament_entry_registration_functions.sql
GRANT EXECUTE ON FUNCTION public.register_tournament_entry(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_tournament_entry(uuid) TO authenticated;

-- 20260911000001_generate_tournament_bracket_function.sql
GRANT EXECUTE ON FUNCTION public.generate_tournament_bracket(uuid) TO authenticated;

-- 20260912000001_tournament_scheduling_functions.sql
GRANT EXECUTE ON FUNCTION public.create_tournament_court_allocation(
  uuid, uuid, date, time, time
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tournament_court_allocation(
  uuid, uuid, date, time, time
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_tournament_court_allocation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_tournament_match(
  uuid, uuid, date, time, time
) TO authenticated;

-- 20260913000001_tournament_match_lifecycle_functions.sql
GRANT EXECUTE ON FUNCTION public.start_tournament_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_tournament_match_result(
  uuid, integer, integer, integer, integer, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_tournament_match_result(
  uuid, integer, integer, integer, integer, integer, integer
) TO authenticated;

-- 20260914000001_award_tournament_points_function.sql
GRANT EXECUTE ON FUNCTION public.award_tournament_points(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 2. ENABLE ROW LEVEL SECURITY — las 5 tablas núcleo
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tournaments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_court_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_entry_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches           ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────────────────
-- 3. GRANT SELECT — solo donde existe una política alcanzable
-- ────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.tournaments                  TO anon, authenticated;
GRANT SELECT ON public.tournament_matches           TO anon, authenticated;
GRANT SELECT ON public.tournament_court_allocations TO authenticated;
GRANT SELECT ON public.tournament_entries           TO authenticated;
GRANT SELECT ON public.tournament_entry_members     TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 4. Políticas RLS — tournaments
-- ────────────────────────────────────────────────────────────────────────

-- OWNER/ADMIN del club: ven cualquier torneo de su club, cualquier status,
-- cualquier visibility (incluye draft).
CREATE POLICY tournaments_select_admin
  ON public.tournaments
  FOR SELECT
  TO authenticated
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- Miembro activo del club (incluye PLAYER): cualquier torneo de su club
-- que no esté en draft.
CREATE POLICY tournaments_select_member
  ON public.tournaments
  FOR SELECT
  TO authenticated
  USING (
    status <> 'draft'
    AND public.is_club_member(club_id)
  );

-- Visitante externo (incluye anon): solo torneos públicos, no draft, de
-- un club activo, no archivado y también público. Ambas visibilidades
-- (tournaments.visibility y clubs.visibility) se verifican de forma
-- independiente porque no existe ningún trigger de cascada entre ellas.
CREATE POLICY tournaments_select_public
  ON public.tournaments
  FOR SELECT
  USING (
    status <> 'draft'
    AND visibility = 'public'
    AND EXISTS (
      SELECT 1
      FROM public.clubs AS c
      WHERE c.id = tournaments.club_id
        AND c.is_active = true
        AND c.archived_at IS NULL
        AND c.visibility = 'public'
    )
  );


-- ────────────────────────────────────────────────────────────────────────
-- 5. Políticas RLS — tournament_court_allocations
-- ────────────────────────────────────────────────────────────────────────

-- Solo OWNER/ADMIN del club — es información operativa de programación,
-- nunca expuesta a PLAYER ni a visitantes externos.
CREATE POLICY tournament_court_allocations_select_admin
  ON public.tournament_court_allocations
  FOR SELECT
  TO authenticated
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));


-- ────────────────────────────────────────────────────────────────────────
-- 6. Políticas RLS — tournament_entries
-- ────────────────────────────────────────────────────────────────────────

-- OWNER/ADMIN del club: cualquier entry, cualquier status.
CREATE POLICY tournament_entries_select_admin
  ON public.tournament_entries
  FOR SELECT
  TO authenticated
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- Miembro activo del club: entries confirmed (cualquiera), o la propia
-- entry que él mismo creó (cualquier status). No consulta
-- tournament_entry_members — evita cualquier ciclo de recursión con esa
-- tabla.
CREATE POLICY tournament_entries_select_member
  ON public.tournament_entries
  FOR SELECT
  TO authenticated
  USING (
    public.is_club_member(club_id)
    AND (
      status = 'confirmed'
      OR created_by = auth.uid()
    )
  );

-- Sin política para authenticated no-miembro ni para anon: acceso
-- externo a entries queda fuera de este bloque (postura conservadora,
-- sin precedente previo que la autorice).


-- ────────────────────────────────────────────────────────────────────────
-- 7. Políticas RLS — tournament_entry_members
-- ────────────────────────────────────────────────────────────────────────

-- OWNER/ADMIN del club: cualquier miembro de cualquier entry.
CREATE POLICY tournament_entry_members_select_admin
  ON public.tournament_entry_members
  FOR SELECT
  TO authenticated
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- Miembro activo del club: su propia fila (el club_member_id le
-- pertenece). No consulta tournament_entries.
CREATE POLICY tournament_entry_members_select_own
  ON public.tournament_entry_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_club_member(club_id)
    AND EXISTS (
      SELECT 1
      FROM public.club_members AS cm
      WHERE cm.id = tournament_entry_members.club_member_id
        AND cm.profile_id = auth.uid()
    )
  );

-- Miembro activo del club: miembros de cualquier entry ya confirmed.
-- Referencia unidireccional a tournament_entries (solo lee status) —
-- tournament_entries nunca referencia esta tabla de vuelta, así que no
-- se cierra ningún ciclo.
CREATE POLICY tournament_entry_members_select_confirmed
  ON public.tournament_entry_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_club_member(club_id)
    AND EXISTS (
      SELECT 1
      FROM public.tournament_entries AS te
      WHERE te.id = tournament_entry_members.tournament_entry_id
        AND te.status = 'confirmed'
    )
  );

-- Sin política para anon ni para authenticated no-miembro.


-- ────────────────────────────────────────────────────────────────────────
-- 8. Políticas RLS — tournament_matches
-- ────────────────────────────────────────────────────────────────────────

-- OWNER/ADMIN del club: cualquier match de su club.
CREATE POLICY tournament_matches_select_admin
  ON public.tournament_matches
  FOR SELECT
  TO authenticated
  USING (public.club_role(club_id) IN ('OWNER', 'ADMIN'));

-- Miembro activo del club: cualquier match de su club. No requiere
-- verificar el status del torneo padre porque los matches solo existen
-- a partir de generate_tournament_bracket, que exige
-- registration_closed — nunca hay filas de tournament_matches para un
-- torneo en draft.
CREATE POLICY tournament_matches_select_member
  ON public.tournament_matches
  FOR SELECT
  TO authenticated
  USING (public.is_club_member(club_id));

-- Visitante externo (incluye anon): solo matches de un torneo público,
-- no draft, de un club activo, no archivado y también público. Mismo
-- criterio doble-verificación que tournaments_select_public.
CREATE POLICY tournament_matches_select_public
  ON public.tournament_matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments AS t
      JOIN public.clubs AS c ON c.id = t.club_id
      WHERE t.id = tournament_matches.tournament_id
        AND t.status <> 'draft'
        AND t.visibility = 'public'
        AND c.is_active = true
        AND c.archived_at IS NULL
        AND c.visibility = 'public'
    )
  );
