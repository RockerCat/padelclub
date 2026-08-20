-- ============================================================
-- register_push_token — fix del conflicto RLS al reasignar un
-- ExpoPushToken existente a otro usuario en el mismo dispositivo
-- Mi Pádel Club
-- ============================================================
-- push_tokens.expo_push_token es UNIQUE (20261109000001) — el upsert
-- directo que hacía mobile (onConflict: expo_push_token) dispara, en
-- Postgres, un ON CONFLICT DO UPDATE sobre la fila YA EXISTENTE. Esa
-- UPDATE se evalúa contra la policy push_tokens_update_own
-- (USING profile_id = auth.uid()) — si el dispositivo ya había registrado
-- el token con otro usuario (A) y ahora hay una sesión distinta (B),
-- profile_id (A) != auth.uid() (B) y RLS bloquea la UPDATE con 42501
-- ("new row violates row-level security policy (USING expression)").
--
-- Esta función SECURITY DEFINER bypassa RLS solo para esta escritura
-- puntual, pero profile_id se toma SIEMPRE de auth.uid() — nunca de un
-- parámetro — así que el cliente no puede indicar ni arbitrar otro
-- profile_id; solo puede "reclamar" el token para su propia sesión
-- autenticada. Las 4 policies de push_tokens (select/insert/update/delete
-- _own) quedan sin tocar, igual que la tabla — esta función es la única
-- vía que necesita bypass, y solo para este caso puntual de reasignación
-- de dispositivo compartido.
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_expo_push_token text,
  p_platform        text,
  p_device_id       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.push_tokens (profile_id, expo_push_token, platform, device_id, is_active, last_seen_at)
  VALUES (auth.uid(), p_expo_push_token, p_platform, p_device_id, true, now())
  ON CONFLICT (expo_push_token) DO UPDATE SET
    profile_id   = auth.uid(),
    platform     = EXCLUDED.platform,
    device_id    = EXCLUDED.device_id,
    is_active    = true,
    last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text) TO authenticated;
