# PadelClub

## Estado General

* Estado: Validation Gate 1.0
* Última actualización: 29 de julio de 2026 (Módulo de Torneos llevado de punta a punta: programación de partidos/canchas, registro y corrección de resultados con cierre automático del torneo, premiación deportiva con resumen de puntos, y noticia asistida tras finalizar. Ranking llevado a Fase 2: UI administrativa completa (ajuste de puntos/cambio de categoría desde el propio Ranking), Ranking público según visibilidad del club, medallas/badges deportivos unificados en toda superficie relevante, y exportación visual (PNG) de Top 10/podio/resultados. Incluye tres correcciones reales encontradas y aplicadas: categoría congelada mostrada incorrectamente en torneos combinados, columna `id` ambigua en `generate_tournament_bracket` (migración escrita, pendiente de aplicar), y bloqueo indefinido de la generación de imágenes por el incrustado automático de fuentes de `html-to-image` — ver Módulo de Torneos y Módulo Deportivo — Ranking (Fase 2))
* Actualización anterior: 29 de julio de 2026 (Módulo de Torneos completo de punta a punta: modelo estructural — torneos simples y combinados, inscripción de parejas OWNER/ADMIN/PLAYER con validación deportiva de composición, generación y visualización del cuadro eliminatorio — administración, RLS, RPCs y UI para OWNER, ADMIN y PLAYER; incluye una regresión real de esquema encontrada y corregida en las RPCs de ciclo de vida del torneo — ver Módulo de Torneos)

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
* **Avatar deportivo unificado**: nuevos componentes reutilizables `PlayerSportAvatar`/`RankMedalCrown` (`src/components/players/`) reemplazan toda representación de avatar de jugador — tarjeta de Jugadores, modal de miembro y tabla de Ranking comparten exactamente el mismo componente (foto + esquina de categoría + corona si está en el Top 3), sin lógica duplicada por pantalla. No aplica a avatares de club/OWNER/ADMIN
* Tarjeta de Jugadores simplificada: se retiró el badge duplicado de categoría legacy ("Principiante") y se redujo ~25-30% la altura vertical de cada tarjeta
* Categoría legacy `club_members.category` retirada de toda la UI (ver CLAUDE.md → Sport / Ranking Module Principles) — la única categoría que se muestra ahora es la del ciclo de ranking Fase 1
* **Modal "Miembro del club" ampliado**: sección "Información deportiva" ahora incluye posición de ranking y usa skeleton de carga real (nunca muestra "—" mientras carga, solo cuando la carga termina y no hay dato); nueva sección "Contacto" (una sola fila: email en texto plano no clicable + botón "Contactar por WhatsApp" vía `wa.me`, mostrado solo si el miembro tiene teléfono) — el email se resuelve mediante un nuevo RPC `get_club_member_email` (`SECURITY DEFINER`, OWNER/ADMIN del mismo club únicamente)

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
* **WhatsApp obligatorio para nuevas cuentas PLAYER** (ver CLAUDE.md → Player Contact Principles): utilidad compartida `src/lib/utils/phone.ts` (`normalizePhone`/`isValidPhone`/`toWhatsAppLink`) reutilizada por el signup, la edición en Mi Perfil y todas las validaciones server-side. Se cerraron los cuatro puntos de entrada por los que una cuenta podía volverse PLAYER activo sin teléfono válido: `SignupForm` exige el campo cuando el flujo viene de un `?intent=join-club`, y `join_public_club`/`create_join_request`+`approve_join_request`/la reactivación de membresía rechazan la operación (`P0006`) si el perfil no tiene un teléfono válido en ese momento. Cuentas anteriores a esta regla quedan sin forzar (sin migración masiva); el hueco se cierra al tocar de nuevo un flujo protegido o al editar el teléfono desde Mi Perfil. Existe además `scripts/backfillLocalPlayerPhones.ts` (dry-run por defecto, `--apply` para escribir) para un backfill puntual local de un número de prueba — nunca se ejecuta automáticamente ni desde una migración

Pendiente:

* Notificaciones push (fuera del navegador)
* Preferencias de notificación por tipo

---

# Archivado de Clubes

Estado:

✅ MVP funcional — migración `supabase/migrations/20260815000001_archive_club.sql` **pendiente de aplicación manual** en la base de datos al momento de este registro.

Modelo:

* `clubs.archived_at timestamptz NULL`. Archivado ⇔ `archived_at IS NOT NULL`. No reutiliza `clubs.is_active` (columna ya existente pero nunca usada por ningún flujo hasta ahora — se deja reservada para un futuro toggle de suspensión a nivel de plataforma por SUPERADMIN, `/platform/clubs/[clubId]`, aún no implementado)
* Único trigger: RPC `archive_club(p_club_id)` (`SECURITY DEFINER`), invocable solo por el OWNER activo del club — valida auth, membresía, rol y estado "no archivado ya" enteramente en servidor; nunca confía en nada enviado por el cliente
* Atómico: bloquea la fila (`FOR UPDATE`) antes de escribir, así dos clics/llamadas concurrentes solo permiten que uno archive — el otro recibe "El club ya fue archivado"
* Efecto exclusivo: `archived_at = now()`. Nada más se modifica — miembros, reservas (pasadas y futuras), tarifas, branding e historial permanecen intactos; ninguna reserva se cancela automáticamente

Operaciones bloqueadas (validadas en servidor/SQL, nunca solo ocultando botones):

* Reservas: crear (PLAYER vía `create_reservation_player`, OWNER/ADMIN vía `create_reservation_admin`), editar (`update_reservation`), aprobar solicitud pendiente (`approve_pending_reservation`) — las cuatro RPCs comparten el guard `public._require_club_not_archived(p_club_id)`
* Ingreso: `create_join_request` y `approve_join_request` (nuevo código de error `P0005`); `join_public_club` (reutiliza el mismo resultado que un club inactivo, `P0002`)
* Invitaciones ADMIN: `createAdminInvite` (chequeo a nivel de server action) y `claim_invitation` (nuevas membresías; un miembro que re-hace clic en su propio link ya aceptado sigue funcionando sin problema); `get_invitation_preview` marca el link como inválido con el motivo "Este club se encuentra archivado."

