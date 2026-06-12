# Aplicar Migraciones — PadelClub

## Opción A — Supabase Dashboard (recomendada, sin CLI)

1. Ir a https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf
2. **SQL Editor** → **New query**
3. Copiar y pegar el contenido completo de:
   `supabase/migrations/20260610000001_sprint1_core_schema.sql`
4. Clic en **Run**
5. Verificar en **Table Editor** que existen: `profiles`, `clubs`, `club_members`, `invitation_links`

## Opción B — Supabase CLI

```bash
# 1. Login con la cuenta que tiene acceso al proyecto rfzyqmvqmqsjigcvxxnf
npx supabase login

# 2. Linkear el proyecto
npx supabase link --project-ref rfzyqmvqmqsjigcvxxnf

# 3. Aplicar migraciones
npx supabase db push

# 4. Regenerar tipos TypeScript
npx supabase gen types typescript \
  --project-id rfzyqmvqmqsjigcvxxnf \
  > src/types/database.ts
```

## Storage Bucket — club-logos (PENDIENTE — ejecutar antes de subir logos)

El bucket aún **no existe** en el proyecto hosted. Sin él toda subida falla con 403/404.

### Opción rápida: SQL Editor

1. Ir a https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf/sql/new
2. Copiar y ejecutar el contenido completo de:
   `supabase/migrations/20260611000004_club_logos_storage.sql`

Esto crea el bucket **y** las 4 políticas RLS en un solo paso.

### Opción alternativa: Dashboard UI + SQL para policies

**Paso 1 — Crear el bucket en el dashboard:**
1. Ir a https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf/storage/buckets
2. **New bucket**
3. Nombre: `club-logos` (exactamente, con guión)
4. **Public bucket**: ✅ activado
5. **Allowed MIME types**: `image/png, image/jpeg, image/webp`
6. **Max upload size**: `2097152` (2 MB en bytes)
7. Guardar

**Paso 2 — Crear las policies RLS en SQL Editor:**

```sql
-- Public read
CREATE POLICY "club_logos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'club-logos');

-- Owners can upload (path format: clubs/{club_id}/logo-{ts}.{ext})
CREATE POLICY "club_logos_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role = 'OWNER' AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "club_logos_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role = 'OWNER' AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "club_logos_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.profile_id = auth.uid()
        AND cm.role = 'OWNER' AND cm.is_active = true
        AND cm.club_id::text = (storage.foldername(name))[2]
    )
  );
```

### Verificar que el bucket existe

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'club-logos';
```

Debe devolver una fila. Si devuelve vacío, el bucket no fue creado.

## Migración 005 — Visibilidad del club + exploración pública (PENDIENTE)

`supabase/migrations/20260611000005_club_visibility.sql`

Ejecutar en el **SQL Editor** del proyecto Supabase:
`https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf/sql/new`

Este script:
1. Agrega columna `visibility TEXT NOT NULL DEFAULT 'public'` a `clubs`
2. Reemplaza `create_club_with_owner(text, text)` con versión 3-param que acepta `p_visibility`
3. Crea `get_public_clubs()` — función SECURITY DEFINER que devuelve clubes públicos excluyendo los del usuario
4. Crea `join_public_club(uuid)` — función SECURITY DEFINER para auto-unirse a clubes públicos

### Verificar después de ejecutar

```sql
-- Columna visibility existe
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'clubs' AND column_name = 'visibility';

-- Funciones nuevas registradas
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_public_clubs', 'join_public_club', 'create_club_with_owner');

-- Clubes existentes tienen visibility = 'public'
SELECT id, name, visibility FROM clubs LIMIT 5;
```

---

## Migración 006 — Branding en invitaciones (PENDIENTE)

`supabase/migrations/20260611000006_invite_branding.sql`

Recrea `get_invitation_preview` añadiendo `primary_color` y `secondary_color` en el objeto devuelto para que las pantallas de invitación/signup muestren los colores del club.

---

## Migración 007 — Módulo de Reservaciones (PENDIENTE)

`supabase/migrations/20260611000007_sprint3_reservations.sql`

Ejecutar en el **SQL Editor**:
`https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf/sql/new`

Este script:
1. Crea tabla `reservations` (cancha, fecha, hora, duración, tipo, estado)
2. Crea tabla `reservation_players` (relación N:N reserva–jugador)
3. Crea índices para consultas por club+fecha y cancha+fecha
4. Agrega trigger `set_reservations_updated_at`
5. Activa RLS y crea políticas:
   - Todos los miembros pueden leer reservas de su club
   - Solo OWNER/ADMIN pueden crear y modificar

### Verificar después de ejecutar

```sql
-- Tablas existen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('reservations', 'reservation_players');

-- RLS activo
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('reservations', 'reservation_players');

-- Políticas creadas
SELECT policyname, tablename FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reservations', 'reservation_players');
```

---

## Migración 008 — Horarios de operación del club (PENDIENTE)

`supabase/migrations/20260611000008_operating_hours.sql`

Ejecutar en el **SQL Editor**:
`https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf/sql/new`

Este script:
1. Crea tabla `club_operating_hours` (horario por día de la semana: apertura, cierre, abierto/cerrado)
2. Restricción `UNIQUE(club_id, day_of_week)` — un horario por día por club
3. `CHECK` que valida que apertura < cierre cuando `is_open = true`
4. Agrega trigger `set_club_operating_hours_updated_at`
5. Activa RLS y crea políticas:
   - Todos los miembros activos pueden leer
   - Solo OWNER puede insertar, actualizar y eliminar

### Verificar después de ejecutar

```sql
-- Tabla existe
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'club_operating_hours';

-- RLS activo
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'club_operating_hours';

-- Políticas creadas
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'club_operating_hours';
```

---

## Validación post-migración

En SQL Editor, ejecutar:

```sql
-- Verificar tablas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verificar funciones helper
SELECT routine_name, routine_schema
FROM information_schema.routines
WHERE routine_schema = 'auth'
  AND routine_name IN ('club_role', 'is_club_member');

-- Verificar trigger
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

## Regenerar tipos después de cada migración

```bash
npx supabase gen types typescript \
  --project-id rfzyqmvqmqsjigcvxxnf \
  > src/types/database.ts
```
