# PadelClub

## Estado General

* Estado: Validation Gate 1.0
* Última actualización: 2 de agosto de 2026 (Panel de Plataforma SUPERADMIN construido de punta a punta: Entrega de Club — creación de un club "en espera" desde `/platform`, el SUPERADMIN recibe una fila OWNER real y temporal, link de reclamo de un solo uso, `claim_club` como handoff atómico y permanente; Acceso elevado — `effective_club_role`/`is_superadmin_club_access` permiten operar cualquier club activo ya reclamado sin crear membresía, con banner persistente "Administrando como SUPERADMIN"; Desactivar/Reactivar club (`clubs.is_active`, distinto y ortogonal a `archived_at`). Además: tiempo extra sobre una reserva confirmada (`add_reservation_extra_time`), ADMIN gana acceso a Configuración operativa (ubicación, horarios, duraciones, tarifas — Equipo y archivado del club siguen siendo solo-OWNER), archivado de torneos (`archive_tournament`/`restore_tournament`, ortogonal al `status` deportivo), mapa interactivo en Directorio de Clubes, y una serie de correcciones reales de columna ambigua (`42702`) en once funciones del módulo de Torneos — ver Módulo de Torneos → Lecciones permanentes y CLAUDE.md → Tournament Module Principles)
* Actualización anterior: 1 de agosto de 2026 (Dashboard deportivo personal del PLAYER, nuevo punto de entrada al club en `/[club]/dashboard` — bifurca la misma ruta del Dashboard OWNER/ADMIN por rol, sin tocar ese dashboard. Encabezado deportivo con tendencia de ranking, próxima actividad, evolución de puntos/posición reconstruida desde el ledger real, resumen deportivo, mis torneos con clasificación oficial, logros calculados dinámicamente y actividad reciente unificada. Una sola RPC nueva, self-only: `get_my_club_sport_profile`. Ver Dashboard del PLAYER)
* Actualización anterior: 31 de julio de 2026 (Reconstrucción del núcleo de Torneos: se retiró por completo la arquitectura de cuadro eliminatorio — bracket, partidos, programación de canchas, premiación por posición de bracket — y se reemplazó por un modelo más simple, evento de club con inscripciones, clasificación por puntos editada directamente por OWNER/ADMIN y `finalize_tournament` como cierre idempotente que aplica esos puntos al ranking. Sobre ese nuevo modelo: clasificación en vivo rediseñada (medallas reales, fila uniforme, edición de puntos inline), vista de torneo finalizado con podio real en todo ancho de pantalla — incluido mobile — con soporte genuino de empates en cualquier posición, confetti de celebración repetido mientras la pestaña está visible, portada del torneo editable en cualquier estado, cierre editorial que genera una noticia trazada al torneo (`club_news.tournament_id`, máximo una por torneo garantizado por índice único), y URLs legibles por slug tanto para torneos como para noticias, con avatares reales de campeones en el detalle de una noticia de torneo. Ver Módulo de Torneos y CLAUDE.md → Tournament Module Principles)
* Actualización anterior: 29 de julio de 2026 (Módulo de Torneos llevado de punta a punta sobre la arquitectura de bracket ya retirada — ver entrada más reciente; en su momento incluyó programación de partidos/canchas, registro y corrección de resultados con cierre automático del torneo, premiación deportiva con resumen de puntos, y noticia asistida tras finalizar. Ranking llevado a Fase 2: UI administrativa completa, Ranking público según visibilidad del club, medallas/badges deportivos unificados, y exportación visual (PNG) de Ranking — ver Módulo Deportivo — Ranking (Fase 2))

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

* Reservaciones (incluye agregar tiempo extra a una reserva confirmada)
* Canchas
* Jugadores
* Solicitudes de reserva
* Configuración operativa (ubicación, horarios de operación, duraciones permitidas, tarifas) — ampliado en `20261010000001_admin_club_settings_access.sql`: el uso real del club mostró que ADMIN necesita estos ajustes en el día a día, no solo OWNER

Sin acceso a:

* Dashboard OWNER
* Branding
* Equipo (invitar/gestionar otros ADMIN) — sigue siendo solo-OWNER
* Archivar el club — sigue siendo solo-OWNER

---

## PLAYER

Usuario final.

Acceso a:

* Reservaciones
* Disponibilidad de canchas
* Solicitud de reservas
* Clubes a los que pertenece

---

## SUPERADMIN

Operador de la plataforma, nunca del club. Nunca es OWNER/ADMIN/PLAYER ni tiene una fila `club_members` histórica en ningún club, salvo la única excepción temporal descrita abajo. Opera exclusivamente desde `/platform`.

Acceso a:

* Listado y detalle de clubes y usuarios de la plataforma (`/platform/clubs`, `/platform/users`)
* Entrega de Club: crear un club "en espera" (`platform_create_pending_club`) y generar/revocar su link de reclamo de un solo uso
* Acceso elevado a cualquier club activo ya reclamado ("Entrar al club"), sin crear membresía
* Desactivar/reactivar cualquier club (`clubs.is_active`)

Ver Panel de Plataforma (SUPERADMIN) más abajo para el detalle completo, y CLAUDE.md → Role Philosophy → SUPERADMIN para las reglas permanentes.

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
* Mapa interactivo (`ClubsMap.tsx`, Leaflet) junto al listado — se centra en el primer club filtrado con coordenadas válidas (o vista de Colombia si no hay ninguna), selección sincronizada en ambos sentidos entre pin y tarjeta de lista

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

Ya no es el punto de entrada del PLAYER al club — desde el nuevo Dashboard deportivo (ver "Dashboard del PLAYER" más abajo), `getClubEntryPath` envía a PLAYER a `/[club]/dashboard`. `/[club]/home` sigue existiendo, accesible desde el nav como "Página del club".

Incluye:

* Layout member-first: reservas/solicitudes propias primero, información del club después
* Reutiliza `getClubPublicPageData` (misma fuente que la página pública) y `getPlayerReservations` (`src/lib/playerReservations.ts`, fuente compartida con la vista de Reservaciones del jugador y con el nuevo Dashboard) — nunca una segunda versión de esas queries
* Nunca redirige ni es el componente público (`ClubPublicView`): es una superficie exclusiva para miembros dentro del layout `(app)`, con sidebar, campana de notificaciones e identidad ya provistos ahí
* El nav lateral del PLAYER ahora muestra tres accesos: "Dashboard" (nuevo, primer ítem), "Página del club" (Home) y "Reservaciones"

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

