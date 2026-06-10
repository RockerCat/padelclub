# PadelClub — Routes & Navigation

> Next.js 16 App Router. Route groups enforce layout boundaries.
> All authenticated routes are scoped under `/(app)/[club]/`.
> Routes are listed as a complete system. Phase 1 routes (Sprints 0–3) are built before the Validation Gate. Phase 2 routes (Sprints 4–7) are built only after validation passes.
> Last updated: 2026-06-10 (rev 2 — sprint labels, phased nav, admin table updated)

---

## Route Groups Overview

| Group | Path prefix | Description | Auth required |
|---|---|---|---|
| `(marketing)` | `/` | Public landing page | No |
| `(app)` | `/[club]/...` | Authenticated club app | Yes |
| `auth` | `/auth/...` | Login / signup / callback | No (redirects if authenticated) |

---

## Full Route Tree

```
src/app/
│
├── layout.tsx                          # Root: Geist fonts, metadata, lang="es"
├── globals.css                         # Tailwind 4 @theme tokens
├── favicon.ico
│
├── (marketing)/                        # ─── PUBLIC LANDING [Sprint 0, complete] ──
│   ├── layout.tsx                      # Navbar + Footer
│   └── page.tsx                        # / → Marketing landing page
│
├── auth/                               # ─── AUTHENTICATION [Sprint 1] ────────────
│   ├── login/
│   │   └── page.tsx                    # /auth/login
│   ├── signup/
│   │   └── page.tsx                    # /auth/signup
│   └── callback/
│       └── route.ts                    # /auth/callback (Supabase OAuth exchange)
│
├── onboarding/                         # ─── CLUB SETUP [Sprint 1] ─────────────────
│   └── page.tsx                        # /onboarding → create new club (post-signup)
│
└── (app)/                              # ─── AUTHENTICATED APP ──────────────────────
    ├── layout.tsx                      # Auth guard: redirect to /auth/login if no session
    │
    └── [club]/                         # tenant slug (e.g. "platino-padel")
        ├── layout.tsx                  # Club branding + resolve club context [Sprint 1]
        │
        ├── page.tsx                    # /[club] → placeholder home (Sprint 1) → full portal (Sprint 7)
        │
        ├── dashboard/                  # ─── OWNER DASHBOARD [Sprint 3 widget / Sprint 7 full] ──
        │   └── page.tsx                # /[club]/dashboard  [OWNER only]
        │
        ├── profile/                    # ─── PLAYER PROFILE [Sprint 7] ─────────────
        │   └── page.tsx                # /[club]/profile  [any member]
        │
        ├── reservations/               # ─── RESERVATIONS (player view) [Sprint 3] ──
        │   └── page.tsx                # /[club]/reservations
        │
        ├── rankings/                   # ─── RANKINGS [Sprint 5 — post-validation] ──
        │   └── page.tsx                # /[club]/rankings
        │
        ├── tournaments/                # ─── TOURNAMENTS [Sprint 4 — post-validation] ─
        │   ├── page.tsx                # /[club]/tournaments
        │   └── [id]/
        │       └── page.tsx            # /[club]/tournaments/[id]
        │
        ├── clinics/                    # ─── CLINICS [Sprint 6 — post-validation] ───
        │   ├── page.tsx                # /[club]/clinics
        │   └── [id]/
        │       └── page.tsx            # /[club]/clinics/[id]
        │
        └── admin/                      # ─── ADMIN PANEL ────────────────────────────
            ├── layout.tsx              # Admin guard: redirect if role = PLAYER [Sprint 1]
            ├── page.tsx                # /[club]/admin → redirect to /admin/reservations
            │
            ├── courts/                 # [Sprint 2]
            │   ├── page.tsx            # /[club]/admin/courts
            │   └── [id]/
            │       └── page.tsx        # /[club]/admin/courts/[id] (edit)
            │
            ├── reservations/           # [Sprint 3]
            │   └── page.tsx            # /[club]/admin/reservations
            │
            ├── players/                # [Sprint 2]
            │   ├── page.tsx            # /[club]/admin/players
            │   └── [id]/
            │       └── page.tsx        # /[club]/admin/players/[id]
            │
            ├── tournaments/            # [Sprint 4 — post-validation]
            │   ├── page.tsx            # /[club]/admin/tournaments
            │   ├── new/
            │   │   └── page.tsx        # /[club]/admin/tournaments/new
            │   └── [id]/
            │       ├── page.tsx        # /[club]/admin/tournaments/[id] (overview)
            │       ├── participants/
            │       │   └── page.tsx    # /[club]/admin/tournaments/[id]/participants
            │       ├── bracket/
            │       │   └── page.tsx    # /[club]/admin/tournaments/[id]/bracket
            │       └── results/
            │           └── page.tsx    # /[club]/admin/tournaments/[id]/results
            │
            ├── rankings/               # [Sprint 5 — post-validation]
            │   └── page.tsx            # /[club]/admin/rankings
            │
            ├── clinics/                # [Sprint 6 — post-validation]
            │   ├── page.tsx            # /[club]/admin/clinics
            │   └── [id]/
            │       └── page.tsx        # /[club]/admin/clinics/[id]
            │
            └── settings/              # [Sprint 1]
                └── page.tsx            # /[club]/admin/settings (branding + config)
```