Explícitamente sin cambios (resolver algo existente nunca crea compromiso nuevo, así que nunca se bloquea):

* `cancel_reservation`, `rejectPendingReservation` (admin), `reject_join_request`

Visibilidad y navegación:

* Discover Clubes (`/clubs`) y el perfil público (`/[club]`, incluyendo `generateMetadata`) dejan de mostrar el club archivado (404, mismo patrón que un club con `is_active = false`)
* `resolveClubEntryPath` ignora cualquier membresía en un club archivado al decidir a dónde entra el usuario tras iniciar sesión — nunca lo enruta automáticamente ahí, aunque sea su única membresía o su `last_club_id`
* Un club archivado sigue siendo accesible en modo lectura para sus propios miembros — el layout `(app)/[club]` no bloquea la entrada; historial, reservas pasadas, jugadores y noticias siguen disponibles sin restricción

UI:

* Banner informativo visible solo para el OWNER en el layout del club ("Este club está archivado...")
* Tarjeta "Archivar club" (danger zone) en Configuración, solo OWNER, oculta una vez archivado, con `ConfirmDialog` existente (variant destructiva)
* Botón "Nueva reserva" (Semana), clic en slot disponible (Agenda, vista del jugador) y la página standalone `/admin/reservations/new` quedan deshabilitados/redirigidos cuando el club está archivado — la protección real sigue siendo el servidor, esto es solo la afordancia visual

Notificaciones:

* Nuevo tipo `club_archived`, generado una sola vez dentro del propio RPC `archive_club`, a todos los `club_members` activos del club (cualquier rol) — reutiliza la tabla/Realtime/lectura de notificaciones ya existentes, sin sistema nuevo

Pendiente:

* Reactivación de un club archivado (fuera de alcance del MVP)
* Estadísticas o reportes sobre clubes archivados
* Exportación/backup previos al archivado

---

# Estadísticas Operativas del Club

Estado:

✅ MVP funcional — migración `supabase/migrations/20260816000001_club_statistics.sql` **pendiente de aplicación manual** en la base de datos al momento de este registro.

Ruta:

```text
/[club]/admin/statistics
```

Modelo:

* RPC única `get_club_statistics(p_club_id, p_start_date, p_end_date)` (`SECURITY DEFINER`) — toda la agregación ocurre en PostgreSQL, nunca se descargan reservas crudas al navegador
* 5 periodos fijos (Últimos 7/30/90 días, Este mes, Mes anterior), calculados en `America/Bogota` vía `Intl.DateTimeFormat` (`src/lib/clubStatisticsRange.ts`) — módulo independiente de `src/lib/dashboardRange.ts` (presets distintos, ese módulo no se tocó)
* `reservations.type = 'block'` excluido de toda métrica; `reservations.date`/`start_time` (nunca `created_at`) determinan periodo y franjas horarias
* KPIs: Reservas del periodo (todos los estados, aclarado explícitamente en el copy), Confirmadas, Pendientes, Canceladas o rechazadas, Horas reservadas, Tasa de confirmación — con comparación vs. periodo anterior de igual longitud
* Gráficas reutilizando el patrón CSS/SVG puro ya usado en Dashboard (sin librería de gráficos nueva): evolución de reservas (diaria o semanal según el rango), distribución por estado, uso por cancha, actividad por día de la semana, actividad por franja horaria
* Sin índices nuevos agregados — sin evidencia `EXPLAIN` con volumen real que los justifique; `reservations.created_by` sigue sin índice, documentado para revisión futura

Navegación:

* "Estadísticas" agregada al sidebar de OWNER y ADMIN (`AppNav`), no visible para PLAYER; no forma parte del tab bar móvil fijo de 5 ítems (vive en el menú secundario móvil junto a Dashboard/Equipo/Configuración)

Pendiente:

* Validación SQL manual contra datos reales (consultas de verificación entregadas, ejecución pendiente)

---

# Perfil Personal del Usuario

Estado:

✅ MVP funcional — migración `supabase/migrations/20260817000001_profile_activity.sql` **aplicada en desarrollo**, validada con datos reales. Ampliado con carga de foto de perfil y edición de WhatsApp (migración `20260827000001_profile_avatars_storage.sql`, aplicada).

Ruta:

```text
/profile
```

Global, a nivel de cuenta — no vive bajo `/[club]`, no depende de un club activo, agrega actividad de todos los clubes donde el usuario haya participado alguna vez (incluyendo clubes abandonados, membresías desactivadas y clubes archivados).

Modelo:

* RPC única `get_my_profile_activity()` (`SECURITY DEFINER`), **sin parámetros** — identidad derivada exclusivamente de `auth.uid()`, nunca acepta un `profile_id`/`user_id` de terceros
* Regla de participación personal (ver CLAUDE.md → Player Statistics Principles): una reserva cuenta como actividad propia solo si el usuario aparece en `reservation_players`, o si es `created_by` **y** su propio `profiles.account_type` es exactamente `'PLAYER'` — nunca `created_by` por sí solo, para no confundir autoría administrativa (reservas de un OWNER/ADMIN para terceros o para el club) con participación deportiva real
* Como el modelo actual no permite que un OWNER/ADMIN se agregue a sí mismo como jugador en ninguna reserva, es esperado y correcto que su resumen personal quede en cero — nunca se aproxima ni se inventa participación; la UI lo comunica con un estado vacío neutral, no como error
* Métricas: reservas totales/confirmadas/pendientes/canceladas/rechazadas, partidos, clases, horas confirmadas (nunca "horas jugadas" — no se verifica asistencia real); evolución mensual (últimos 12 meses fijos, con ceros donde no hay actividad); distribución por tipo (partidos/clases); actividad reciente (15 más recientes, `date`/`start_time` descendente, nunca `created_at`); membresías activas (`is_active = true`, con indicador visual de club archivado)
* Sin ingresos, ranking, ELO, victorias/derrotas ni comparación entre usuarios
* **Foto de perfil**: nuevo bucket de Storage `profile-avatars`, con carpeta por usuario (`auth.uid()`) y políticas RLS que solo permiten a cada usuario escribir dentro de su propia carpeta; subir/reemplazar/eliminar desde `ProfileAvatarUpload`, propagado de inmediato a todo componente que ya usaba `profiles.avatar_url`
* **Edición de WhatsApp**: `PhoneEditField` + server action `updateOwnPhone`, reutiliza la misma validación/normalización de `src/lib/utils/phone.ts` que el resto de la plataforma (ver CLAUDE.md → Player Contact Principles)