* `clubs.archived_at timestamptz NULL`. Archivado ⇔ `archived_at IS NOT NULL`. No reutiliza `clubs.is_active` — esa columna es un control de plataforma independiente y ortogonal, exclusivo de SUPERADMIN, implementado después (`platform_deactivate_club`/`platform_reactivate_club`, ver Panel de Plataforma (SUPERADMIN)): `archived_at` es la decisión del propio OWNER y no tiene reactivación en el MVP; `is_active` es de la plataforma y sí es reversible
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

✅ MVP funcional — UI administrativa completa del Ranking, Ranking público según visibilidad del club, medallas/badges deportivos unificados en toda superficie relevante, y exportación visual (PNG) del Ranking. `20260920000001` se documentó en su momento como pendiente de aplicación manual; dado que decenas de migraciones posteriores (incluida toda la saga de Torneos y el Panel de Plataforma SUPERADMIN) ya están confirmadas corriendo en vivo, se asume aplicada — no queda ninguna evidencia de que siga pendiente, pero no se ha vuelto a verificar directamente contra la base de datos.

## Ranking administrativo (Bloque 3.1)

* `/[club]/ranking` (antes exclusivamente de lectura) ahora también permite, para OWNER/ADMIN, ajustar puntos y cambiar de categoría directamente desde la fila del jugador — reutiliza sin cambios `AdjustPlayerPointsModal`/`ChangePlayerCategoryModal` y sus Server Actions ya existentes en Jugadores (nunca una segunda implementación); opera siempre sobre la categoría ya seleccionada (nunca pide elegirla de nuevo) y refresca tras cada mutación volviendo a consultar la misma RPC (nunca cálculo local del nuevo total/posición)
* PLAYER conserva la misma vista, en modo exclusivamente lectura — gate por rol nunca implementado solo ocultando botones, ya que las Server Actions re-derivan el rol server-side de forma independiente

## Ranking público (Bloque 3.2)

* Nueva ruta `/clubs/[slug]/ranking` (fuera del layout autenticado, alcanzable sin sesión para un club público): reutiliza `RankingView` con un nuevo prop `readOnly` que fuerza modo lectura sin importar el rol real del visitante — nunca una segunda implementación de la vista
* **Gap real encontrado y corregido**: `get_club_category_ranking`/`get_club_category_ranking_view` exigían membresía activa incondicionalmente, bloqueando incluso a un visitante anónimo de un club público. Corregido en `supabase/migrations/20260920000001_public_club_ranking_read.sql` (estado de aplicación: ver nota arriba): permite lectura anónima/no-miembro únicamente cuando el club es `visibility='public'` y no está archivado; un miembro activo conserva acceso sin importar visibilidad o archivado, exactamente igual que antes de este cambio
* Enlace "Ver clasificación por categoría" agregado a la página pública del club (`ClubPublicView`), en reemplazo del placeholder "Ranking: En construcción"

## Medallas y badges deportivos globales (Bloque 3.3)

* `PlayerSportAvatar`/`RankMedalCrown` extendidos, nunca reemplazados: la esquina de categoría ahora funciona en todos los tamaños de avatar (antes solo `lg`+, invisible en `sm`/`md` — usado por Ranking, listas de Jugadores y Torneos), y la corona de posición 1-3 ahora incluye `aria-label` real (nunca depende solo del color)
* **Bug real corregido**: en un torneo combinado, `PairMemberSlot` mostraba la categoría congelada del torneo (la superior) para AMBOS integrantes de la pareja, en vez de la categoría real de cada jugador. Corregido resolviendo la categoría real por `club_member_id` en lote (máximo 2 llamadas a `get_club_category_ranking_view` por carga de página, nunca por jugador/pareja) dentro de `getTournamentEntriesWithMembers` — se propagaba automáticamente a `EntryCard` y al resto de superficies del bracket vigentes en ese momento (`MatchCard`, `ScheduleMatchModal`, `RecordTournamentMatchResultModal` — retirados junto con toda la arquitectura de bracket en la reconstrucción del núcleo de Torneos, ver Módulo de Torneos)
* El podio del Ranking (`RankingView`) ahora también muestra el badge de categoría (antes solo la lista lo mostraba); `PlayerCombobox`/`RegisterEntryModal` migrados de `PlayerAvatar` a `PlayerSportAvatar`
* Documentado como backlog, no implementado por falta de datos en lote sin ampliar contratos existentes: badges de categoría en Reservas/solicitudes/calendario

## Exportaciones deportivas (Bloque 3.4)

* Nueva capacidad, OWNER/ADMIN únicamente: generar una imagen PNG (1080×1350) para compartir el Top 10 del Ranking de la categoría seleccionada
* Componentes nuevos: `ShareCardShell` (marco visual compartido), `RankingShareCard`, `ShareCardModal` (previsualización + compartir/descargar), `RankingExportButton` (wiring de datos, sin consultas nuevas — reutiliza exactamente lo ya cargado por la página)
* `src/lib/sportsShareExport.ts`: única utilidad de exportación del proyecto; resuelve avatares/logo a data URL con timeout de 6s por imagen (nunca bloquea por una imagen lenta o caída, cae a iniciales), captura con `html-to-image` (única dependencia nueva agregada, `html-to-image@1.11.13`), Web Share API con archivo (nunca solo URL) con fallback a descarga directa
* Ninguna publicación automática en redes; ninguna subida a Storage; sin service role en ningún punto
* **Nota**: el módulo de Torneos alguna vez tuvo, en la arquitectura de brackets ya retirada (ver Módulo de Torneos), un plan de exportación equivalente para podio/resultados. Esa arquitectura fue eliminada junto con el resto del cuadro eliminatorio y la exportación de torneos nunca se reconstruyó sobre el modelo actual — hoy solo existe exportación de Ranking.

## Corrección: bloqueo indefinido de la generación de imágenes (Bloque 3.5)

* "Compartir Top 10" (y, por infraestructura compartida, cualquier exportación futura) podía quedar cargando indefinidamente, sin error, con el botón "Descargar" siempre deshabilitado — confirmado leyendo el código fuente instalado de `html-to-image`: incrusta automáticamente las fuentes web escaneando TODAS las hojas de estilo del documento (nunca solo el nodo capturado) mediante `fetch()` sin ningún timeout propio; si una hoja no podía leerse de forma síncrona, la generación quedaba colgada para siempre
* Corregido con `skipFonts: true` en la llamada a `toBlob()` (elimina la causa raíz por completo) más un timeout global de generación (15s) con un token de intento vigente en `ShareCardModal` — un resultado tardío de un intento ya abandonado (tras timeout o tras un reintento) nunca sobrescribe el estado de uno más nuevo
* Se agregó además timeout de 6s por imagen en `resolveImageDataUrl` (vía `AbortController`) como defensa adicional, sin cambio de comportamiento visible cuando la imagen carga con normalidad

