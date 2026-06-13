# PadelClub

## Estado General

- Estado: Validation Gate 1.0
- Última actualización: Junio 2026

## Visión

PadelClub es una plataforma SaaS multi-tenant para clubes de pádel.

El cliente principal es el OWNER del club.

El foco actual del MVP es:

1. Gestión de reservas
2. Gestión de jugadores
3. Gestión de canchas
4. Administración operativa
5. Analítica básica

## Arquitectura

### Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- Vercel

### Roles

#### OWNER

Acceso a:

- Dashboard
- Canchas
- Jugadores
- Administradores
- Reservaciones
- Configuración
- Multi-club

#### ADMIN

Acceso a:

- Canchas
- Jugadores
- Reservaciones

Restricciones:

- No Dashboard OWNER
- No Configuración

#### PLAYER

Acceso a:

- Reservaciones

Pendiente:

- Rediseño de experiencia basada en disponibilidad

## Sprint 0 — Fundación

### Estado

✅ Completo

### Incluye

- Landing
- Registro
- Login
- Recuperación de contraseña
- Base multi-tenant

## Sprint 1 — Onboarding y Multi-Club

### Estado

✅ Completo

### Incluye

- Crear club
- Slug
- Selector de clubes
- Cambio de club
- Múltiples clubes por OWNER

...