Navegación:

* "Mi Perfil" (antes un placeholder bloqueado "Próx." en `AppNav`) ahora es un enlace real, con estado activo cuando `pathname === "/profile"`
* `/profile` vive dentro del route group `(app)` (URL pública sin cambios) específicamente para reutilizar el mismo `AppNav` que usan las páginas de club — nuevo `src/app/(app)/profile/layout.tsx` resuelve un club de contexto solo para pintar el sidebar (vía nueva `resolveActiveMembership` en `src/lib/utils/navigation.ts`, que nunca escribe `last_club_id` ni filtra los datos del perfil), con fallback a un header mínimo si el usuario no tiene ninguna membresía activa

Pendiente:

* Verificación visual real en dispositivo/navegador (el ajuste responsive y de jerarquía visual se validó por análisis estático de clases, no por renderizado observado)

---

# Módulo Deportivo (Fase 1)

Estado:

✅ MVP funcional — migraciones aplicadas manualmente en producción, validadas con datos reales de `alex-club-padel`.

```text
supabase/migrations/20260818000001_sport_categories.sql
supabase/migrations/20260819000001_club_default_player_category.sql
supabase/migrations/20260820000001_sport_schema_base.sql
supabase/migrations/20260821000001_sport_provisioning.sql
supabase/migrations/20260822000001_sport_points_and_category_operations.sql
supabase/migrations/20260823000001_fix_ambiguous_club_member_id_references.sql
supabase/migrations/20260824000001_ranking_view_authorization.sql
supabase/migrations/20260825000001_fix_sport_state_authorization_bypass.sql
```

Ruta pública de la vista de ranking:

```text
/[club]/ranking
```

Ver CLAUDE.md → Sport / Ranking Module Principles para las reglas de arquitectura permanentes. Este apartado documenta el detalle de lo construido y su historial.

**Modelo de datos:**

* `sport_categories`: catálogo global (7a a 1a, `sort_order` ascendente de más débil a más fuerte), lectura pública
* `clubs.default_player_category`: categoría por defecto configurable por el OWNER (`DefaultPlayerCategoryModal`, Configuración)
* `club_ranking_cycles`: un ciclo activo por club+categoría (`ended_at IS NULL`); la categoría de un jugador nunca se guarda directamente, siempre se deriva por join contra su ciclo activo
* `club_member_sport_state`: extensión 1:1 de `club_members` (PK = `club_member_id`, nunca `profiles.id`) — `current_points`, `cycle_id`, `points_reached_at`
* `club_player_point_movements`: ledger inmutable/append-only de todo movimiento de puntos (manual u originado por un cambio de categoría)
* `club_player_category_changes`: historial inmutable de cada cambio de categoría (promoción/descenso/corrección)
* Aprovisionamiento automático vía trigger (`club_members_provision_sport_state`) cuando un miembro pasa a ser PLAYER activo — nunca un paso manual

**RPCs (todas `SECURITY DEFINER`, `authenticated` únicamente, nunca `anon`):**

* `get_or_create_active_ranking_cycle`, `provision_club_member_sport_state`, `provision_club_sport_members` (internas, sin GRANT directo a cliente)
* `configure_club_default_player_category(p_club_id, p_category)` — OWNER/ADMIN, configura la categoría por defecto del club y aprovisiona a los miembros faltantes
* `adjust_club_player_points(p_club_id, p_club_member_id, p_delta_points, p_reason_code, p_note)` — OWNER/ADMIN, ajuste manual con catálogo fijo de motivos (`internal_league`, `coach_clinic`, `no_show_penalty`, `club_representation_bonus`, `special_event`, `other`); los puntos nunca bajan de cero y un ajuste cuyo efecto neto sería cero se rechaza explícitamente
* `change_club_player_category(p_club_id, p_club_member_id, p_target_category, p_change_type, p_note)` — OWNER/ADMIN, promoción/descenso/corrección validada contra `sort_order`; siempre escribe un movimiento técnico adicional que cierra el ciclo anterior en su saldo real y reinicia el jugador en 0 puntos dentro del nuevo ciclo
* `get_club_category_ranking(p_club_id, p_category)` / `get_club_category_ranking_view(...)` (con `avatar_url`, usada por la UI) — cualquier miembro activo del club, cualquier rol
* `get_club_member_sport_state(p_club_id, p_club_member_id)` — OWNER/ADMIN leen cualquier estado del club; un PLAYER activo únicamente el propio

**UI:**

* Jugadores (`/[club]/admin/players`): `AdjustPlayerPointsModal`, `ChangePlayerCategoryModal` (OWNER/ADMIN)
* Configuración (`/[club]/admin/settings`): `DefaultPlayerCategoryModal` (OWNER/ADMIN)
* Ranking (`/[club]/ranking`, nuevo ítem "Ranking" en `AppNav` para OWNER/ADMIN/PLAYER, fuera del tab bar móvil fijo de 5 ítems): selector de categoría sobre el catálogo real, posición/avatar/nombre/puntos respetando el `ranking_position` calculado en servidor (incluye empates), etiqueta "Tú" para la fila propia, estados de carga/vacío/error