Pendiente:

* Confirmar de forma directa contra la base de datos que `20260920000001_public_club_ranking_read.sql` está aplicada (ver nota de estado más arriba)
* Badges de categoría en Reservas (evaluado, no implementado — ver arriba)
* Verificación visual real de la tarjeta exportable en dispositivo/navegador (validado por código y build, no por captura observada)

---

# Módulo de Torneos

Estado:

✅ Completo de punta a punta sobre el modelo actual (evento de club + inscripciones + clasificación por puntos, sin bracket). Ver CLAUDE.md → Tournament Module Principles para las reglas de arquitectura permanentes. Este apartado documenta el detalle de lo construido.

Pendiente: notificaciones de eventos de Torneos (inscripción confirmada/rechazada, torneo iniciado/finalizado) — sin backend ni UI todavía.

## Reconstrucción del núcleo (evento real, no incremental)

El módulo se lanzó primero con una arquitectura completa de cuadro eliminatorio (bracket 4/8/16, partidos, programación de canchas, marcador por sets, propagación automática de ganador, premiación por posición de bracket) — documentada en su momento como "completa de punta a punta". Una vez en uso, se confirmó que esa complejidad no correspondía al objetivo real del producto, y se tomó la decisión explícita de **eliminarla y reconstruir el módulo con un alcance mucho más simple**: Mi Pádel Club deja de administrar la competencia deportiva interna del torneo (partidos, rondas, llaves, canchas, marcadores) y pasa a administrar únicamente el torneo como evento de club — inscripciones, duplas, clasificación por puntos y su aplicación al ranking.

La reconstrucción (`20260922000001`/`20260922000002`) eliminó por completo `tournament_matches` y `tournament_court_allocations` (tablas, RPCs y UI — `BracketSection`/`BracketView`/`MatchCard`, `CourtAllocationsSection`/`ScheduleMatchModal`, `RecordTournamentMatchResultModal`, `TournamentAwardsSection`/`TournamentAwardPairCard`, `TournamentAwardSummary`, `award_tournament_points`/`get_tournament_points_summary` ya no existen), autorizada explícitamente porque solo existían dos torneos de prueba en el entorno; revirtió primero, jugador por jugador, el efecto de cualquier punto ya otorgado por esos torneos sobre el ranking real (con validación previa de que ningún jugador quedara en negativo), y solo entonces eliminó los datos y reconstruyó el esquema. Ningún dato de club/reservas/ranking fuera de Torneos fue tocado.

## Migraciones

```text
supabase/migrations/20260902000001_courts_id_club_id_unique.sql
supabase/migrations/20260903000001_tournaments_table.sql
supabase/migrations/20260904000001_tournament_court_allocations_table.sql        (tabla retirada en 20260922000001)
supabase/migrations/20260905000001_tournament_entries_table.sql
supabase/migrations/20260906000001_tournament_entry_members_table.sql
supabase/migrations/20260907000001_tournament_matches_table.sql                  (tabla retirada en 20260922000001)
supabase/migrations/20260908000001_club_player_point_movements_tournament_support.sql
supabase/migrations/20260909000001_tournament_admin_functions.sql                (funciones reemplazadas en 20260922000002)
supabase/migrations/20260910000001_tournament_entry_registration_functions.sql   (reemplazadas en 20260922000002)
supabase/migrations/20260911000001_generate_tournament_bracket_function.sql      (función retirada en 20260922000001)
supabase/migrations/20260912000001_tournament_scheduling_functions.sql           (funciones retiradas en 20260922000001)
supabase/migrations/20260913000001_tournament_match_lifecycle_functions.sql      (funciones retiradas en 20260922000001)
supabase/migrations/20260914000001_award_tournament_points_function.sql          (función retirada en 20260922000001)
supabase/migrations/20260915000001_tournament_rpc_grants_and_rls.sql
supabase/migrations/20260916000001_tournament_combined_category_model.sql
supabase/migrations/20260917000001_tournament_entry_category_composition.sql
supabase/migrations/20260918000001_fix_tournament_lifecycle_returns_regression.sql
supabase/migrations/20260919000001_get_tournament_points_summary_function.sql    (función retirada en 20260922000001 — no aplicar)
supabase/migrations/20260920000001_public_club_ranking_read.sql                  (ranking, no torneos — sigue pendiente, ver Módulo Deportivo)
supabase/migrations/20260921000001_fix_generate_tournament_bracket_ambiguous_id.sql (función retirada en 20260922000001 — no aplicar)
supabase/migrations/20260922000001_tournament_core_rebuild_schema.sql            ← reconstrucción del núcleo (esquema)
supabase/migrations/20260922000002_tournament_core_rebuild_functions.sql         ← reconstrucción del núcleo (funciones)
supabase/migrations/20260923000001_tournament_allow_edit_before_start.sql
supabase/migrations/20260924000001_tournament_estimated_duration.sql
supabase/migrations/20260924000002_tournament_estimated_duration_functions.sql
supabase/migrations/20260925000001_tournament_slug.sql
supabase/migrations/20260925000002_tournament_slug_functions.sql
supabase/migrations/20260926000001_tournament_entry_members_own_entry_visibility.sql
supabase/migrations/20260927000001_tournament_max_pairs_active_entries_check.sql
supabase/migrations/20260928000001_tournament_update_error_messages.sql
supabase/migrations/20260929000001_club_news_tournament_link.sql
supabase/migrations/20260930000001_tournament_cover_image_any_status.sql
supabase/migrations/20261001000001_club_news_slug.sql
supabase/migrations/20261001000002_create_club_news_function.sql
supabase/migrations/20261008000001_superadmin_club_access.sql          (agrega el bypass de acceso elevado SUPERADMIN a ~15 RPCs de Torneos — ver Panel de Plataforma (SUPERADMIN); introdujo, sin querer, la ambigüedad de columna corregida por las 11 migraciones siguientes)
supabase/migrations/20261012000001_reassert_create_tournament_admin_access.sql (re-aplicación sin cambios reales de `create_tournament` — la causa real del síntoma que la motivó se encontró recién en la migración siguiente)
supabase/migrations/20261013000001_fix_create_tournament_ambiguous_club_id.sql
supabase/migrations/20261014000001_fix_open_registration_ambiguous_club_id.sql
supabase/migrations/20261015000001_close_registration_min_pairs.sql    (nueva regla: mínimo 2 duplas confirmadas para cerrar inscripciones; agregó, sin querer, otra ambigüedad — ver `20261023000001`)
supabase/migrations/20261016000001_fix_register_entry_ambiguous_club_id.sql
supabase/migrations/20261017000001_fix_cancel_tournament_ambiguous_club_id.sql
supabase/migrations/20261018000001_fix_start_tournament_ambiguous_club_id.sql
supabase/migrations/20261019000001_fix_set_entry_points_ambiguous_club_id.sql
supabase/migrations/20261020000001_tournament_archive.sql              (archivado de torneo — ver Modelo de datos)
supabase/migrations/20261021000001_tournament_lifecycle_archive_columns.sql (sync manual de `RETURNS TABLE` tras agregar `archived_at`/`archived_by`; corrigió, de paso, la misma ambigüedad en `update_tournament`/`reopen_tournament_registration`/`update_tournament_cover_image`)
supabase/migrations/20261022000001_fix_withdraw_entry_ambiguous_club_id.sql (la única función que el barrido anterior no cubrió — encontrada diagnosticando un reporte real de un PLAYER)
supabase/migrations/20261023000001_fix_close_registration_ambiguous_status.sql (misma clase de bug, columna `status` en vez de `club_id` — encontrada diagnosticando un reporte real de un OWNER)
```

