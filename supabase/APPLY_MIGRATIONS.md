# Aplicar Migraciones — Mi Pádel Club

Procedimiento vigente (desde el 15-oct-2026). Reemplaza las instrucciones
antiguas de "pegar en SQL Editor", que quedan en el historial de git.

## Cómo funciona hoy

- **Mecanismo: manual, con Supabase CLI.** No hay CI/CD (no existe
  `.github/workflows`), `vercel.json` solo define el cron comercial y
  `npm run build` es `next build`: **ningún push ni deploy aplica
  migraciones**. Nunca se debe agregar un pipeline automático.
- **SQL Editor: no.** Se usó hasta octubre de 2026; el 15-oct se regularizó
  `supabase_migrations.schema_migrations` con `supabase migration repair`
  para las versiones ejecutadas a mano. Ejecutar SQL de migración en el
  editor vuelve a desincronizar el historial.
- **Un solo entorno.** El proyecto `rfzyqmvqmqsjigcvxxnf` es producción
  (mipadel.club) y es también el que usa el desarrollo local
  (`.env.local`; `mobile/.env` se configura con el mismo proyecto). No hay staging: toda migración aplicada es
  una migración en producción.
- **Pendiente de verificar en el dashboard** (no visible desde el repo):
  que la integración de GitHub de Supabase (Project Settings → Integrations
  → GitHub) esté desactivada o sin "deploy to production" — si estuviera
  activa, un push a `main` sí podría aplicar migraciones.

## CLI

Versión fijada: **`supabase@2.121.0`** vía `npx` (sin instalar nada en el
proyecto). La 3.x cambió los flags (`--remote` en vez de `--linked`, apunta
a la base **local** por defecto y sincroniza vault antes de migrar): no
usarla sin revisar este documento.

```bash
npx --yes supabase@2.121.0 --version
```

Autenticación (una vez por máquina; abre el navegador — el token queda en el
llavero de macOS, nunca en el repo ni en el chat):

```bash
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref rfzyqmvqmqsjigcvxxnf
```

`link` pide la contraseña de la base (Dashboard → Project Settings →
Database). Se escribe en el prompt, nunca en un archivo versionado; la
vinculación queda en `supabase/.temp/` (ignorado por git).

## Procedimiento para una migración nueva

1. **Crear el archivo** con `npx --yes supabase@2.121.0 migration new <nombre>`
   (formato `YYYYMMDDHHMMSS_nombre.sql`, orden estrictamente creciente).
2. **Probar localmente** contra una base desechable (ver
   `scripts/test-*.sql`). Nunca contra producción.
3. **Verificar el destino**: `supabase/.temp/project-ref` debe ser
   `rfzyqmvqmqsjigcvxxnf`.
4. **Comparar historial** (solo lectura):
   ```bash
   npm run db:migrations:list
   ```
   Toda versión local debe aparecer en `Remote` salvo las nuevas. Si hay una
   versión remota sin archivo local, o una local antigua sin registro
   remoto: **detenerse** — no usar `--include-all` ni `migration repair` sin
   decisión explícita.
5. **Dry-run** (solo lectura): `npm run db:push:dry-run` — debe listar
   únicamente las migraciones autorizadas.
6. **Aplicar** (solo con autorización explícita, nunca como script):
   ```bash
   npx --yes supabase@2.121.0 db push --linked
   ```
   Cada archivo corre en su propia transacción.
7. **Regenerar tipos**: `npm run types:generate` (escribe
   `shared/types/database.ts` y nunca lo trunca si falla), luego
   `npx tsc --noEmit`.
8. **QA posterior**: `npm run db:migrations:list` (la versión aparece en
   ambos lados), smoke de los RPCs/rutas afectadas, y registrar en
   `PROJECT_STATUS.md`.

Nunca: `db reset --linked`, `db push --include-all` sin revisar,
`migration repair` sin decisión explícita, editar una migración ya aplicada
(se corrige con una migración nueva).
