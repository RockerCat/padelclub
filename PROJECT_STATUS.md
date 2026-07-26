# PadelClub

## Estado General

* Estado: Validation Gate 1.0
* Última actualización: 26 de julio de 2026 (modelo global de cuentas y endurecimiento de seguridad, retiro de invitaciones para PLAYER, navegación inteligente multi-club, cancelación de reservas con ventana de 2 horas, salida voluntaria de un club, desactivación de jugadores que limpia compromisos futuros en vez de bloquear, edición de reservas con protección real de concurrencia compartida entre creación/edición/aprobación)

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
* Header global para usuarios autenticados (branding MiPadelClub + nombre + campana de notificaciones + logout), reemplazando la navegación "Explorar clubes"
* Visitantes sin sesión ven un header público mínimo (solo branding + "Iniciar sesión")
* Un PLAYER que ya es miembro del club ya no es redirigido automáticamente al entrar a `/[slug]`: ve la página pública con su propio CTA ("Entrar al club →"); solo OWNER/ADMIN se redirigen a su área operativa
* Si su solicitud de ingreso es aprobada/rechazada mientras está en la página, el estado se actualiza en vivo vía Realtime (sin recargar ni redirigir)

Pendiente:

* Fotos reales
* Ubicación avanzada
* Ranking público
* Torneos
* Actividad reciente

---

## Home del Jugador

Estado: ✅ MVP funcional

Ruta:

```text
/[club]/home
```

Es ahora el punto de entrada del PLAYER al club (`getClubEntryPath`), en reemplazo de `/[club]/reservations`.

Incluye:

* Layout member-first: reservas/solicitudes propias primero, información del club después
* Reutiliza `getClubPublicPageData` (misma fuente que la página pública) y `getPlayerReservations` (`src/lib/playerReservations.ts`, fuente compartida con la vista de Reservaciones del jugador) — nunca una segunda versión de esas queries
* Nunca redirige ni es el componente público (`ClubPublicView`): es una superficie exclusiva para miembros dentro del layout `(app)`, con sidebar, campana de notificaciones e identidad ya provistos ahí
* El nav lateral del PLAYER ahora muestra dos accesos: "Página del club" (Home) y "Reservaciones"

---

## Identidad en el Sidebar

Estado: ✅ Completo

Bloque de identidad del usuario autenticado (nombre, email si aporta información nueva, avatar/iniciales, rol) al final del sidebar, junto a "Mi Perfil"/"Salir".

* Un solo resolutor (`getSidebarIdentity`, `src/lib/userIdentity.ts`) y un solo componente (`SidebarIdentity`), reutilizados tanto por el sidebar del club (`AppNav`, OWNER/ADMIN/PLAYER) como por el del área de plataforma (`PlatformNav`, SUPERADMIN) — nunca dos implementaciones de resolución de nombre
* Etiquetas de rol centralizadas (`src/lib/roleLabels.ts`: Propietario/Administrador/Jugador, y "Superadministrador" para `is_platform_admin`), reemplazando la copia local que antes vivía solo en `ClubHeader`
* Reutiliza `PlayerAvatar` para la foto/iniciales — no se creó un sistema de avatar nuevo

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
* Rechazo de reservas (con motivo obligatorio, ver más abajo)
* Disponibilidad por cancha
* Horarios configurables
* Duraciones configurables
* Disponibilidad de PLAYER rediseñada (`/[club]/reservations`): tarjetas de día con indicador visual de disponibilidad, selector de duración compacto, tarjetas de cancha (con la ilustración real reutilizada de gestión de canchas) y timeline segmentado en dos franjas (Mañana / Tarde y noche) con hora explícita por bloque
* Grid de dos columnas para las tarjetas de cancha en desktop, una columna en mobile
* Revisión de solicitud de reserva desde notificación: pantalla dedicada `/{club}/admin/reservations/{id}` que reutiliza el mismo timeline de disponibilidad del jugador (extraído a `CourtAvailabilityTimeline`, componente compartido) con un 4º estado visual para "la solicitud actual", y las mismas acciones de aprobar/rechazar (revalidan disponibilidad contra Supabase antes de confirmar, nunca confían en el estado ya renderizado)
* El precio congelado de la reserva (`price_amount`/`price_currency`) es visible en esa pantalla tanto para OWNER como para ADMIN
* El RPC `notify_reservation_request_created` (SECURITY DEFINER) notifica en tiempo real a todos los OWNER/ADMIN del club al crearse una solicitud, con destino directo a esa pantalla de revisión; el banner de solicitudes pendientes enlaza ahí también
* Corregido: un bug de mezcla UTC/local (`toISOString()` vs `getHours()/getMinutes()`) rechazaba incorrectamente reservas futuras con "El horario seleccionado ya pasó" cerca de la medianoche en horario local
* Corregido: en el formulario de duraciones permitidas del club, un checkbox marcado pero deshabilitado (para "no dejar la lista vacía") impedía guardar exactamente una duración habilitada — HTML excluye los campos `disabled` del `FormData` aunque se rendericen marcados. Ahora cualquier subconjunto no vacío de {60, 90, 120} se guarda correctamente