**Nota sobre aplicación manual**: `20260919000001` y `20260921000001` escriben/modifican funciones que la propia reconstrucción del núcleo (`20260922000001`) ya elimina (`DROP FUNCTION IF EXISTS`) — aplicarlas nunca tuvo efecto útil y pueden omitirse sin riesgo; el `IF EXISTS` del DROP posterior las neutraliza igual si se aplican en orden. Todo lo demás en esta lista, incluidas las 13 migraciones más recientes arriba, está confirmado corriendo en vivo — varias de las correcciones de columna ambigua se diagnosticaron precisamente reproduciendo el error real (`42702`) contra la base de datos de producción/staging.

## Modelo de datos (post-reconstrucción)

* `tournaments`: `name`, `description`, `category` (superior o única), `secondary_category` (inferior, `NULL` = categoría única), `max_pairs` (cupo máximo de duplas — cualquier entero positivo, ya no una potencia de 2), `status` (`draft` → `registration_open` → `registration_closed` → `in_progress` → `completed`, o `cancelled` desde cualquiera de los tres primeros; `registration_closed` → `registration_open` también permitido — reapertura), `started_at`/`started_by` (poblados al iniciar, junto a los ya existentes `completed_at`/`completed_by`, `cancelled_at`/`cancelled_by`), `visibility` (`public`/`private`), `slug` (único por club, URL legible), `estimated_duration_minutes` (reemplaza `ends_at`), `prize_description`, `cover_image_url`
* `tournament_entries`: una pareja inscrita; `status` `pending`/`confirmed`/`withdrawn`/`rejected`; `points` (entero ≥ 0, editable solo con el torneo `in_progress`, es la única fuente de la clasificación — nunca una tabla paralela); `rejected_at`/`rejected_by`/`rejection_reason` (texto obligatorio — manual con comentario del organizador, o automático con el valor fijo `capacity_reached` cuando una confirmación completa el cupo); `category`/`secondary_category` congelan la modalidad del torneo al momento de crear la inscripción, nunca recalculadas después
* `tournament_entry_members`: dos filas activas (`is_active`) por entry en todo momento; reemplazo de integrante es reemplazo con historial (nunca borrado físico) — la fila saliente se marca `is_active=false`/`replaced_at`/`replaced_by` y se inserta una fila nueva activa para el jugador entrante
* `club_player_point_movements`: `system_event_code` reducido a un único código de torneo (`tournament_points`, reemplaza los 4 códigos por posición de bracket que existían antes); `tournament_id`+`club_member_id` con índice único parcial — como máximo un movimiento de torneo por jugador y torneo, garantizado por la base de datos, no solo por la función que lo escribe
* `tournament_matches`/`tournament_court_allocations` **ya no existen** — sin bracket, sin partidos, sin programación de canchas por torneo

## RPCs (todas `SECURITY DEFINER`, `authenticated` únicamente, nunca `anon`)

**Administración del torneo:**

* `create_tournament(p_club_id, p_name, p_category, p_max_pairs, p_description, p_visibility, p_registration_opens_at, p_registration_closes_at, p_starts_at, p_estimated_duration_minutes, p_secondary_category, p_prize_description)` — OWNER/ADMIN; genera y persiste el `slug` con reintento real ante colisión (`INSERT`-retry, nunca `SELECT`-then-`INSERT`), reutilizando `_slugify_tournament_name`
* `update_tournament(...)` — editable hasta `started_at` (no solo hasta abrir inscripciones); `max_pairs` editable con inscripciones abiertas, validado contra la cantidad real de duplas activas (mensaje de error interpola el conteo real)
* `open_tournament_registration`, `close_tournament_registration`, `reopen_tournament_registration`, `cancel_tournament`, `start_tournament` (`registration_closed` → `in_progress`, puebla `started_at`/`started_by`) — transiciones de estado, sin bypass de rol
* `update_tournament_cover_image(p_tournament_id, p_cover_image_url)` — OWNER/ADMIN, deliberadamente **sin** el gate de estado que sí aplica `update_tournament`: la portada es editable en cualquier estado, incluido `completed`
* `archive_tournament(p_tournament_id)` / `restore_tournament(p_tournament_id)` — OWNER/ADMIN, solo sobre un torneo `completed` o `cancelled`; toggle puro de visibilidad (`archived_at`/`archived_by`) ortogonal al `status` deportivo, que nunca se toca — mismo diseño que `clubs.archived_at`. Al restaurar, el torneo reaparece en la pestaña que su `status` sin cambios ya implicaba

**Inscripción y duplas:**