**Incidente de seguridad (encontrado y corregido dentro de esta misma fase, antes de cualquier uso real por clubes):**

* Validación empírica con sesiones reales (OWNER, PLAYER y un usuario autenticado sin ninguna membresía en el club) confirmó que `get_club_member_sport_state` permitía a cualquier usuario autenticado sin membresía en el club leer el estado deportivo real de cualquier jugador — causa raíz: `v_role := public.club_role(p_club_id)` puede devolver `NULL`, y `IF v_role NOT IN ('OWNER','ADMIN')` evalúa `NULL NOT IN (...)` como `NULL`, que en `plpgsql` se trata como falso, saltando el bloque de autorización completo
* Auditoría posterior encontró el mismo patrón, con capacidad de **escritura**, en `adjust_club_player_points`, `change_club_player_category` y `configure_club_default_player_category` — nunca llegó a explotarse con datos reales (no se probó a propósito, para no escribir datos), pero el código lo permitía
* Corregido en `20260825000001`: autorización explícita y positiva en las cuatro funciones — cada una consulta directamente `club_members` por una membresía ACTIVA real del caller (nunca depende solo de `club_role()`), compara el rol con `IN (...)` (nunca `NOT IN`), y rechaza con `42501` en cualquier rama no contemplada, sin caminos implícitos. `change_club_player_category` recibió además una guarda explícita de `NULL` en `p_change_type`
* Revalidado íntegramente con datos reales tras aplicar el hotfix: los mismos intentos de bypass (usuario sin membresía, PLAYER contra otro PLAYER, PLAYER desactivado, `anon`) ahora reciben `42501` sin excepción, sin ninguna escritura parcial; el comportamiento legítimo (OWNER ajustando puntos, autolectura de un PLAYER) se confirmó intacto

**Intento de resultados de partido, implementado y luego revertido (mismo periodo, antes de cualquier uso real por clubes):**

* Se implementó un primer bloque de "resultados de partido" (equipos, marcador, ganador y estadísticas derivadas de victorias/derrotas/win%) acoplado directamente a `reservations` — migraciones `20260831000001_match_results_schema.sql` y `20260831000002_record_match_result_rpc.sql`, ambas aplicadas manualmente en producción
* Se confirmó una regla de negocio definitiva que cambia por completo el alcance: una reserva ordinaria (`type='match'`) nunca puede tener un resultado oficial — eso queda reservado exclusivamente a un futuro módulo de torneos, todavía sin diseñar (ver CLAUDE.md → Sport / Ranking Module Principles)
* Se revirtió por completo: migración compensatoria `20260901000001_remove_reservation_match_results.sql` (aplicada, sin `CASCADE`, elimina limpiamente lo introducido) y reversión de toda la UI/TS asociada (`MatchResultForm` eliminado, `ReservationTicketPanel` restaurado, "Partidos jugados" restaurado a su definición basada en reservas confirmadas y finalizadas, sin resultado)
* Las dos migraciones originales **se conservan intactas** como registro histórico (nunca se editan/renombran/eliminan) — la compensación siempre se hace con una migración nueva, nunca modificando una ya aplicada

Pendiente:

* Ranking global/cross-club
* Ladder (medallas de posición 1-3 ya implementadas desde este mismo bloque — ver Ranking Fase 2 más abajo para su extensión y corrección)
* Registro de resultados y asignación automática de puntos para una `reservation` ordinaria — sigue exclusivamente fuera de alcance, permanente; ver el intento-y-reversión arriba y la regla en CLAUDE.md. Esto ya **no** aplica a torneos: el módulo de Torneos (ver más abajo) sí registra resultados oficiales y otorga puntos, pero únicamente sobre `tournament_matches`, nunca sobre `reservations`
* Victorias/Derrotas/Win % de una reserva ordinaria (sin tracking de resultados en ese esquema)
* Reactivación de un jugador desactivado y su efecto (si alguno) sobre su estado deportivo

---

# Módulo Deportivo — Ranking (Fase 2)

Estado:

✅ MVP funcional — UI administrativa completa del Ranking, Ranking público según visibilidad del club, medallas/badges deportivos unificados en toda superficie relevante, y exportación visual (PNG) de Ranking/Torneos. Una migración de esta fase (`20260920000001`) está **pendiente de aplicación manual**.

## Ranking administrativo (Bloque 3.1)

* `/[club]/ranking` (antes exclusivamente de lectura) ahora también permite, para OWNER/ADMIN, ajustar puntos y cambiar de categoría directamente desde la fila del jugador — reutiliza sin cambios `AdjustPlayerPointsModal`/`ChangePlayerCategoryModal` y sus Server Actions ya existentes en Jugadores (nunca una segunda implementación); opera siempre sobre la categoría ya seleccionada (nunca pide elegirla de nuevo) y refresca tras cada mutación volviendo a consultar la misma RPC (nunca cálculo local del nuevo total/posición)
* PLAYER conserva la misma vista, en modo exclusivamente lectura — gate por rol nunca implementado solo ocultando botones, ya que las Server Actions re-derivan el rol server-side de forma independiente

## Ranking público (Bloque 3.2)

* Nueva ruta `/clubs/[slug]/ranking` (fuera del layout autenticado, alcanzable sin sesión para un club público): reutiliza `RankingView` con un nuevo prop `readOnly` que fuerza modo lectura sin importar el rol real del visitante — nunca una segunda implementación de la vista
* **Gap real encontrado y corregido**: `get_club_category_ranking`/`get_club_category_ranking_view` exigían membresía activa incondicionalmente, bloqueando incluso a un visitante anónimo de un club público. Corregido en `supabase/migrations/20260920000001_public_club_ranking_read.sql` (**pendiente de aplicación manual**): permite lectura anónima/no-miembro únicamente cuando el club es `visibility='public'` y no está archivado; un miembro activo conserva acceso sin importar visibilidad o archivado, exactamente igual que antes de este cambio
* Enlace "Ver clasificación por categoría" agregado a la página pública del club (`ClubPublicView`), en reemplazo del placeholder "Ranking: En construcción"