---

## Permission Matrix

| Route | OWNER | ADMIN | PLAYER |
|---|:---:|:---:|:---:|
| `/[club]` | ✓ | ✓ | ✓ |
| `/[club]/profile` | ✓ | ✓ | ✓ |
| `/[club]/reservations` | ✓ | ✓ | ✓ |
| `/[club]/rankings` | ✓ | ✓ | ✓ |
| `/[club]/tournaments` | ✓ | ✓ | ✓ |
| `/[club]/tournaments/[id]` | ✓ | ✓ | ✓ |
| `/[club]/clinics` | ✓ | ✓ | ✓ |
| `/[club]/dashboard` | ✓ | — | — |
| `/[club]/admin/*` | ✓ | ✓ | — |
| `/[club]/admin/settings` | ✓ | — | — |

---

## Layout Hierarchy

### Root layout — `src/app/layout.tsx`

Sets Geist fonts, `lang="es"`, global CSS. Wraps all routes.

### `(marketing)` layout — `src/app/(marketing)/layout.tsx`

Adds marketing `<Navbar />` + `<Footer />`. Already implemented.

### `(app)` layout — `src/app/(app)/layout.tsx`

**Responsibilities:**
- Verify Supabase session exists (server-side).
- Redirect to `/auth/login?next=<current-path>` if unauthenticated.
- Render the app shell (no nav here — nav is in `[club]/layout.tsx`).

```typescript
// src/app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  return <>{children}</>;
}
```

### `[club]` layout — `src/app/(app)/[club]/layout.tsx`

**Responsibilities:**
- Resolve `club` slug → `clubs` row.
- Verify user is a member of that club.
- Inject club branding (colors, logo) via CSS variables or context.
- Render club-scoped navigation (`<AppNav />`).
- 404 if slug not found; redirect to `/unauthorized` if not a member.

```typescript
// src/app/(app)/[club]/layout.tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ club: string }>;
}) {
  const { club: slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: membership } = await supabase
    .from("club_members")
    .select("role, clubs!inner(id, name, slug, logo_url, primary_color, secondary_color)")
    .eq("clubs.slug", slug)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) notFound();

  const clubData = membership.clubs;
  return (
    // Apply club brand tokens via CSS variables
    <div style={{
      "--color-club-primary": clubData.primary_color,
      "--color-club-secondary": clubData.secondary_color,
    } as React.CSSProperties}>
      <AppNav club={clubData} role={membership.role} userId={user.id} />
      <main>{children}</main>
    </div>
  );
}
```

### `admin` layout — `src/app/(app)/[club]/admin/layout.tsx`

Reads the role injected by the parent layout (or re-queries). Redirects PLAYER role to `/[club]`.

---

## Navigation Components

### `<AppNav>` — `src/components/layout/AppNav.tsx`

