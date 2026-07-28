-- ============================================================
-- Profile avatars storage — foto de perfil del usuario (Mi Perfil)
-- Mi Pádel Club
-- ============================================================
-- Bucket dedicado a la foto de perfil de CADA usuario autenticado — no
-- confundir con club-logos/club-assets (20260611000004/20260615000007),
-- cuyo dueño es el CLUB, no la persona que sube el archivo.
--
-- Path convention: {auth.uid()}/avatar-{timestamp}.{ext}
--
-- storage.foldername('11111111-.../avatar-123.webp') → ARRAY['11111111-...']
-- [1] = auth.uid() del dueño.
--
-- profiles.id === auth.uid() siempre — mismo UUID, confirmado por la
-- política ya existente profiles_update_own (20260610000001):
-- `ON public.profiles FOR UPDATE USING (id = auth.uid())`. Por eso la
-- carpeta puede compararse directamente contra auth.uid() sin necesidad de
-- unir con ninguna otra tabla — a diferencia de club-logos/club-assets,
-- que sí requieren JOIN contra club_members porque ahí el dueño real del
-- archivo es el club, no quien lo sube.
--
-- Mismos límites y tipos MIME que club-assets (20260615000007): 5 MB,
-- jpeg/png/webp únicamente. Nunca SVG (riesgo si se sirve inline) ni GIF.
--
-- Nada más en este archivo: sin escrituras de prueba, sin datos de
-- usuarios, sin cambios a profiles/RLS de profiles (ya cubierto por
-- profiles_update_own + el GRANT UPDATE (avatar_url, ...) existente,
-- 20260809000001) — solo el bucket y sus políticas de storage.objects.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública — el bucket es público, pero storage.objects igual
-- requiere una política explícita (mismo comentario que club_logos_select
-- / club_assets_select).
CREATE POLICY "profile_avatars_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-avatars');

-- Un usuario autenticado solo puede subir dentro de su propia carpeta
-- (primer segmento de la ruta = su propio auth.uid()) — nunca la carpeta
-- de otro usuario, sin importar qué ruta intente pasar el cliente.
CREATE POLICY "profile_avatars_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reemplazo (UPDATE) — misma regla de propiedad que INSERT.
CREATE POLICY "profile_avatars_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Eliminación — misma regla de propiedad. Cubre tanto "reemplazar foto"
-- (se borra la anterior después de guardar la nueva) como "eliminar foto"
-- (se borra la única existente).
CREATE POLICY "profile_avatars_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