## Medallas y badges deportivos globales (Bloque 3.3)

* `PlayerSportAvatar`/`RankMedalCrown` extendidos, nunca reemplazados: la esquina de categoría ahora funciona en todos los tamaños de avatar (antes solo `lg`+, invisible en `sm`/`md` — usado por Ranking, listas de Jugadores y Torneos), y la corona de posición 1-3 ahora incluye `aria-label` real (nunca depende solo del color)
* **Bug real corregido**: en un torneo combinado, `PairMemberSlot` mostraba la categoría congelada del torneo (la superior) para AMBOS integrantes de la pareja, en vez de la categoría real de cada jugador. Corregido resolviendo la categoría real por `club_member_id` en lote (máximo 2 llamadas a `get_club_category_ranking_view` por carga de página, nunca por jugador/pareja) dentro de `getTournamentEntriesWithMembers`/`getTournamentBracketView` — se propaga automáticamente a `EntryCard`, `MatchCard`, `ScheduleMatchModal` y `RecordTournamentMatchResultModal` sin tocar sus call sites
* El podio del Ranking (`RankingView`) ahora también muestra el badge de categoría (antes solo la lista lo mostraba); `PlayerCombobox`/`RegisterEntryModal` migrados de `PlayerAvatar` a `PlayerSportAvatar`
* Documentado como backlog, no implementado por falta de datos en lote sin ampliar contratos existentes: badges de categoría en Reservas/solicitudes/calendario, y en `TournamentAwardPairCard`

## Exportaciones deportivas (Bloque 3.4)

* Nueva capacidad, OWNER/ADMIN únicamente: generar imágenes PNG (1080×1350) para compartir — Top 10 del Ranking de la categoría seleccionada, podio del torneo (solo campeón/subcampeón — un cuadro de eliminación directa nunca produce un tercer lugar real, siempre deja dos semifinalistas empatados, ver CLAUDE.md), y resultados finales del torneo (siempre las últimas 2 rondas del bracket — semifinales + final — sin importar el tamaño del cuadro)
* Componentes nuevos: `ShareCardShell` (marco visual compartido), `RankingShareCard`, `TournamentPodiumShareCard`, `TournamentResultsShareCard`, `ShareCardModal` (previsualización + compartir/descargar, reutilizado por las 3 tarjetas), `RankingExportButton`/`TournamentExportSection` (wiring de datos, sin consultas nuevas — reutilizan exactamente lo ya cargado por la página)
* `src/lib/sportsShareExport.ts`: única utilidad de exportación del proyecto; resuelve avatares/logo a data URL con timeout de 6s por imagen (nunca bloquea por una imagen lenta o caída, cae a iniciales), captura con `html-to-image` (única dependencia nueva agregada, `html-to-image@1.11.13`), Web Share API con archivo (nunca solo URL) con fallback a descarga directa
* Ninguna publicación automática en redes; ninguna subida a Storage; sin service role en ningún punto

## Corrección: bloqueo indefinido de la generación de imágenes (Bloque 3.5)

* "Compartir podio" (y, por infraestructura compartida, cualquier exportación) podía quedar cargando indefinidamente, sin error, con el botón "Descargar" siempre deshabilitado — confirmado leyendo el código fuente instalado de `html-to-image`: incrusta automáticamente las fuentes web escaneando TODAS las hojas de estilo del documento (nunca solo el nodo capturado) mediante `fetch()` sin ningún timeout propio; si una hoja no podía leerse de forma síncrona, la generación quedaba colgada para siempre
* Corregido con `skipFonts: true` en la llamada a `toBlob()` (elimina la causa raíz por completo) más un timeout global de generación (15s) con un token de intento vigente en `ShareCardModal` — un resultado tardío de un intento ya abandonado (tras timeout o tras un reintento) nunca sobrescribe el estado de uno más nuevo
* Se agregó además timeout de 6s por imagen en `resolveImageDataUrl` (vía `AbortController`) como defensa adicional, sin cambio de comportamiento visible cuando la imagen carga con normalidad

Pendiente:

* Aplicar `20260920000001_public_club_ranking_read.sql` en producción (escrita y auditada, no aplicada)
* Badges de categoría en Reservas y en `TournamentAwardPairCard` (evaluados, no implementados — ver arriba)
* Verificación visual real de las 3 tarjetas exportables en dispositivo/navegador (validado por código y build, no por captura observada)

---

# Módulo de Torneos

Estado:

✅ Completo de punta a punta (Bloques 1.1–1.11 backend + 2.1–2.7 UI): administración, inscripciones, bracket, programación de partidos/canchas, resultados con cierre automático, premiación deportiva y noticia asistida tras finalizar. Ver CLAUDE.md → Tournament Module Principles para las reglas de arquitectura permanentes. Este apartado documenta el detalle de lo construido.

Pendiente: notificaciones de eventos de Torneos (partido programado, resultado registrado, torneo finalizado) — sin backend ni UI todavía.

## Migraciones

```text
supabase/migrations/20260902000001_courts_id_club_id_unique.sql
supabase/migrations/20260903000001_tournaments_table.sql
supabase/migrations/20260904000001_tournament_court_allocations_table.sql
supabase/migrations/20260905000001_tournament_entries_table.sql
supabase/migrations/20260906000001_tournament_entry_members_table.sql
supabase/migrations/20260907000001_tournament_matches_table.sql
supabase/migrations/20260908000001_club_player_point_movements_tournament_support.sql
supabase/migrations/20260909000001_tournament_admin_functions.sql
supabase/migrations/20260910000001_tournament_entry_registration_functions.sql
supabase/migrations/20260911000001_generate_tournament_bracket_function.sql
supabase/migrations/20260912000001_tournament_scheduling_functions.sql
supabase/migrations/20260913000001_tournament_match_lifecycle_functions.sql
supabase/migrations/20260914000001_award_tournament_points_function.sql
supabase/migrations/20260915000001_tournament_rpc_grants_and_rls.sql
supabase/migrations/20260916000001_tournament_combined_category_model.sql
supabase/migrations/20260917000001_tournament_entry_category_composition.sql
supabase/migrations/20260918000001_fix_tournament_lifecycle_returns_regression.sql
```