Duraciones soportadas:

* 60 min
* 90 min
* 120 min

Configurables por club (subconjunto no vacío de las anteriores; un club puede operar, por ejemplo, con una única duración habilitada).

**Vista Agenda (nueva vista principal OWNER/ADMIN):**

* `/{club}/admin/reservations` ahora abre por defecto en **Agenda**, una vista diaria orientada a operación (todas las canchas del día, todos los slots de 30 min siempre visibles), reemplazando el concepto de "Disponibilidad" como pantalla principal
* **Semana** (la grilla semanal original) se conserva como vista secundaria; ambas vistas permanecen montadas simultáneamente y se alternan por CSS (`ReservationsViewSwitcher`), nunca por desmontaje — así el estado local de cada vista (filtros, selección) sobrevive al cambio de vista y a la navegación entre semanas/días
* Panel lateral de detalle estilo ticket (`ReservationTicketPanel`, slide-over en desktop / hoja casi pantalla completa en mobile) reemplaza el modal centrado para crear/ver/aprobar-rechazar reservas desde Agenda; reutiliza las mismas server actions existentes (nunca una segunda implementación de crear/editar/aprobar/rechazar/cancelar)
* Slots ocupados muestran el nombre real del jugador (no iniciales ni títulos truncados), con truncado por CSS y tooltip al pasar el mouse/foco (solo dispositivos con puntero fino, con retardo de apertura/cierre) mostrando el detalle completo
* Participantes resueltos de forma consistente aunque la reserva venga de una solicitud aprobada (que nunca puebla `reservation_players`): se usa como participante efectivo al jugador que creó la solicitud, resuelto contra la lista de miembros ya cargada — nunca una query nueva, y nunca se muestra a un OWNER/ADMIN creador como si fuera jugador
* Navegación de fechas (`DayRangeNav`, componente compartido con la vista del PLAYER) aprovecha el ancho disponible en desktop mostrando más días sin detección de ancho por JS (variantes de 7/10/14 días conmutadas por breakpoint CSS)
* Cada tipo de reserva tiene su propio color en los bloques de Agenda (Partido: verde, Clase: azul celeste, Bloqueo: lila), reutilizando el mismo tooltip existente para los tres tipos; el color de "Confirmada"/"Aprobada" (verde) y de "Clase"/"Bloqueo" ahora es un valor fijo en toda la plataforma, ya no depende del color de marca configurado por cada club (antes tomaba el `--color-brand-primary` del club, lo que hacía que "confirmada" se viera de un color distinto según el club)
* "Reservas rechazadas" se movió de la parte superior de la pantalla (antes visible en ambas vistas) a debajo del grid de canchas, únicamente dentro de Agenda — Semana ya no la muestra, sin duplicarla al alternar entre vistas (se mantiene montada una sola vez, oculta por CSS junto con el resto de Agenda)

**Filtro por cancha en Semana:**

* Selector compacto "Filtrar por cancha" (junto a la leyenda, antes de la grilla) con "Todas las canchas" + una opción por cada cancha activa del club
* Filtrado 100% local sobre las reservas ya cargadas de la semana (sin queries nuevas); mantiene las 7 columnas de día siempre visibles, incluso vacías
* Estado del filtro persiste mientras el usuario permanece en la página (cambios de semana, alternar Agenda↔Semana), sin depender de Supabase ni de un query param nuevo
* Semana vacía para una cancha filtrada muestra un mensaje discreto distinto del genérico ("No hay reservas para esta cancha durante esta semana.")

**Rechazo de solicitudes con motivo:**