* `register_tournament_entry(p_tournament_id, p_club_member_one_id, p_club_member_two_id)` — PLAYER: debe incluirse, solo con `registration_open`, crea `pending`; OWNER/ADMIN: cualquier pareja válida, en `registration_open`/`registration_closed`/`in_progress`, crea `confirmed` directamente. Valida individualmente el `club_member_sport_state` de cada jugador (nunca un `COUNT` global) y la composición de categorías (torneo simple: ambos exactos a `category`; combinado: ambos en `{category, secondary_category}` con a lo sumo uno en la superior)
* `confirm_tournament_entry` — OWNER/ADMIN; si la confirmación completa `max_pairs`, cierra inscripciones y rechaza en bloque el resto de `pending` con `rejection_reason='capacity_reached'` (`_close_tournament_registration_for_capacity`, helper interno, misma transacción)
* `reject_tournament_entry(p_tournament_entry_id, p_reason)` — OWNER/ADMIN, rechazo manual de una `pending` con motivo obligatorio
* `withdraw_tournament_entry` — el propio PLAYER retira su entry, u OWNER/ADMIN retira cualquiera
* `replace_tournament_entry_member(p_tournament_entry_id, p_outgoing_member_id, p_incoming_member_id)` — reemplazo/corrección de integrante con historial completo, nunca borrado físico

**Clasificación y cierre:**

* `set_tournament_entry_points(p_tournament_id, p_entry_ids[], p_points[])` — OWNER/ADMIN, batch (nunca una llamada por dupla), solo con el torneo `in_progress`, solo sobre entries `confirmed`, puntos no negativos, sin duplicados en el lote
* `finalize_tournament(p_tournament_id)` — `in_progress` → `completed`; aplica en partes iguales los puntos ya guardados en `tournament_entries.points` de cada entry confirmada a sus dos integrantes finales (`is_active=true`) del ranking real, en la misma transacción que el cambio de estado. Idempotente de verdad: verificación previa por conteo de movimientos + índice único de base de datos como garantía última — un reintento devuelve `already_finalized=true` sin volver a escribir nada. Nunca deriva ni recalcula posiciones: usa exactamente el valor ya usado por la clasificación en vivo

Autorización en cada función: membresía ACTIVA consultada directamente en `club_members`, `IF NOT FOUND` explícito, comparación positiva (`role IN (...)`), nunca `NOT IN` sobre un valor que pueda ser `NULL` — mismo patrón exigido en todo el módulo desde `20260825000001`. `_require_club_not_archived` se exige en toda operación que crea o amplía un compromiso nuevo (crear/editar/abrir/reabrir torneo, inscribir, confirmar, reemplazar integrante, editar puntos, iniciar) — nunca en una que solo resuelve algo existente (cerrar, rechazar, retirar, cancelar, finalizar).

## Clasificación en vivo (nunca persistida)

`computeTournamentClassification(entries)` (`src/lib/tournamentEntries.ts`) es la única fuente de posición/ranking/podio/campeón de todo el módulo: ordena entries `confirmed` por `points` desc (empate por `created_at` asc) y asigna `position` con semántica de salto en empate (dos duplas con los mismos puntos comparten posición; la siguiente salta el número correspondiente) — nunca reimplementada ni recalculada por índice en ningún otro punto (clasificación en curso, podio de torneo finalizado, o campeones mostrados en una noticia). Empates reales a cualquier posición, incluida la primera, se muestran honestamente — el módulo nunca inventa o colapsa un ganador único ni un "tercer lugar" que la clasificación real no produjo.

## RLS y privilegios

RLS habilitada en las 3 tablas núcleo restantes (`tournaments`, `tournament_entries`, `tournament_entry_members`). Lectura: OWNER/ADMIN ven todo de su club; cualquier miembro activo ve `tournaments` no-`draft` y entries `confirmed` (más las propias `pending`/`withdrawn`/`rejected` vía `created_by`); visitantes externos/`anon` pueden leer `tournaments` solo cuando el torneo es público, no-`draft`, y el club es público/activo/no archivado. Un jugador ve la fila de su propio compañero en una pareja todavía `pending` (bug real corregido en `20260926000001` — la causa era RLS, no la persistencia: `register_tournament_entry` siempre escribió las dos filas correctamente; se resolvió con una función `SECURITY DEFINER` intermedia, `is_current_user_tournament_entry_member`, para evitar autorreferencia/recursión en la política). `GRANT EXECUTE` explícito por firma exacta a `authenticated`, nunca `anon`, nunca wildcard — excepción única del módulo deportivo completo: `get_club_category_ranking`/`get_club_category_ranking_view`, ver Sport / Ranking Module Principles.

## Lecciones permanentes (capturadas en CLAUDE.md → Tournament Module Principles)

Dos clases de bug real, ya corregidas, siguen siendo relevantes para cualquier función nueva del módulo: (1) cualquier `RETURN QUERY SELECT (row).*` debe mantenerse en sincronía manual con el esquema real de la tabla — una discordancia de aridad tras agregar una columna solo se detecta en tiempo de ejecución; (2) cualquier referencia a columna sin calificar (en un `WHERE`, una subconsulta, o un `RETURNING`) dentro de una función cuyo `RETURNS TABLE` comparte nombre de columna con una tabla leída o escrita en el cuerpo (p. ej. `id`, `club_id`, `status`) es ambigua (`42702`) y también solo se detecta en tiempo de ejecución — cualquier sentencia de este tipo debe alias la tabla explícitamente.

**Historial real de (2), no hipotético**: el bypass de acceso elevado SUPERADMIN agregado en `20261008000001` (ver Panel de Plataforma (SUPERADMIN)) introdujo exactamente este bug — una subconsulta `NOT EXISTS` sin alias sobre `club_members` — en prácticamente todas las funciones de ciclo de vida del módulo. Se fue encontrando y corrigiendo función por función, nunca de una sola pasada: `create_tournament` (`20261013000001`), `open_tournament_registration` (`20261014000001`), `close_tournament_registration` (`20261015000001`), `register_tournament_entry` (`20261016000001`), `cancel_tournament` (`20261017000001`), `start_tournament` (`20261018000001`), `set_tournament_entry_points` (`20261019000001`), `update_tournament`/`reopen_tournament_registration`/`update_tournament_cover_image` (`20261021000001`, encontradas de paso durante un sync de `RETURNS TABLE` no relacionado), `withdraw_tournament_entry` (`20261022000001`, encontrada diagnosticando un reporte real de un PLAYER que no podía retirar su dupla). `close_tournament_registration` volvió a fallar después de ya corregida, esta vez por una columna distinta (`status`, en el conteo de duplas confirmadas agregado por `20261015000001`) — corregido en `20261023000001` tras diagnosticar un reporte real de un OWNER. Lección operativa además de la técnica: cuando un patrón de bug se confirma en una función, auditar activamente las funciones hermanas que comparten el mismo patrón recién introducido, en vez de esperar a que cada una falle en producción una por una.

## UI — Administración