## Modelo de datos

* `tournaments`: `name`, `description`, `category` (superior o única), `secondary_category` (inferior, `NULL` = categoría única), `bracket_size` (4/8/16), `status` (`draft` → `registration_open` → `registration_closed` → `bracket_generated` → `in_progress` → `completed`, o `cancelled` desde cualquiera de los tres primeros), `visibility` (`public`/`private`), ventana de inscripción y fechas del evento
* `tournament_entries`: una pareja inscrita; `status` `pending`/`confirmed`/`withdrawn`; `category`/`secondary_category` congelan la modalidad del torneo al momento de crear la inscripción, nunca recalculadas después
* `tournament_entry_members`: exactamente dos filas por entry, sin estado propio (la única fuente de verdad es `tournament_entries.status`)
* `tournament_matches`: partidos del cuadro; `round_number`/`match_number` identifican la posición (sin tabla `tournament_rounds`); `source_match_one_id`/`source_match_two_id` autorreferenciados (nunca `next_match_id`) para las rondas posteriores; `entry_one_id`/`entry_two_id` materializados solo en primera ronda hasta que un futuro flujo de resultados propague ganadores; marcador embebido en columnas fijas (`set_one_entry_one`... `set_three_entry_two`, sin JSON); `winner_entry_id`; campos de programación (`tournament_court_allocation_id`, `court_id`, `scheduled_*`) ya existentes en el esquema pero sin UI todavía
* `tournament_court_allocations`: franjas de cancha reservadas para el torneo — tabla y RPCs ya existen, sin UI
* `club_player_point_movements.tournament_id` — columna añadida para que la liquidación de puntos de torneo comparta el mismo ledger inmutable que los ajustes manuales

## RPCs (todas `SECURITY DEFINER`, `authenticated` únicamente, nunca `anon`)

**Administración del torneo:**

* `create_tournament(p_club_id, p_name, p_category, p_bracket_size, p_description, p_visibility, p_registration_opens_at, p_registration_closes_at, p_starts_at, p_ends_at, p_secondary_category)` — OWNER/ADMIN
* `update_tournament(..., p_secondary_category)` — mismos campos editables que antes; `draft`: todo editable; `registration_open`: `category`/`secondary_category`/`bracket_size`/`registration_opens_at` congelados
* `open_tournament_registration`, `close_tournament_registration`, `cancel_tournament` — transiciones de estado, sin bypass de rol

**Inscripción de parejas:**

* `register_tournament_entry(p_tournament_id, p_club_member_one_id, p_club_member_two_id)` — PLAYER: debe incluirse, crea `pending`; OWNER/ADMIN: cualquier pareja válida, crea `confirmed`. Valida individualmente el `club_member_sport_state` de cada jugador (nunca un `COUNT` global) y la composición de categorías: torneo simple exige que ambos coincidan exactamente con `category`; torneo combinado exige que ambos pertenezcan a `{category, secondary_category}` con a lo sumo un jugador en la categoría superior. Locks por advisory lock (`tournament_entry:<torneo>:<jugador>`, orden determinístico por UUID), protección de duplicados y de capacidad preservadas en cada iteración
* `confirm_tournament_entry`, `withdraw_tournament_entry` — OWNER/ADMIN confirman cualquier `pending`; PLAYER retira su propia entry; retiro permitido en `registration_open` y `registration_closed`

**Bracket:**

* `generate_tournament_bracket(p_tournament_id)` — OWNER/ADMIN, exige `registration_closed` y exactamente `bracket_size` entries `confirmed`, sorteo aleatorio (`array_agg ... ORDER BY random()`, sin política de seeding), genera todas las rondas en una transacción, transiciona a `bracket_generated`; nunca regenerable

**Ya implementadas en backend, sin UI todavía:** asignación/edición/desactivación de franjas de cancha (`create_tournament_court_allocation`, `update_tournament_court_allocation`, `deactivate_tournament_court_allocation`), programación de partido (`schedule_tournament_match`), ciclo de vida del partido (`start_tournament_match`, `record_tournament_match_result`, `correct_tournament_match_result` — con propagación de ganador y cierre automático del torneo al resolverse la final), liquidación de puntos (`award_tournament_points`, valores: participación 5, campeón +30, subcampeón +15, semifinalista +5).

## RLS y privilegios

RLS habilitada en las 5 tablas núcleo (`tournaments`, `tournament_court_allocations`, `tournament_entries`, `tournament_entry_members`, `tournament_matches`). Lectura: OWNER/ADMIN ven todo de su club; cualquier miembro activo ve `tournaments`/`tournament_matches` no-`draft` y entries `confirmed` (más las propias `pending`/`withdrawn` vía `created_by`); visitantes externos/`anon` pueden leer `tournaments`/`tournament_matches` solo cuando el torneo es público, no-`draft`, y el club es público/activo/no archivado (doble verificación, ya que no existe cascada automática `clubs.visibility` → `tournaments.visibility`). Limitación documentada y aceptada: el compañero de una entry `pending` autocreada por un jugador no es legible por RLS hasta confirmarse — la UI muestra "Por confirmar", nunca un error ni un UUID. `GRANT EXECUTE` explícito por firma exacta en las 17 RPCs a `authenticated`, nunca `anon`, nunca wildcard.

## Incidente: regresión de esquema en 4 RPCs (encontrado y corregido antes de cualquier uso real)

