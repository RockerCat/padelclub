# PadelClub

## Estado General

* Estado: Validation Gate 1.0
* Última actualización: Julio 2026

## Visión

PadelClub es una plataforma SaaS multi-tenant para clubes de pádel.

El cliente principal es el OWNER del club.

El objetivo del MVP es ayudar a los clubes a:

* Gestionar reservas
* Gestionar canchas
* Gestionar jugadores
* Reducir trabajo administrativo
* Incrementar ocupación de canchas
* Mejorar visibilidad operativa para los dueños

PadelClub no busca convertirse en un ERP complejo.

PadelClub busca convertirse en el hogar digital del club.

---

# Arquitectura

## Stack

* Next.js 16
* React 19
* TypeScript
* Tailwind CSS 4
* Supabase
* Vercel

## Modelo Multi-Tenant

Cada club opera como un tenant independiente.

Características:

* Aislamiento por club
* Usuarios pueden pertenecer a múltiples clubes
* Usuarios pueden tener distintos roles en distintos clubes
* Branding independiente por club
* Configuración independiente por club

---

# Roles

## OWNER

Cliente principal del producto.

Acceso a:

* Dashboard del club
* Página pública del club
* Configuración
* Canchas
* Jugadores
* Administradores
* Reservaciones
* Branding
* Multi-club

Responsabilidades:

* Configuración del club
* Visibilidad del negocio
* Crecimiento del club
* Administración general

---

## ADMIN

Operador del club.

Acceso a:

* Reservaciones
* Canchas
* Jugadores
* Solicitudes de reserva

Sin acceso a:

* Dashboard OWNER
* Branding
* Configuración general

---

## PLAYER

Usuario final.

Acceso a:

* Reservaciones
* Disponibilidad de canchas
* Solicitud de reservas
* Clubes a los que pertenece

Pendiente:

* Rediseño completo de experiencia basada en disponibilidad

---

# Estado Actual del Producto

## Landing Pública

Estado: ✅ Completo

Incluye:

* Home pública
* Login
* Registro
* Crear club
* Explorar clubes
* Navegación pública

---

## Directorio de Clubes

Estado: ✅ Completo

Ruta:

```text
/clubs
```

Incluye:

* Mis clubes
* Exploración de clubes
* Búsqueda de clubes
* Clubes públicos
* Clubes privados
* Detección de membresía
* CTA para solicitar acceso
* CTA para unirse

---

## Página Pública del Club

Estado: ✅ MVP funcional

Ruta:

```text
/[slug]
```

Incluye:

* Hero visual
* Logo del club
* Portada del club
* Estado público/privado
* Información básica
* Galería placeholder
* CTA de acceso ("Unirme al club", con seguimiento de estado de la solicitud)
* CTA de administración para owners

Pendiente:

* Fotos reales
* Ubicación avanzada
* Ranking público
* Torneos
* Actividad reciente

---

## Dashboard OWNER

Estado: ✅ MVP funcional

Ruta:

```text
/[club]/dashboard
```

Incluye:

* Hero visual del club
* Logo
* Portada
* Estado del club
* Acceso a página pública
* Acceso a edición del club
* Checklist de onboarding
* Empty states inteligentes
* Accesos rápidos

Objetivo:

El dashboard representa el club y no solamente herramientas administrativas.

---

## Branding del Club

Estado: ✅ MVP funcional

Incluye:

* Logo
* Portada
* Descripción
* Colores
* Visibilidad pública/privada

Actualmente:

* cover_image_url
* logo_url

Pendiente:

* Upload directo desde dashboard
* Gestión completa de assets mediante Storage

---

# Sprint 0 — Fundación

Estado:

✅ Completo

Incluye:

* Landing
* Registro
* Login
* Recuperación de contraseña
* Multi-tenant base
* Roles

---

# Sprint 1 — Onboarding y Multi-Club

Estado:

✅ Completo

Incluye:

* Crear club
* Slug
* Multi-club
* Selector de clubes
* Navegación multi-club
* Invitaciones

---

# Sprint 2 — Reservaciones

Estado:

🚧 En progreso

Incluye:

* Gestión de reservaciones
* Solicitudes de reserva
* Aprobación de reservas
* Rechazo de reservas
* Disponibilidad por cancha
* Horarios configurables
* Duraciones configurables

Duraciones soportadas:

* 60 min
* 90 min
* 120 min
* 150 min
* 180 min

Configurables por club.

---

# Sprint 3 — Experiencia Owner

Estado:

🚧 En progreso

Incluye:

* Dashboard visual
* Página pública
* Branding del club
* Hero compartido
* Onboarding guiado

Checklist actual:

1. Personalizar página pública
2. Agregar primera cancha
3. Configurar horarios
4. Invitar jugadores
5. Crear primera reserva

---

# Gestión de Canchas

Estado:

✅ Funcional

Incluye:

* Crear cancha
* Editar cancha
* Activar/desactivar cancha
* Horarios por club

Pendiente:

* Fotos de canchas
* Tipos de cancha
* Servicios asociados

---

# Gestión de Jugadores

Estado:

✅ Funcional

Incluye:

* Invitaciones
* Membresías
* Roles
* Multi-club

Pendiente:

* Perfil ampliado
* Historial de actividad

---

# Solicitudes de Ingreso y Notificaciones

Estado:

✅ Completo (extremo a extremo)

Incluye:

* Solicitud de ingreso a un club desde la página pública (`/[slug]`), con auto-envío al llegar con `?intent=join-club` tras signup/login
* Aprobación/rechazo de solicitudes por OWNER/ADMIN desde Jugadores (`/[club]/admin/players`)
* Estado de la solicitud visible para el solicitante (pendiente/aprobada/rechazada)
* Tabla `notifications` + Realtime (Postgres Changes) para actualización en vivo sin recargar
* Campana de notificaciones (header): contador de no leídas, dropdown con las 5 más recientes, "Ver todas las notificaciones"
* Animación de recordatorio en la campana mientras existan notificaciones sin leer (respeta `prefers-reduced-motion`)
* Página `/notifications`: historial completo, paginado ("Cargar más", 20 por página), "Marcar todas como leídas", disponible para cualquier usuario autenticado sin depender de un club activo

Pendiente:

* Notificaciones push (fuera del navegador)
* Preferencias de notificación por tipo

---

# Funcionalidades Pendientes de Alta Prioridad

## Owner Experience

* Upload directo de logo
* Upload directo de portada
* KPIs operativos
* Ocupación de canchas
* Actividad reciente

## Reservaciones

* Flujo final de aprobación
* Mejoras de disponibilidad
* Experiencia móvil

## Club Profile

* Ubicación avanzada
* Galería real
* Información comercial ampliada

---

# Funcionalidades Futuras

No prioritarias para el MVP:

* Rankings
* Torneos
* Clínicas
* Ladder
* Comunidad
* Aplicaciones móviles
* Pagos

Estas funcionalidades no deben desplazar la validación de los flujos operativos principales.

---

# Prioridad Actual

Validar completamente:

1. Onboarding Owner
2. Gestión de canchas
3. Gestión de reservaciones
4. Gestión de jugadores
5. Experiencia multi-club
6. Página pública del club

Antes de expandir el producto hacia rankings, torneos o funcionalidades sociales.