* Navegación: ítem "Torneos" (ícono `Swords`) para OWNER/ADMIN en sidebar/tab-bar-secundario, y para PLAYER en su propia navegación
* Ruta canónica única para los tres roles: `/[club]/tournaments/[tournamentSlug]` (`TournamentDetailView`, compartida — lo único que cambia por rol son las acciones administrativas, nunca el layout); `/[club]/admin/tournaments/[tournamentId]` (antigua) y cualquier enlace histórico basado en UUID redirigen a la URL canónica con slug
* Creación/edición: `TournamentForm` compartido, categoría principal + secundaria opcional, campos de fecha `datetime-local` convertidos a UTC vía `src/lib/utils/bogotaDatetime.ts`
* Transiciones (abrir/cerrar/reabrir inscripciones, iniciar, cancelar) con `ConfirmDialog`, gateadas por el estado real, nunca adivinado

## UI — Inscripciones, duplas y reemplazo de integrante

* `EntriesSection` (compartida OWNER/ADMIN y PLAYER): capacidad (`pending + confirmed` contra `max_pairs`, barra de progreso), grupos Pendientes/Confirmadas/Retiradas para OWNER/ADMIN, sección "Tu inscripción" + lista de confirmadas para PLAYER; `WithdrawnEntriesAccordion` separado, oculto cuando el torneo está `completed`
* `RegisterEntryModal`/`PlayerCombobox`: candidatos resueltos vía `get_club_category_ranking_view`; en torneo combinado el segundo selector se recalcula según la categoría elegida en el primero
* `ReplaceMemberModal`/`PlayerTransferList`: reemplazo de integrante desde el detalle, vía `replace_tournament_entry_member`
* `PairMemberSlot`: presentación compartida de un integrante de pareja, reutilizada en toda superficie que muestra una dupla

## UI — Clasificación en vivo (torneo `in_progress`)

* `ClassificationSection`: lista deportiva compacta — medalla 🥇🥈🥉 real (emoji, no ícono coloreado) para el top 3 vía `PositionMedal`, un único badge de categoría por pareja (nunca por jugador), badge "TÚ" para la propia dupla, barra de puntos proporcional, edición de puntos inline para OWNER/ADMIN (mismo `<input>` que ya validaba `set_tournament_entry_points`); acción "Cambiar jugadores" movida a un menú de tres puntos (`ContextMenu`, reutilizado y mejorado: cierre con Escape, foco al primer ítem, `role="menu"`)
* Cada fila comparte una única clase estática (mismo fondo/borde para todas las posiciones) — la medalla es la única señal visual de podio; corrige una inconsistencia real donde la altura de fila difería entre PLAYER (texto plano) y OWNER/ADMIN (`<input>`, `h-9`) y donde el fondo/borde variaba por posición
* Auto-actualización al recuperar el foco de la pestaña mientras el torneo está `in_progress` (`visibilitychange`/`focus`, debounced, `useTransition` + `startTransition(() => router.refresh())`), con `ClassificationSkeleton` durante la recarga

## UI — Torneo finalizado (podio y confetti)

* `TournamentPodium`: agrupa filas por posición oficial (nunca por dupla) — un solo bloque físico por posición 1/2/3, `grid grid-cols-3` activo desde el ancho más pequeño (nunca colapsa a tarjetas verticales en mobile), orden 2º-izquierda/1º-centro/3º-derecha; pedestal de altura fija por posición, totalmente desacoplado del contenido (que tiene scroll interno acotado) — la cantidad de duplas empatadas nunca distorsiona la jerarquía 1º>2º>3º; una posición sin ocupar renderiza un placeholder vacío, nunca reasigna ni inventa una posición faltante
* `TournamentConfetti`: se lanza al entrar a un torneo `completed`, se repite cada 10s mientras la pestaña está visible, se detiene por completo al ocultarla y reinicia el ciclo al recuperar visibilidad; respeta `prefers-reduced-motion`
* Portada del torneo editable en cualquier estado (`EditTournamentCoverModal` + `update_tournament_cover_image`), incluido `completed` — útil para ilustrar el torneo antes de generar su noticia de cierre

## UI — Cierre editorial (noticia del torneo)

* `TournamentNewsAction`, visible solo para OWNER/ADMIN con el torneo `completed`: "Generar noticia" abre el modal real de creación de Noticias (`CreateNewsModal`/`NewsForm`, nunca un segundo formulario) con título/contenido prellenados por `buildTournamentNewsDraft` (`tournamentNewsDraft.ts`) — derivado exclusivamente de la clasificación real (`computeTournamentClassification`), nunca inventa datos — y la portada del torneo como imagen inicial (editable/reemplazable como cualquier otra)
* La asociación noticia↔torneo es real y trazada: `club_news.tournament_id`, con índice único parcial que garantiza como máximo una noticia por torneo a nivel de base de datos (no solo una validación de aplicación) — una vez publicada, la acción cambia a "Ver noticia". Esta limitación (antes documentada como gap abierto) queda **resuelta**
* Esta acción es una superficie lateral OWNER/ADMIN-only — PLAYER y visitantes nunca la ven, pero la noticia publicada es completamente visible para todos bajo las reglas normales de Noticias, sin distinción por su origen

## Noticias — URLs legibles y avatares de campeones

* `club_news.slug` (único por club, `UNIQUE(club_id, slug)`), generado con el mismo helper de slugificación que ya usa `tournaments` (`_slugify_tournament_name`, nunca duplicado); backfill de noticias existentes con resolución de colisión por fecha de publicación y sufijo incremental
* `create_club_news` (RPC nueva, reemplaza el `INSERT` directo desde el cliente que hacía `createNews`): valida rol, campos, y (cuando aplica) que el torneo exista, pertenezca al mismo club y esté `completed`; genera el slug con reintento real ante colisión (mismo patrón `INSERT`-retry ya establecido por `create_tournament`)
* `newsDetailPath(clubSlug, newsSlug)` (`src/lib/newsPaths.ts`): único constructor de URL de noticia reutilizado en todos los puntos de enlace (tarjetas admin/públicas, `TournamentNewsAction`, la propia página de detalle). Un enlace histórico basado en UUID se resuelve por `id` y redirige de inmediato a la URL canónica con slug
* `NewsTournamentChampions`: en el detalle de una noticia con `tournament_id`, muestra a los campeones reales (posición 1 de `computeTournamentClassification`, con soporte de empate) — un avatar (`PlayerSportAvatar`) + nombre por jugador, nunca inventado ni aproximado por título/contenido

---

# Dashboard del PLAYER

