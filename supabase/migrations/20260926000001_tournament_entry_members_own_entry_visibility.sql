-- ============================================================
-- Torneos — un jugador ve a su propio compañero en una pareja pendiente
-- Mi Pádel Club
-- ============================================================
-- Causa raíz auditada: register_tournament_entry siempre persiste
-- correctamente las dos filas de tournament_entry_members en el mismo
-- INSERT — nunca fue un problema de persistencia ni de la consulta de
-- aplicación (getTournamentEntriesWithMembers). El problema era de RLS:
-- un PLAYER solo tenía SELECT garantizado sobre (a) su propia fila
-- (tournament_entry_members_select_own), o (b) las filas de cualquier
-- entry ya 'confirmed' (tournament_entry_members_select_confirmed).
-- Una pareja que un PLAYER registra para sí mismo siempre nace
-- 'pending' (register_tournament_entry), así que ninguna de esas dos
-- políticas cubría "ver la fila de mi propio compañero mientras la
-- pareja sigue pendiente" — entry.members solo traía la fila del
-- propio jugador y PairMemberSlot mostraba "Por confirmar" en el otro
-- slot de forma indefinida.
--
-- La primera versión de esta migración resolvía esto con una política
-- autorreferencial (USING con una subconsulta directa sobre la misma
-- tournament_entry_members) — eso rompió la carga en Supabase real. Se
-- corrigió manualmente allí usando una función SECURITY DEFINER
-- intermedia, que es lo que esta migración ahora deja fijado: la
-- política ya no consulta tournament_entry_members directamente, solo
-- llama a una función estable que hace esa comprobación por fuera del
-- plan de RLS de la política — sin autorreferencia, sin recursión.
--
-- Alcance sin cambios respecto a la versión anterior: un miembro del
-- club ve las filas de un tournament_entry cuando él mismo ya tiene una
-- fila ACTIVA en ESE MISMO entry (es uno de sus dos integrantes) — nunca
-- las de una pareja ajena todavía pendiente. Las políticas existentes
-- (admin ve todo; cualquier miembro ve las de un entry ya confirmed)
-- quedan intactas.

DROP POLICY IF EXISTS tournament_entry_members_select_own_entry
  ON public.tournament_entry_members;

CREATE OR REPLACE FUNCTION public.is_current_user_tournament_entry_member(
  p_tournament_entry_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_entry_members AS tem
    INNER JOIN public.club_members AS cm
      ON cm.id = tem.club_member_id
    WHERE tem.tournament_entry_id = p_tournament_entry_id
      AND tem.is_active = true
      AND cm.profile_id = auth.uid()
      AND cm.is_active = true
  );
$$;

REVOKE ALL
  ON FUNCTION public.is_current_user_tournament_entry_member(uuid)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.is_current_user_tournament_entry_member(uuid)
  TO authenticated;

CREATE POLICY tournament_entry_members_select_own_entry
  ON public.tournament_entry_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_current_user_tournament_entry_member(tournament_entry_id)
  );

NOTIFY pgrst, 'reload schema';