* Al agregar `tournaments.secondary_category` (Bloque 2.2.1A) se actualizó el `RETURNS TABLE` de `create_tournament`/`update_tournament`/`register_tournament_entry` (únicas tres en el alcance de ese bloque), pero no el de `open_tournament_registration`, `close_tournament_registration`, `cancel_tournament` ni `generate_tournament_bracket`
* Las 4 funciones restantes hacían `RETURN QUERY SELECT (v_tournament).*` contra una fila que pasó de 20 a 21 columnas reales — una discordancia de aridad que Postgres solo detecta en tiempo de ejecución, nunca estáticamente
* Detectado en la auditoría obligatoria del Bloque 2.3 (antes de implementar el botón "Generar cuadro", que depende exactamente de una de las 4 funciones rotas), confirmado con evidencia concreta, y corregido con aprobación explícita del usuario antes de tocar SQL
* Corrección puramente mecánica en `20260918000001`: se agregó `secondary_category text` al final de cada `RETURNS TABLE` y se reemplazó `(v_tournament).*` por una lista explícita de columnas — cero cambio de autorización, validaciones, locks o transiciones de estado; verificado con `diff` línea por línea contra cada versión anterior
* Lección permanente capturada en CLAUDE.md → Tournament Module Principles: cualquier función que use `RETURN QUERY SELECT (row).*` debe mantenerse en sincronía manual con el esquema real cada vez que se agregue una columna a la tabla que expone

## Incidente: columna `id` ambigua en `generate_tournament_bracket` (encontrado en uso real; corrección escrita, pendiente de aplicar)

* Ejecutar `generate_tournament_bracket` como OWNER fallaba con `ERROR 42702: column reference "id" is ambiguous` — su `RETURNS TABLE` declara una columna de salida `id`, y las dos sentencias `INSERT INTO tournament_matches (...) RETURNING id INTO v_match_id` (ronda 1 y rondas posteriores) quedaban ambiguas entre esa salida y `tournament_matches.id`. Auditado el resto del cuerpo completo: todas las demás consultas ya calificaban cada columna correctamente; estos eran los únicos dos puntos sin alias
* Corregido en `supabase/migrations/20260921000001_fix_generate_tournament_bracket_ambiguous_id.sql` (**pendiente de aplicación manual**): alias explícito (`INSERT INTO public.tournament_matches AS tm`) + `RETURNING tm.id` en ambas sentencias, vía `CREATE OR REPLACE FUNCTION` (misma firma, mismo `RETURNS TABLE`, sin `DROP`) — mismas validaciones/permisos/grants, verificado línea por línea contra la versión vigente
* Lección permanente capturada en CLAUDE.md → Tournament Module Principles, junto a la regla de `RETURN QUERY SELECT (row).*`: un `RETURNING` sin calificar dentro de una función cuyo `RETURNS TABLE` comparte nombre de columna con la tabla escrita es ambiguo y Postgres solo lo detecta en tiempo de ejecución

## UI — Administración (Bloque 2.1)

* Navegación: ítem "Torneos" (ícono `Swords`) para OWNER/ADMIN en sidebar/tab-bar-secundario, y para PLAYER en su propia navegación
* Rutas: `/[club]/admin/tournaments` (listado, orden determinístico: operativos/próximos primero por `starts_at` asc, históricos después por `starts_at` desc), `/[club]/admin/tournaments/[tournamentId]` (detalle)
* Creación/edición: `TournamentForm` compartido, categoría principal + secundaria opcional (filtrada por `sort_order` real, nunca hardcodeada), campos de fecha `datetime-local` convertidos a UTC vía `src/lib/utils/bogotaDatetime.ts` (offset real de America/Bogota resuelto con `Intl`, nunca hardcodeado)
* Transiciones: abrir/cerrar inscripciones y cancelar, cada una con `ConfirmDialog` y gateada por el estado real, nunca adivinado

## UI — Inscripciones y parejas (Bloque 2.2, 2.2.1A, 2.2.1B)

* `EntriesSection` (compartida entre detalle OWNER/ADMIN y detalle PLAYER): capacidad (`pending + confirmed` contra `bracket_size`, barra de progreso), grupos Pendientes/Confirmadas/Retiradas para OWNER/ADMIN, sección "Tu inscripción" + lista de confirmadas para PLAYER
* `RegisterEntryModal` + `PlayerCombobox`: candidatos resueltos vía `get_club_category_ranking_view` (una llamada por categoría del torneo, hasta 2, nunca por jugador); en torneo combinado el segundo selector se recalcula dinámicamente según la categoría elegida en el primero (si es la superior, el segundo solo ofrece la inferior), limpiando automáticamente una selección que deje de ser válida
* Ruta PLAYER mínima nueva: `/[club]/tournaments` (listado) y `/[club]/tournaments/[tournamentId]` (detalle + inscripción) — PLAYER fijo como "Jugador 1", solo elige compañero, nunca puede quitarse
* `tournamentEntryActions.ts` (compartida): `registerTournamentEntryAction`, `confirmTournamentEntryAction`, `withdrawTournamentEntryAction`

## UI — Bracket (Bloque 2.3)

* `BracketSection`/`BracketView`/`MatchCard` (compartidos entre detalle OWNER/ADMIN y PLAYER): resumen de preparación ("X de Y parejas confirmadas"), botón "Generar cuadro" (solo OWNER/ADMIN, solo `registration_closed` con conteo exacto), columnas por ronda con scroll horizontal contenido (`overflow-x-auto`, mismo patrón que `WeekCalendar`)
* Nombres de ronda derivados matemáticamente de `bracket_size`+`round_number` (`getTournamentRoundLabel`, `src/lib/tournamentBracket.ts`) — Semifinales/Final (4), Cuartos/Semis/Final (8), Octavos/Cuartos/Semis/Final (16), sin tabla `tournament_rounds`
* Partidos de ronda 1 muestran las parejas reales; rondas posteriores muestran "Ganador del partido N" (número real del partido fuente) hasta que un futuro flujo de resultados propague al ganador
* `getTournamentBracketView` (`src/lib/tournamentBracket.ts`): 1 consulta a `tournament_matches` + reutilización de `getTournamentEntriesWithMembers` (ya existente de Bloque 2.2) para resolver entries/miembros — 4 consultas fijas en total, nunca una por partido/entry/jugador
* `PairMemberSlot` extraído como componente compartido entre `EntryCard` (Bloque 2.2) y `MatchCard` (Bloque 2.3) — una pareja siempre se muestra igual en todo el módulo