Estado: ✅ MVP funcional

Ruta:

```text
/[club]/dashboard
```

Nuevo punto de entrada del PLAYER al club (`getClubEntryPath`), en la misma URL que ya usaba el Dashboard operativo de OWNER — la página (`dashboard/page.tsx`) ahora se bifurca por rol: OWNER/ADMIN conservan exactamente su dashboard operativo sin ningún cambio; PLAYER recibe una composición completamente distinta, un perfil deportivo personal, nunca una copia reducida del panel administrativo.

Incluye, en orden mobile-first (desktop: máximo dos columnas):

1. **Encabezado deportivo** — avatar (`PlayerSportAvatar`), categoría, posición y puntos actuales; cuando hay historial suficiente, también "Subiste/Bajaste N posiciones" (comparado contra el snapshot real más cercano a 30 días atrás) y un cambio de categoría reciente (últimos 30 días)
2. **Próxima actividad** — la reserva confirmada/pendiente más próxima (reutiliza `getPlayerReservations`), o si no hay ninguna, el próximo torneo con inscripción propia; sin ninguna de las dos, accesos rápidos a Reservar cancha / Ver torneos. Nunca crea nada
3. **Evolución deportiva** — gráfica con toggle Puntos/Posición y filtro 30 días/3 meses/6 meses/Histórico, reconstruida 100% desde el ledger real de puntos (nunca una tabla de historial nueva)
4. **Resumen deportivo** — puntos, posición, categoría, torneos jugados/ganados, podios, horas jugadas (reservas confirmadas ya finalizadas)
5. **Mis torneos** — tarjetas con la clasificación oficial real (`computeTournamentClassification`, respeta empates), compañero, fecha y puntos
6. **Logros deportivos** — calculados dinámicamente (primer torneo, primer podio, primer campeonato, Top 3, ascenso de categoría), nunca un sistema de gamificación nuevo
7. **Actividad reciente** — línea de tiempo personal, unión de eventos ya existentes (reservas, inscripciones/torneos finalizados, movimientos de puntos derivados de la evolución, cambio de categoría)

Backend nuevo, mínimo y acotado:

* `get_my_club_sport_profile(p_club_id)` (`20261002000002_player_dashboard_sport_profile.sql`) — única RPC nueva de este bloque. Self-only (deriva `club_member_id` de `auth.uid()` + `p_club_id`, nunca lo recibe como parámetro), PLAYER-only. Expone lo que `club_member_sport_state`/`club_player_point_movements`/`club_player_category_changes` no exponían a ningún cliente (RLS cerrada sin políticas, ver Módulo Deportivo Fase 1): categoría, puntos y posición actuales (pidiendo el número directamente a `get_club_category_ranking`, nunca una segunda fórmula), el cambio de categoría más reciente, y una reconstrucción honesta de la evolución de puntos/posición a partir del ledger real (cada snapshot = un movimiento propio real; posición de cada snapshot recalculada con el mismo criterio de desempate que el ranking en vivo)
* Todo lo demás (próxima actividad, mis torneos, resumen, actividad reciente) se resuelve en `src/lib/playerDashboard.ts` reutilizando `getPlayerReservations`, `getTournamentEntriesWithMembers`/`computeTournamentClassification`/`isOwnEntry`, y lectura directa de `reservations`/`tournament_entries`/`tournament_entry_members` bajo su RLS ya existente (el PLAYER es, por definición, miembro activo del club que está viendo) — ninguna regla de reservas, ranking o torneos se modificó

---

# Reservas — Tiempo Extra

Estado: ✅ MVP funcional (`supabase/migrations/20261009000001_reservation_extra_time.sql`)

OWNER/ADMIN pueden extender la duración de una reserva ya `confirmed` más allá de lo originalmente reservado, con un cargo extra opcional. No es una edición (ver Reservation Editing & Cancellation Principles en CLAUDE.md, sin cambios) — es un mecanismo aditivo y separado:

* `reservations.duration_minutes` pasa a representar la ocupación total vigente (duración original + toda extensión otorgada), decisión deliberada para que cualquier chequeo de conflicto, cálculo de hora de fin o vista de calendario ya existente siga funcionando sin ningún cambio
* Nuevas columnas acumulador `extra_minutes`/`extra_amount`/`extra_currency` — nunca tocan `price_amount`/`price_currency` originales
* Tabla nueva `reservation_extra_time_entries`, append-only, RLS cerrada sin políticas (mismo patrón que `club_player_point_movements`) — historial completo de cada extensión
* `add_reservation_extra_time(p_reservation_id, p_extra_minutes, p_extra_amount, p_note)` — solo sobre `status='confirmed'`, 1 a 480 minutos, valida contra el horario de cierre del club, usa el mismo lock/chequeo de conflicto (`_lock_court_date`/`_check_reservation_conflict`) que cualquier otra escritura de disponibilidad, releyendo bajo el lock para acumular correctamente ante extensiones concurrentes
* Notificación propia (`notify_reservation_extra_time_added`) a el creador y todos los `reservation_players`, reutilizando el sistema de notificaciones existente
* UI: `AddExtraTimeModal` (formulario puro — muestra hora de fin actual/nueva, cargo extra, nuevo total; la llamada real al RPC vive en `ReservationTicketPanel`, que ya orquesta el resto de acciones de una reserva)

---

# Panel de Plataforma (SUPERADMIN)

Estado: ✅ MVP funcional. Construido en `20261003000001` → `20261008000001`. Ver CLAUDE.md → Role Philosophy → SUPERADMIN para las reglas permanentes; este apartado documenta el detalle de lo construido, incluidas dos iteraciones de diseño intermedias que ya no reflejan el código actual (se documentan solo como historial, no como arquitectura vigente).

## Entrega de Club (creación y reclamo)

