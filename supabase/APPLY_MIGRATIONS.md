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

## Storage Bucket — club-logos

Crear manualmente en el dashboard:

1. Ir a https://supabase.com/dashboard/project/rfzyqmvqmqsjigcvxxnf/storage/buckets
2. **New bucket**
3. Nombre: `club-logos`
4. **Public bucket**: ✅ activado
5. **Allowed MIME types**: `image/png, image/jpeg, image/webp, image/svg+xml`
6. **Max upload size**: `1 MB`
7. Guardar

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