## UI — Programación de Partidos y Canchas (Bloque 2.4)

* `CourtAllocationsSection`/`CourtAllocationModal` (OWNER/ADMIN únicamente — la RLS de `tournament_court_allocations` no tiene rama PLAYER): crear/editar/desactivar franjas de cancha reservadas para el torneo, reutilizando `create_tournament_court_allocation`/`update_tournament_court_allocation`/`deactivate_tournament_court_allocation` ya existentes en backend desde el Bloque 1
* `ScheduleMatchModal`: programa un partido de primera ronda (única ronda programable hasta que exista propagación de ganador) contra una franja de cancha activa, vía `schedule_tournament_match`; `isMatchSchedulable` (`tournamentBracket.ts`) solo decide si mostrar la acción — la RPC sigue siendo la autoridad real, nunca un estado imposible alcanzable desde la UI
* `getTournamentCourtAllocations` (`tournamentBracket.ts`): 2 consultas (allocations + canchas por los `court_id` distintos), nunca una por franja

## UI — Resultados y Cierre de Torneo (Bloque 2.5)

* `RecordTournamentMatchResultModal`: registra el marcador (sets 1–3) de un partido `in_progress`, o corrige un resultado ya registrado — reutiliza `validateTournamentMatchScore` (`tournamentBracket.ts`) solo para UX (mismo orden/mensajes que `record_tournament_match_result`/`correct_tournament_match_result`), nunca decide el ganador por sí mismo: el backend lo confirma, propaga el ganador a la ronda siguiente y cierra el torneo automáticamente (`status = 'completed'`) al resolverse la final
* `tournamentLifecycleActions.ts`: `startTournamentMatchAction`, `recordTournamentMatchResultAction`, `correctTournamentMatchResultAction` — sin lógica de negocio propia, solo autorización + traducción de errores

## UI — Premiación Deportiva (Bloque 2.6)

* Nueva RPC de solo lectura `get_tournament_points_summary(p_club_id, p_tournament_id)` (`supabase/migrations/20260919000001_get_tournament_points_summary_function.sql`, **pendiente de aplicación manual**) — única vía autorizada para leer el resultado real de `award_tournament_points()`; el ledger (`club_player_point_movements`/`club_member_sport_state`) sigue sin RLS pública. Clasifica `award_state` (`pending`/`ready`/`awarded`/`partial`) comparando el conteo real de movimientos contra el esperado (`bracket_size*2 + 8`), nunca recalculando puntos; cualquier membresía activa del club (OWNER/ADMIN/PLAYER) puede leerlo
* `TournamentAwardsSection`/`TournamentAwardPairCard`: botón "Otorgar puntos" (OWNER/ADMIN, solo cuando `status='completed'` y `award_state` no es `awarded`), tarjetas de campeón/subcampeón/semifinalistas con puntos reales por jugador
* `tournamentAwardActions.ts`/`tournamentAwards.ts`: `awardTournamentPointsAction` + el resolutor de vista que consume `get_tournament_points_summary`

## UI — Noticia Asistida del Torneo (Bloque 2.7)

* `TournamentNewsSection`, visible solo cuando el torneo está `completed` y `award_state = 'awarded'`: botón "Generar noticia" que abre el modal real de creación de Noticias (`CreateNewsModal`/`NewsForm`, nunca un segundo formulario) con título/contenido prellenados por `buildTournamentNewsDraft` (`tournamentNewsDraft.ts`) — derivado exclusivamente del torneo real y de `TournamentAwardSummary`, nunca inventa marcador/MVP/asistencia/estadísticas. El usuario puede editar todo el texto y debe publicar manualmente, exactamente como cualquier otra noticia
* `CreateNewsModal`/`NewsForm` ganaron dos props opcionales (`defaultTitle`/`defaultContent`), con efecto únicamente en creación — la edición de una noticia existente no cambió
* Limitación conocida, documentada y aceptada: no existe ningún mecanismo para evitar generar varias noticias para el mismo torneo (`club_news` no tiene columna de vínculo a `tournament_id`); no se creó uno nuevo para no ampliar el esquema fuera de alcance

---

# Funcionalidades Pendientes de Alta Prioridad

## Owner Experience

* Upload directo de logo
* Upload directo de portada
* Ocupación de canchas
* Actividad reciente del club en el dashboard

## Club Profile

* Ubicación avanzada
* Galería real
* Información comercial ampliada

---

# Funcionalidades Futuras

No prioritarias para el MVP:

* Ranking global/cross-club (el ranking por categoría dentro de un club, su UI administrativa/pública y sus exportaciones ya están implementados — ver Módulo Deportivo — Ranking (Fase 2))
* Torneos de eliminación directa por club ya están completos de punta a punta — inscripción de parejas, cuadro, programación, resultados, premiación y noticia asistida (ver Módulo de Torneos). Pendiente: notificaciones de eventos de Torneos
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

El módulo deportivo (ranking por categoría, con su UI administrativa/pública y exportaciones) y el módulo de Torneos (de punta a punta: inscripciones, cuadro, scheduling, resultados y premiación) ya están construidos y validados. Queda pendiente aplicar en producción las tres migraciones escritas y auditadas de esta fase (`20260919000001`, `20260920000001`, `20260921000001`) — la prioridad siguiente no es una nueva categoría de funcionalidad, sino aplicar esas migraciones y validar el flujo completo con datos reales.

Antes de expandir el producto hacia rankings, torneos o funcionalidades sociales.