* `platform_create_pending_club(p_name, p_slug, p_visibility)` — SUPERADMIN-only. Crea el club con `is_active=true, pending_claim=true` y, en la misma transacción, inserta al SUPERADMIN creador como fila `club_members(role='OWNER')` real y activa — así puede usar cualquier flujo OWNER normal (branding, ubicación, canchas, horarios, tarifas, reservas, torneos, jugadores, invitaciones ADMIN) sin ningún rol sintetizado ni superficie paralela
* Iteración de diseño descartada, sin efecto en el código actual: la primera versión (`20261003000001`) creaba el club con `is_active=false` y cero miembros, apoyada en una función `is_platform_admin_for_pending_club` con su propio bypass de RLS — todo esto fue eliminado por completo en `20261005000001` al adoptar el modelo de "fila OWNER real" descrito arriba
* Esta fila OWNER temporal es la única forma de membresía que un SUPERADMIN puede llegar a tener jamás, protegida a nivel de base de datos (`enforce_club_members_account_type_consistency`) a que `clubs.pending_claim=true` para ese club exacto
* `platform_generate_club_claim_link(p_club_id, p_token_hash)` — genera (o regenera, revocando primero cualquier link `pending` previo de forma atómica) un link de reclamo de un solo uso; `platform_revoke_club_claim_link(p_club_id)` lo invalida manualmente. Token: `randomBytes(32)` base64url del lado del servidor, hasheado SHA-256 antes de persistirse (`club_claim_links.token_hash`) — el token en claro nunca se guarda
* `get_club_claim_status(p_club_id)` (SUPERADMIN-only, `/platform/clubs/[clubId]` → `ClubClaimSection.tsx`) y `get_club_claim_preview(p_token_hash)` (`anon`+`authenticated`, vista previa pública del link en `/claim-club/[token]`)
* `claim_club(p_token_hash, p_ip)` — el handoff atómico y de un solo uso: bloquea (`FOR UPDATE`) el link, el club y toda fila OWNER activa, en ese orden; exige que exista exactamente una OWNER activa y que sea la fila placeholder del SUPERADMIN; inserta al reclamante como OWNER real, desactiva la fila placeholder, y fija `pending_claim=false` de forma permanente — todo en una sola transacción. Rechaza reclamantes que sean ellos mismos `is_platform_admin` o cuyo `account_type` ya no sea compatible con volverse OWNER
* Auditoría completa e inmutable en `club_claim_events` (generado/revocado/reclamado, con `previous_owner_id`)
* UI: `/platform/clubs/create` (`PendingClubFields.tsx`), `/platform/clubs/[clubId]` (`ClubClaimSection.tsx`), `/claim-club/[token]` (`AcceptClaimCard.tsx`)

## Acceso elevado ("Entrar al club")

Mecanismo separado y distinto de Entrega de Club — aplica a cualquier club **ya reclamado y activo**, nunca a uno `pending_claim`, y nunca crea una fila `club_members`.

* `is_superadmin_club_access(p_club_id)` — `true` cuando el caller es `is_platform_admin` y el club está `is_active=true`. Sin excepción para clubes archivados u OWNER-explícitamente-presente: solo determina si el bypass *podría* aplicar
* `effective_club_role(p_club_id)` — `club_role(p_club_id)` si el caller tiene membresía real (de cualquier rol) en el club; si no, cae a `'OWNER'` sintético únicamente cuando `is_superadmin_club_access` es verdadero. Una membresía real siempre gana — el bypass solo cubre el caso de cero membresía
* Aplicado de dos formas: (A) swap mecánico de `club_role()` por `effective_club_role()` en ~15 RPCs ya existentes (reservas, canchas, tarifas, jugadores, solicitudes de ingreso, noticias, ranking, y toda la familia de RPCs de Torneos); (B) políticas RLS aditivas sobre `clubs`, `club_members` (excluye explícitamente filas `role='OWNER'` — un SUPERADMIN nunca puede leer/tocar al OWNER real por esta vía), `courts`, `club_operating_hours`, `invitation_links`, `club_pricing_rules`, `club_news`, y lectura (`SELECT`) sobre `reservations`/`reservation_players`/`club_join_requests`/`tournaments`/`tournament_entries`/`tournament_entry_members`
* `src/lib/clubAccess.ts` (`resolveClubAccess`) es el resolutor único: membresía real → `isSuperadminAccess:false`; sin membresía + `is_platform_admin` + club activo → `isSuperadminAccess:true, clubMemberId:null`. `[club]/dashboard/page.tsx` y el resto del layout ya lo usan en vez de una consulta cruda a `club_members`
* UI: `SuperadminAccessBanner.tsx` — banner persistente ("Administrando como SUPERADMIN") en cada pantalla alcanzada por este camino, con link de regreso a `/platform/clubs/[clubId]` — nunca silencioso
* Este bug de acceso elevado (la subconsulta `NOT EXISTS` sin alias sobre `club_members` que introdujo) es la causa raíz de toda la saga de columna ambigua documentada en Módulo de Torneos → Lecciones permanentes

## Desactivar / Reactivar club

* `platform_deactivate_club(p_club_id)` / `platform_reactivate_club(p_club_id)` — SUPERADMIN-only, alternan `clubs.is_active` + `deactivated_at`/`deactivated_by`/`reactivated_at`/`reactivated_by`. Primer uso real de `is_active`, columna que existía sin uso desde el esquema original
* Ortogonal a `clubs.archived_at` (ver Archivado de Clubes): `is_active` es del SUPERADMIN y sí es reversible; `archived_at` es del OWNER y no lo es en el MVP
* `_require_club_not_archived` se amplió para también rechazar `is_active=false` (mismo código `P0005`, mismo patrón de bloqueo — solo operaciones que crean un compromiso nuevo, nunca las que resuelven algo existente)
* Todo miembro — OWNER, ADMIN o PLAYER — ve una pantalla completa "desactivado por la plataforma" (`ClubDeactivatedScreen.tsx`) en vez de su área operativa mientras el club está desactivado
* De paso se cerró un gap real preexistente: `create_club_news` nunca había tenido el guard `_require_club_not_archived`; ahora lo tiene
* UI: `DeactivateClubButton.tsx`/`ReactivateClubButton.tsx` en `/platform/clubs/[clubId]`

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

El módulo deportivo (ranking por categoría, con su UI administrativa/pública y exportaciones), el módulo de Torneos (de punta a punta sobre el modelo actual — inscripciones, duplas, clasificación por puntos, cierre y noticia asistida; sin cuadro/scheduling, retirados en la reconstrucción del núcleo) y el Panel de Plataforma SUPERADMIN (Entrega de Club, acceso elevado, desactivar/reactivar) ya están construidos. La nota histórica sobre `20260919000001`/`20260920000001`/`20260921000001` como "pendientes de aplicar" quedó obsoleta — más de 20 migraciones posteriores están confirmadas corriendo en vivo (ver Módulo de Torneos → Migraciones); solo `20260920000001` no se ha vuelto a verificar directamente.

La prioridad siguiente sigue siendo validar con datos reales, no una nueva categoría de funcionalidad — pendiente de notificaciones de eventos de Torneos (ver Funcionalidades Futuras).

Antes de expandir el producto hacia funcionalidades sociales, clínicas o ladder.