Renders different nav items based on role. Mobile-first (hamburger on mobile, sidebar on desktop).

Nav items are built incrementally per sprint. Phase 2 items (Torneos, Rankings, Clínicas) are only added after the Validation Gate passes.

**Owner nav (Phase 1 — after Sprint 3):**
```
[Club Logo + Name]
─────────────────
Dashboard         ← owner only
Reservaciones
─────────────────
Admin Panel       ← link to /admin
─────────────────
Mi Perfil
Salir
```

**Owner nav (Phase 2 — after Sprint 7):**
```
[Club Logo + Name]
─────────────────
Dashboard         ← owner only
Reservaciones
Rankings
Torneos
Clínicas
─────────────────
Admin Panel       ← link to /admin
─────────────────
Mi Perfil
Salir
```

**Admin nav (Phase 1 — after Sprint 3):**
```
[Club Logo + Name]
─────────────────
Panel Admin
  └─ Canchas
  └─ Reservaciones
  └─ Jugadores
  └─ Configuración
─────────────────
Mi Perfil
Salir
```

**Admin nav (Phase 2 — after Sprint 7):**
```
[Club Logo + Name]
─────────────────
Panel Admin
  └─ Canchas
  └─ Reservaciones
  └─ Jugadores
  └─ Torneos
  └─ Rankings
  └─ Clínicas
  └─ Configuración
─────────────────
Mi Perfil
Salir
```

**Player nav (Phase 1 — after Sprint 3):**
```
[Club Logo + Name]
─────────────────
Inicio
Reservaciones
─────────────────
Mi Perfil
Salir
```

**Player nav (Phase 2 — after Sprint 7):**
```
[Club Logo + Name]
─────────────────
Inicio
Reservaciones
Rankings
Torneos
Clínicas
─────────────────
Mi Perfil
Salir
```

---

## Authentication Flow

```
1. User visits /platino-padel/dashboard
2. Middleware checks session cookie
3. No session → redirect /auth/login?next=/platino-padel/dashboard
4. User logs in → Supabase sets session cookie
5. /auth/callback/route.ts exchanges code → session stored
6. Redirect to next param → /platino-padel/dashboard
7. (app)/layout.tsx re-validates session ✓
8. [club]/layout.tsx queries club_members ✓
9. admin/layout.tsx validates role ✓
10. Dashboard page renders
```

---

## Middleware Configuration

```typescript
// src/proxy.ts  ← Next.js 16 uses "proxy" file convention instead of "middleware"
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  // Only refresh session cookies — no club validation here.
  // Club validation happens in [club]/layout.tsx (Server Component).
  // This keeps the proxy lightweight (no DB queries per request).

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Must use getUser() — not getSession() — per @supabase/ssr requirements.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|branding|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

---

## Page Responsibilities by Role

### Owner Dashboard — `/[club]/dashboard`

Data to surface:
- Reservations this week / this month
- Court occupancy % (current week)
- Active players count
- New players this month
- Upcoming tournaments
- Active rankings summary
- Recent activity feed (last 10 actions)

### Admin Panel — `/[club]/admin/...`

Simple, task-oriented screens. Each page = one workflow.

**Phase 1 (Sprints 1–3):**

| Page | Primary task | Sprint |
|---|---|---|
| Settings | Club name, logo, colors, social links | 1 |
| Courts | Create / deactivate courts | 2 |
| Players | List members, invite via link, deactivate | 2 |
| Reservations | Calendar view, create/cancel reservations | 3 |

**Phase 2 (Sprints 4–7 — post-validation):**

| Page | Primary task | Sprint |
|---|---|---|
| Tournaments | Create → set participants → generate bracket → register results | 4 |
| Rankings | View, set active ranking | 5 |
| Clinics | Create, manage registrations | 6 |

> Note: Players displayed in the admin panel are queried from `club_members JOIN profiles WHERE role = 'PLAYER'`. There is no separate `players` table.

### Player Portal — `/[club]`

Mobile-first. Players should be able to:
- See upcoming reservations
- Check their ranking position
- View active/upcoming tournaments
- Register for clinics
- View their match history