* Nuevo estado `rejected`, distinto de `cancelled` (que sigue siendo exclusivo de una reserva confirmada que se cancela después)
* Motivo obligatorio elegido de un catálogo fijo compartido (`REJECTION_REASONS` en `src/lib/reservationRejection.ts`), validado server-side (`validateRejectionInput`); "Otro motivo" requiere comentario libre
* Un solo modal de rechazo (`RejectReservationModal`) reutilizado tanto desde la tarjeta compacta de solicitudes pendientes como desde la pantalla completa de revisión
* El RPC `notify_reservation_rejected` (SECURITY DEFINER) notifica al jugador solicitante con el motivo, y resuelve en conjunto la notificación `reservation_request_created` de todos los OWNER/ADMIN (mismo mecanismo de estado compartido que la aprobación)
* Nueva sección **Rechazadas** en el panel de administración (`RejectedReservationsSection`) con historial filtrable por período (30/90 días/todo)
* El jugador ve el motivo y la fecha de rechazo de sus propias solicitudes rechazadas (`playerReservations.ts`, fuente compartida con la página de Home)

**Cobertura de tiempo real ampliada:**

* Las tablas `reservations` y `reservation_players` se agregaron a la publicación `supabase_realtime` (antes ausentes, por lo que ningún cambio llegaba en vivo aunque el cliente estuviera suscrito) — RLS sigue siendo el único límite de seguridad real, esto solo habilita que una lectura ya autorizada llegue en vivo
* Nuevo RPC `notify_reservation_created_for_players` notifica a cada jugador vinculado cuando un OWNER/ADMIN crea una reserva directamente a su nombre (antes no generaba ninguna notificación)

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

# Tarifas y Franjas Horarias

Estado:

✅ Funcional (precio fijo por duración)

Ruta:

```text
/[club]/admin/settings → Tarifas
```

Modelo:

* Cada club define reglas ("franjas tarifarias"): nombre, días de la semana, hora inicio/fin, alcance (general o cancha específica — la específica siempre gana sobre la general), orden y estado activo/inactivo
* Una regla activa nunca se solapa con otra del mismo alcance/día/horario (validado en base de datos, no en el cliente)
* Cada franja tiene un **precio fijo por cada duración habilitada del club** (tabla `club_pricing_rule_prices`) — ya no se calcula proporcionalmente desde un precio por hora (`club_pricing_rules.price_per_hour` queda como columna legada, sin usarse; se elimina en una fase posterior)
* El horario de inicio de la reserva determina exclusivamente qué franja aplica; una reserva nunca se divide entre dos franjas aunque su horario de término caiga en la siguiente
* `resolveReservationPrice` (motor único de precio, `src/lib/reservationPricing.ts`) resuelve club → cancha → día → franja → precio de esa duración, siempre server-side; el precio nunca se calcula ni se confía desde el cliente. Devuelve un tipo discriminado: `matched:true` con el precio, o `matched:false` con motivo (`missing_pricing_rule` sin franja aplicable, `missing_duration_price` franja encontrada pero sin precio para esa duración exacta) — ambos casos bloquean la solicitud de reserva, nunca hay fallback silencioso
* Guardado de una franja (crear/editar) es atómico vía RPC (`upsert_pricing_rule_with_prices`): la regla y todos sus precios por duración se guardan o fallan juntos
* Configuración → Tarifas muestra una tarjeta por franja con una línea de precio por cada duración configurada (nunca "$/hora"); el formulario solo pide precio para las duraciones que el club tiene habilitadas actualmente
* El modal de solicitud del PLAYER muestra "Duración" y "Valor de la reserva" (nunca "Precio por hora")
* Migración de datos: los clubes existentes conservan sus precios derivados proporcionalmente de su antiguo precio por hora hasta que su OWNER los edite explícitamente
* Platino Pádel (`alex-club-padel`), único con una sola duración habilitada (90 min), tiene precios reales configurados: Horario diurno $70.000, Horario nocturno $120.000, Fin de semana $100.000
* Validado extremo a extremo con datos reales de Platino Pádel (22 escenarios: resolución por franja, cruce de franja sin partir la reserva, duración no habilitada rechazada, franja sin precio configurado bloqueando la solicitud, otros clubes sin alteración)

Pendiente:

* Festivos/días especiales (fuera de alcance por ahora — no hay fecha objetivo)
* Eliminar físicamente la columna legada `club_pricing_rules.price_per_hour`
* Promociones, descuentos, tarifas por tipo de jugador o membresía

---

# Gestión de Jugadores

Estado:

✅ Funcional

Incluye:

* Invitaciones (solo ADMIN — ver "Modelo Global de Cuentas y Seguridad" más abajo)
* Membresías
* Roles
* Multi-club
* **Desactivar jugador** (`deactivate_player`, RPC `SECURITY DEFINER`): OWNER/ADMIN puede desactivar a un PLAYER activo de su propio club desde `MemberModal`. Ya no bloquea la acción cuando el jugador tiene reservas activas — en su lugar, la propia operación las limpia de forma atómica: cancela toda reserva futura `pending`/`confirmed` creada por el jugador (mismo modelo de cancelación que cualquier otra — `status`/`cancelled_at`/`cancelled_by`, con `cancelled_by` = el OWNER/ADMIN ejecutor, sin la ventana de 2 horas por ser una cancelación operativa del club) y retira únicamente su participación futura en reservas creadas por otros (sin tocar esa reserva, su creador ni sus demás participantes). `club_members` queda con `is_active = false`; `account_type`, el perfil y el historial nunca se tocan. El jugador recibe una notificación `player_deactivated` ("Tu acceso a [club] fue desactivado por el club"); los afectados por las reservas canceladas/retiradas reciben las notificaciones normales de cancelación/participación
* "Partidos jugados" en el detalle del miembro muestra el número real (o `0`), calculado en el momento desde `reservations`/`reservation_players` (partido, confirmado, ya finalizado, sin duplicar cuando el jugador es creador y participante a la vez)

Pendiente:

* Reactivación de un jugador desactivado
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
* Acciones "Aprobar"/"Rechazar" directamente desde la notificación de solicitud de ingreso (campana y `/notifications`), reutilizando las mismas server actions de Jugadores — sin lógica de aprobación duplicada; estado final ("Aprobada"/"Rechazada") visible in-place sin navegar
* La notificación de aprobación navega al club real (`/{clubSlug}`) en vez del listado genérico `/clubs`; el destino se guarda en la metadata desde el momento de la aprobación
* Corregido: aprobar una solicitud ya no redirige automáticamente al jugador a Reservaciones — permanece en la ruta donde estaba
* Corregido: el estado "resuelta" (aprobada/rechazada) de una solicitud de ingreso o de reserva ahora es compartido entre **todos** los OWNER/ADMIN notificados — antes cada quien veía su propio estado local en cuanto la abría, sin reflejar que otro administrador ya la había resuelto. Se agregaron columnas `resolved_status`/`resolved_at` a `notifications` (actualizadas atómicamente dentro de las mismas RPCs que resuelven la solicitud); `read_at` sigue siendo estrictamente por-usuario y nunca se usa para inferir si la solicitud fue resuelta
* Corregido: un club configurado como público seguía enviando al jugador por el flujo de solicitud+aprobación de un club privado. El botón "Unirme al club" y su server action (`createJoinRequest`) ahora releen `clubs.visibility` en el servidor (nunca confían en el dato ya cargado en el cliente) y, si es público, invocan el RPC `join_public_club` (ya existía pero no estaba conectado a ninguna vista real) — crea la membresía PLAYER activa de inmediato, sin fila en `club_join_requests`, y redirige al jugador a su dashboard real (`getClubEntryPath`, con el rol tomado de la membresía recién confirmada, nunca hardcodeado). El flujo de clubes privados no cambió. También se corrigió una causa de "Ya eres miembro de este club" apareciendo por error: el CTA de unión se montaba tres veces a la vez (hero + 2 bloques inferiores) y las tres disparaban el auto-envío al volver de signup/login; ahora solo una lo dispara
* Nuevo: cuando un jugador se une directo a un club público, OWNER y cada ADMIN activo reciben una notificación informativa ("Nuevo jugador en el club") que enlaza a Jugadores — sin solicitud de ingreso, sin acciones de aprobar/rechazar, sin notificar al jugador. Se genera atómicamente dentro del mismo RPC `join_public_club`, solo cuando la membresía se crea de verdad (nunca en el camino idempotente de "ya era miembro"), reutilizando la tabla/Realtime/lectura individual de notificaciones ya existentes

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
