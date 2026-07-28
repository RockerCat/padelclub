-- ============================================================
-- get_club_member_email — ficha de contacto del modal "Miembro del club"
-- Mi Pádel Club
-- ============================================================
-- El modal necesita mostrar el correo del jugador. profiles NO tiene
-- columna de email (confirmado: solo full_name/avatar_url/phone/
-- last_club_id) — el correo real vive únicamente en auth.users, que
-- ningún cliente puede leer directamente. El único mecanismo existente en
-- el proyecto para exponer un email es un JOIN contra auth.users dentro de
-- una función SECURITY DEFINER (mismo patrón que get_club_join_requests,
-- 20260727000002, y las vistas de plataforma) — no hay ninguna función
-- genérica ya expuesta para "el email de un club_members activo cualquiera
-- (no solo solicitudes pendientes)", así que esta es nueva y mínima.
--
-- Autorización: misma disciplina ya exigida en el proyecto para toda RPC
-- administrativa — una consulta explícita y directa contra club_members
-- por una membresía ACTIVA de OWNER/ADMIN del caller en ESTE club, nunca
-- un helper de rol que pueda devolver NULL. Un caller sin esa membresía
-- activa es rechazado explícitamente (42501), sin fallback a una lectura
-- sin proteger.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_club_member_email(
  p_club_id        uuid,
  p_club_member_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.profile_id = auth.uid()
      AND cm.club_id = p_club_id
      AND cm.role IN ('OWNER', 'ADMIN')
      AND cm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorized to read this club''s member contact info' USING ERRCODE = '42501';
  END IF;

  SELECT u.email INTO v_email
  FROM public.club_members cm
  JOIN auth.users u ON u.id = cm.profile_id
  WHERE cm.id = p_club_member_id
    AND cm.club_id = p_club_id;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_club_member_email(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_member_email(uuid, uuid) TO authenticated;
