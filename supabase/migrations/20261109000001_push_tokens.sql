-- ============================================================
-- Push tokens (Expo) — infraestructura Fase 1
-- Mi Pádel Club
-- ============================================================
-- Solo registro de dispositivos. NINGÚN sender/envío real vive aquí
-- todavía — ver CLAUDE.md → Notifications & Live-Update Principles: push
-- es OTRO CANAL de entrega de las notifications reales que ya existen
-- (public.notifications, 20260727000001), nunca un sistema paralelo. La
-- Fase 2 (Edge Function sender) leerá esta tabla vía service_role, que
-- siempre ignora RLS — no se necesita ninguna policy de lectura
-- cross-profile para eso.
--
-- expo_push_token es la clave de deduplicación real, NO
-- (profile_id, expo_push_token): un token de Expo identifica un
-- device+app-install concreto, nunca a una persona — si el mismo
-- dispositivo se reasigna a otra cuenta (logout/login de otro usuario en
-- el mismo teléfono, dispositivo compartido/de pruebas), debe haber como
-- máximo una fila viva por token, reapuntada al profile_id actual vía
-- upsert(onConflict: expo_push_token) — nunca una segunda fila "huérfana"
-- del usuario anterior. Varios dispositivos por profile_id sí son
-- normales y esperados (un jugador con teléfono + tablet): eso es
-- simplemente varias filas con distinto expo_push_token y el mismo
-- profile_id, sin ninguna restricción que lo impida.
--
-- is_active (en vez de borrar la fila) — el mecanismo "token
-- activo/inactivo" pedido: la Fase 2 solo debe enviar a
-- is_active = true, y un token que empiece a fallar (dispositivo
-- desinstalado, token revocado por Expo/APNs/FCM) se desactiva ahí sin
-- perder el historial de cuándo se vio por última vez (last_seen_at).
-- ============================================================

CREATE TABLE public.push_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_push_token  text NOT NULL,
  platform         text NOT NULL CHECK (platform IN ('ios', 'android')),
  -- Best-effort, informativo únicamente (modelo/OS del dispositivo) —
  -- expo-device no expone ningún identificador estable de instalación sin
  -- agregar otra dependencia (expo-application), y esta fase solo instala
  -- lo estrictamente necesario. La deduplicación real es expo_push_token
  -- (UNIQUE abajo), nunca este campo.
  device_id        text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expo_push_token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Un usuario autenticado solo puede leer/crear/actualizar/borrar SUS
-- propios tokens — nunca los de otro perfil, ni siquiera dentro del mismo
-- club (esta tabla no tiene noción de club: un dispositivo pertenece a una
-- cuenta, no a una membresía). El backend (service_role, Fase 2) ignora
-- RLS por diseño de Supabase, así que no existe ni debe existir ninguna
-- policy que amplíe la lectura más allá de "propio perfil" para un rol
-- autenticado normal.
CREATE POLICY "push_tokens_select_own"
  ON public.push_tokens FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "push_tokens_insert_own"
  ON public.push_tokens FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "push_tokens_update_own"
  ON public.push_tokens FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "push_tokens_delete_own"
  ON public.push_tokens FOR DELETE
  USING (profile_id = auth.uid());

-- GRANT explícito en la MISMA migración que crea la tabla — a diferencia
-- de notifications (donde solo SECURITY DEFINER functions insertan, así
-- que RLS por sí sola ya bastaba), aquí el cliente mobile escribe
-- directo desde el rol `authenticated` vía supabase-js. Postgres evalúa
-- el GRANT antes que las policies de RLS: sin este GRANT, todo insert
-- falla con "permission denied for table push_tokens" (42501) pese a
-- tener una policy correcta — exactamente el bug real, dos veces, que
-- CLAUDE.md ya documenta para notifications
-- (20260730000001_grant_notifications_authenticated.sql) y
-- club_join_requests (20260620000003_grant_join_requests_authenticated.sql).
-- Se agrega aquí desde el inicio para no repetirlo una tercera vez.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;

CREATE INDEX push_tokens_profile_active_idx
  ON public.push_tokens (profile_id, is_active);

CREATE TRIGGER set_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
