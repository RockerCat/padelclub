# PadelClub

## Estado General

* Estado: Validation Gate 1.0
* Última actualización: 13 de agosto de 2026 (Ronda extensa de paridad PLAYER en la app móvil, más un fix real de Torneos aplicable a ambas plataformas. **Torneos — estado temporal real:** `registration_open` podía quedar visualmente abierto para PLAYER (sin cron/scheduler, `status` nunca se auto-transiciona) aunque `registration_closes_at`/`starts_at` ya hubieran pasado — nuevas `effectivePlayerTournamentStatus`/`isRegistrationTemporallyOpen`/`hasTournamentStarted` (`shared/tournaments/actions.ts`) son ahora la única fuente para lo que ve un PLAYER en badges/"Próxima actividad"/"Mis torneos"/CTA "Inscribirme", en WEB y mobile por igual; `register_tournament_entry` gana el mismo chequeo server-side (migración nueva, pendiente de aplicar manualmente — ver Módulo de Torneos). **Mobile — navegación PLAYER:** el tab bar de PLAYER dejó de compartir el navegador de OWNER/ADMIN sin ningún guard de rol — un gap real de privacidad, no solo cosmético (ver más abajo) — y ahora es Dashboard | *(nombre real del club, ícono `tennis-ball`)* | Reservaciones | Ranking | *(Torneos, ícono `tennis-racket`)*, igual orden que `AppNav.tsx` en WEB; ambos íconos vía `@lucide/lab` (dependencia nueva, confirmada compatible con Expo Go antes de instalarse). **Mobile — Página del club:** de placeholder a paridad real con `/[club]/home` — mapa interactivo de ubicación (`react-native-maps`, dependencia nueva, "Included in Expo Go" sin config adicional), hero completo (portada, logo superpuesto, nombre, ciudad, indicador público/privado, descripción), detalle real de noticia, y nuevas secciones "Torneos activos"/"Torneos finalizados" (bucketing compartido, `partitionPlayerTournaments`) — todo como carruseles horizontales compactos (Noticias/Torneos, ~44% de card, imagen+título) tanto en mobile como en el breakpoint mobile de WEB, con Galería reubicada entre Noticias y Torneos y ahora tocable en mobile (reutiliza `ImagePreviewModal`, ya existente para portadas de torneo). **Mobile — Ranking:** de placeholder a paridad completa con `RankingView.tsx` — selector de categoría, tarjeta "Tu posición", podio Top 3 (alineado visualmente con `TournamentPodium`, incluida corrección de centrado del avatar dentro de cada pedestal), listado completo, y "Compartir Ranking" (mismo mensaje de WhatsApp que WEB, sin la generación de imagen PNG — `html-to-image` no tiene equivalente en React Native). Extracción nueva a `shared/`: `shared/clubs/publicPageData.ts`, `shared/players/ranking.ts` (`computeRankingPresentation`/`buildRankingWhatsappMessage`, ahora también consumidas por `RankingView.tsx`/`RankingExportButton.tsx` en WEB — ninguna lógica de podio/empates duplicada entre plataformas). OWNER/ADMIN sin ningún cambio de navegación/UX en todo lo anterior. Ver CLAUDE.md → Tournament Module Principles, Sports Data Export Principles, Shared View & Data Patterns.)
* Actualización anterior: 11 de agosto de 2026 (Edición ampliada de reservas OWNER/ADMIN + política de edición por estado temporal, y una ronda extensa de paridad/estabilidad mobile sobre Reservas y Torneos. **Edición de reservas:** OWNER/ADMIN ahora puede editar también tipo/título/notas/jugadores de una reserva (antes solo cancha/fecha/hora/duración), a través de una RPC nueva y separada (`update_reservation_admin`, dos migraciones — la segunda agrega la política de reserva pasada) que nunca toca la RPC PLAYER existente. Nueva política compartida por estado temporal (`shared/reservations/editPolicy.ts`, WEB y mobile): futura/en curso sin restricciones, pasada con cancha/fecha/hora/duración/tipo congelados (solo título/notas/jugadores editables) y sin acciones operativas (abrir-cerrar/cancelar/tiempo extra/gestionar solicitudes) — reforzado server-side, no solo en UI. Ver CLAUDE.md → Reservation Editing & Cancellation Principles. **Bugs corregidos en el camino:** un `ReferenceError` real en WEB rompía el detalle de cualquier reserva pasada (export de tipo mal manejado por el transform de Server Actions de Turbopack); un warning real de React ("unique key") en `/[club]` causado por JSX de un Server Component pasado como prop a un Client Component sin key explícita. **Mobile — Reservas:** portados "Solicitudes pendientes"/"Reservas rechazadas"/tocar un slot ocupado ajeno en Agenda, tiempo extra/abrir-cerrar/gestión de solicitudes de unión en el panel de ticket, botón "Revisar", eliminado el scroll interno de los bloques de horario, corregido el layout de "Nueva reserva", corregido que los jugadores agregados al crear no persistían; la grilla de Agenda ahora colorea y etiqueta (verde/azul/lila/ámbar + nombre del jugador) las reservas de terceros para OWNER/ADMIN igual que WEB — antes se veían indistinguibles de un slot simplemente bloqueado (afectaba a OWNER y ADMIN por igual, nunca fue un bug de rol); el selector de Fecha al editar mostraba "0" y no permitía elegir otro día — ahora carga la fecha real y navega semanas libremente. **Bug crítico corregido:** rechazar una solicitud desde el panel de Agenda de mobile congelaba la app por completo (sin touches, sin scroll, sin error de JS) — causa real: dos `<Modal>` de React Native anidados cerrándose en el mismo tick, una limitación confirmada de iOS; corregido con coordinación determinista vía `onDismiss` del modal interior (nunca un `setTimeout`). Nueva regla permanente en CLAUDE.md → Shared View & Data Patterns. **Mobile — Torneos:** la portada existente de un torneo ahora se ve y se puede reemplazar/quitar desde "Editar torneo" (antes ese formulario no mostraba ninguna imagen) reutilizando `EditTournamentCoverModal` vía swap de modales hermanos, nunca anidado. Checkpoint pre-commit realizado: `tsc`/build limpios en WEB y mobile, sin residuos de diagnóstico, dos migraciones nuevas verificadas compatibles con los tipos y sitios de llamada actuales.)
* Actualización anterior: 11 de agosto de 2026 (Paridad mobile de Torneos y Reservas sobre la capa `shared/` ya validada. Torneos: pasada completa de paridad visual en React Native contra WEB — orden de bloques del detalle (info/portada/inscripciones/retiradas según estado), header con badge "En vivo" y visibilidad, tarjeta de info con el listado exacto de campos de WEB, botones de acción diferenciados por variante, clasificación/podio sin envoltorio de tarjeta, portada a 3:4, y texto de respaldo "Jugador" unificado. De paso, dos bugs reales de React Native corregidos y ahora codificados como convención (ver CLAUDE.md → Shared View & Data Patterns): `FlatList` vertical anidado dentro de `ScrollView` vertical en `PlayerCombobox`/`ReplaceMemberModal` (mismo patrón de raíz única ya usado en `PlayerTransferList`), y un bottom sheet (`RegisterEntryModal`) que renderizaba casi completamente fuera del viewport por un `maxHeight` porcentual contra un padre de alto ambiguo — corregido con una altura fija vía `useWindowDimensions()`. Reservas: encontrada y corregida una disparidad funcional real — la pestaña "Agenda" de OWNER/ADMIN en mobile abría el modal de *solicitud* de PLAYER (`create_reservation_player`) en vez de creación directa (`create_reservation_admin`) — y, en una auditoría más amplia de composición por rol, PLAYER veía la pestaña "Semana" (exclusiva de OWNER/ADMIN en WEB) y OWNER/ADMIN veía el selector de duración pre-filtro y el panel "Mis solicitudes"/"Mis reservas" (ambos exclusivos de PLAYER en WEB) — todo corregido por rol en `ReservationsListScreen.tsx`, sin tocar `shared/` ni backend. Quedan gaps reales sin construir en mobile (fuera de alcance de esta pasada): sin "Solicitudes pendientes" ni "Reservas rechazadas" para OWNER/ADMIN, sin poder tocar un slot ocupado ajeno en Agenda. Ver CLAUDE.md → Shared View & Data Patterns)
* Actualización anterior: 10 de agosto de 2026 (Segunda pasada de la capa `shared/`, ahora sobre Torneos: `shared/tournaments/{labels,sort,duration,tabs,entries,entryActions,candidates,classification,actions}.ts` es la única fuente de labels/orden/tabs/capacidad-clasificación/candidatos-elegibilidad/composición y reemplazo de duplas/transiciones de ciclo de vida/mensaje de WhatsApp para WEB y mobile por igual — antes varias de estas reglas vivían solo inline dentro de componentes de WEB (nunca exportadas) y reconstruidas a mano en mobile. La comparación literal contra el código real de WEB encontró y corrigió divergencias reales ya en producción en mobile: `pairLabel` con fallback distinto ("Sin nombre" vs. el real "Jugador"), y varias condiciones de `tournamentEntryErrorMessage` que no coincidían con los mensajes reales de las funciones SQL (caían siempre al genérico "Datos inválidos."). Mismo patrón de re-exports delgados que la pasada anterior sobre Reservaciones — ver esa entrada y CLAUDE.md → Shared View & Data Patterns.)
* Actualización anterior: 10 de agosto de 2026 (Capa `shared/` real entre WEB y la app mobile — prueba de concepto sobre Reservaciones: lógica TypeScript pura (queries parametrizadas por `SupabaseClient<Database>`, disponibilidad, precios, duraciones, elegibilidad de edición/cancelación de 2 horas, hora de Bogotá, tipos generados) movida a `shared/{types,utils,reservations}/` en la raíz del repo — una sola fuente real, nunca una segunda copia portada a mano en mobile. `src/lib/*.ts`/`mobile/src/lib/*.ts` quedan como re-exports delgados bajo los mismos nombres de siempre — ningún import existente cambió. `mobile/metro.config.js` (watchFolders) y `mobile/tsconfig.json` (paths) son lo mínimo que hizo falta para que Metro/tsc resuelvan `shared/` fuera de la raíz de mobile/. Ver CLAUDE.md → Shared View & Data Patterns)
* Actualización anterior: 5 de agosto de 2026 (Detalle de reserva compartido: URL corta con resolución segura por uuid o nombre+fecha/hora (con auto-corrección cuando el nombre del creador no se conoce aún al construir el enlace — el fallback anterior a un nombre inventado nunca resolvía, bug real corregido), acciones administrativas de OWNER/ADMIN (editar, cancelar, tiempo extra, aprobar/rechazar) reutilizadas del panel de Agenda, y acciones de PLAYER creador sobre su propia solicitud pendiente (cancelar/editar). Nuevo estado `expired` para solicitudes nunca aprobadas ni rechazadas antes de su horario, resuelto de forma perezosa (sin cron/Scheduler) vía `expire_pending_reservations`. Corregido un bug real de codificación Unicode en "Compartir por WhatsApp" (emojis/tildes llegaban como `�`) en reservas, noticias y torneos, cambiando `wa.me` por `api.whatsapp.com`. Además: rediseño del detalle administrativo de reservas a un diálogo centrado de dos columnas; Torneos ganó notificaciones de ciclo de vida completas (inscripción/confirmación/rechazo/retiro/reemplazo/inicio/cierre), un piso de 2 duplas mínimas y cuota de inscripción informativa, con mensaje de WhatsApp enriquecido (premios/cuota/duplas reales); exportación PNG de Ranking corregida de dos bloqueos indefinidos reales adicionales y extendida a PLAYER; SUPERADMIN puede cambiar el slug de cualquier club y generar un enlace de recuperación de contraseña para soporte. Ver Sprint 2 — Reservaciones, Módulo de Torneos, Módulo Deportivo — Ranking (Fase 2) y Panel de Plataforma (SUPERADMIN))
* Actualización anterior: 2 de agosto de 2026 (Panel de Plataforma SUPERADMIN construido de punta a punta: Entrega de Club — creación de un club "en espera" desde `/platform`, el SUPERADMIN recibe una fila OWNER real y temporal, link de reclamo de un solo uso, `claim_club` como handoff atómico y permanente; Acceso elevado — `effective_club_role`/`is_superadmin_club_access` permiten operar cualquier club activo ya reclamado sin crear membresía, con banner persistente "Administrando como SUPERADMIN"; Desactivar/Reactivar club (`clubs.is_active`, distinto y ortogonal a `archived_at`). Además: tiempo extra sobre una reserva confirmada (`add_reservation_extra_time`), ADMIN gana acceso a Configuración operativa (ubicación, horarios, duraciones, tarifas — Equipo y archivado del club siguen siendo solo-OWNER), archivado de torneos (`archive_tournament`/`restore_tournament`, ortogonal al `status` deportivo), mapa interactivo en Directorio de Clubes, y una serie de correcciones reales de columna ambigua (`42702`) en once funciones del módulo de Torneos — ver Módulo de Torneos → Lecciones permanentes y CLAUDE.md → Tournament Module Principles)
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

Corregido: el registro con intención de jugador ("Como jugador" en `RegisterMenu`) ahora pasa `next=/clubs` explícitamente en vez de depender del destino por defecto de `SignupForm` (`/clubs?welcome=1`), que renderiza el empty-state de onboarding OWNER ("crea tu primer club") — nunca debía verlo un signup con intención de jugador. `/clubs` gatea ese empty-state por `profiles.account_type !== 'PLAYER'` (server-side, nunca confiando en `?welcome=1` del cliente aunque se escriba a mano en la URL); una cuenta sin ninguna membresía activa y sin `account_type` de OWNER/ADMIN (ambos siempre implican una membresía activa real) ya no ve el CTA dual "Explorar / Crear mi club".

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
* Reutiliza `getClubPublicPageData` (misma fuente que la página pública) y `getPlayerReservations` (`src/lib/playerReservations.ts`, fuente compartida con la vista de Reservaciones del jugador y con el Dashboard) — nunca una segunda versión de esas queries
* Nunca redirige ni es el componente público (`ClubPublicView`): es una superficie exclusiva para miembros dentro del layout `(app)`, con sidebar, campana de notificaciones e identidad ya provistos ahí
* El nav del PLAYER (sidebar en desktop, tab bar en mobile) muestra cinco accesos, en este orden: Dashboard | *(nombre real del club, ícono pelota de tenis)* | Reservaciones | Ranking | *(Torneos, ícono raqueta)* — el ítem del club apunta exactamente a esta ruta
* **Noticias recientes** y las nuevas secciones **Torneos activos**/**Torneos finalizados** (bucketing vía `partitionPlayerTournaments`, ver Módulo de Torneos) se muestran como carruseles horizontales compactos únicamente en el breakpoint mobile de WEB (`sm:hidden`/clases responsive) — el layout de escritorio no cambió: Noticias sigue siendo el grid de 3 columnas de siempre, Torneos no existía y sigue sin mostrarse en escritorio
* **Galería** se extrajo de `ClubInfoSections` a su propio componente (`ClubGallerySection`, misma imagen/lightbox/comportamiento) y se reubicó entre Noticias y Torneos como separador visual — una sola instancia, nunca duplicada
* Equivalente móvil real en `ClubHomeScreen.tsx` (antes un placeholder) — ver App Móvil (React Native / Expo) → "Página del club" para el detalle completo, incluido un mapa real de ubicación (`react-native-maps`) que iguala al mapa de Leaflet que WEB ya tenía (`ClubInfoSections`/`LocationMap`)

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

**Detalle de reserva compartido (`/[club]/reservations/[reservationId]`):**

* URL corta y legible (`{nombre-del-creador}-{YYYYMMDDHHmm}`), resuelta server-side por uuid embebido o por `resolve_reservation_slug` (club + fecha/hora + nombre normalizado, sin ambigüedad — 0 o más de una coincidencia nunca resuelve). Cuando el nombre real del creador no se conoce aún al construir el enlace (tarjeta de calendario, "Mis solicitudes"), el slug incrusta el uuid real en vez de un nombre inventado — un placeholder nunca puede matchear, y así lo hacía antes: bug real confirmado contra la base de datos (`reserva-YYYYMMDDHHmm` sin uuid quedaba en 404 permanente). La página siempre se autocorrige al slug legible en cuanto carga el nombre real
* Botones "WhatsApp"/"Copiar enlace" (`ReservationShareActions`, un solo componente reutilizado en el detalle, el panel de Agenda y las tarjetas de "Mis reservas"), con mensaje generado por una única función (`buildReservationShareMessage`): fecha/hora en español, cancha, club, creador, cupos disponibles o categoría cuando la reserva está abierta. Corregido un bug real de codificación Unicode (emojis/tildes llegaban como `�`): la codificación en sí ya era correcta (`encodeURIComponent` una sola vez), la causa era el dominio `wa.me`, cuyo redirect decodifica UTF-8 de forma inconsistente en algunos clientes — cambiado a `api.whatsapp.com/send`
* El detalle adapta sus acciones por rol y relación con la reserva, nunca duplicando lógica: OWNER/ADMIN obtienen el mismo conjunto de acciones administrativas del panel de Agenda (editar, cancelar, agregar tiempo extra, aprobar/rechazar una solicitud original pendiente), reutilizando exactamente las mismas Server Actions (`useReservationJoinManagement`, hook compartido entre ambas superficies para abrir/cerrar y gestionar solicitudes para unirse); el creador PLAYER de una solicitud pendiente propia obtiene cancelar/editar (misma regla de 2 horas y misma Server Action que "Mis solicitudes")
* Layout de dos columnas: izquierda el horario completo (estado, participación, cancha, fecha, hora, duración, valor), derecha un único bloque (creador, jugadores cuando hay alguien más allá de él, cupo, control de solicitudes, compartir) en vez de varias tarjetas pequeñas desconectadas
* Ahora también accesible para una solicitud **pendiente** (antes solo confirmada) desde el calendario del jugador y desde "Mis solicitudes" — el RPC de detalle nunca filtró por status, el hueco era puramente de navegación en el frontend

**Solicitudes expiradas (`expired`):**

* Nueva función SQL central `expire_pending_reservations(p_club_id)`: marca `expired` toda solicitud `pending` cuyo horario de inicio ya pasó (`date + start_time` interpretado como America/Bogota) y notifica una sola vez a su creador ("Solicitud de reserva expirada" / "Tu solicitud no fue aprobada por el club antes del horario programado.") — idempotente por construcción, sin cron/Scheduler/Edge Function: la misma condición `status = 'pending'` que hace la transición impide que una llamada posterior vuelva a notificar
* `approve_pending_reservation` y `get_reservation_share_detail` la invocan internamente antes de decidir o mostrar nada — una solicitud expirada nunca puede aprobarse después; los listados de pendientes (calendario del jugador, panel de Agenda, revisión dedicada de OWNER/ADMIN, "Mis solicitudes") la llaman antes de su propio `SELECT`
* Badge "Expirada" propio (distinto de "Rechazada" y "Cancelada") en "Mis solicitudes", el detalle compartido y la revisión dedicada de OWNER/ADMIN — sin acciones de editar/cancelar/aprobar/rechazar, solo consulta de qué ocurrió
* Validado contra la base enlazada con datos reales: pendiente futura permanece `pending`; pendiente vencida cambia a `expired`; múltiples llamadas no generan notificaciones duplicadas; `approve_pending_reservation` sobre una ya expirada devuelve `22023`; reservas `confirmed`, sin importar cuán en el pasado esté su horario, nunca se tocan

**Rediseño del panel administrativo de Agenda:**

* `ReservationTicketPanel` cambió de un slide-over lateral a un diálogo centrado (~860px, tope 90dvh en desktop, pantalla completa en mobile) — mismas Server Actions/`ReservationForm`, mismas capacidades de crear/editar/aprobar/rechazar/cancelar, nunca un segundo sistema
* Nuevo `DetailCard`, agrupa filas relacionadas en bloques visuales de dos columnas (Estado/Cancha/Fecha/Hora de un lado, Cobro/Origen del otro) en vez de una lista vertical larga; acciones del footer reubicadas a un pie fijo, siempre alcanzables sin importar la altura del contenido

**Edición ampliada de reservas OWNER/ADMIN + política por estado temporal:**

* OWNER/ADMIN puede editar tipo, título, notas y jugadores de una reserva, además de cancha/fecha/hora/duración (alcance original del MVP) — vía `update_reservation_admin` (SECURITY DEFINER, nueva RPC separada), nunca la RPC PLAYER (`update_reservation`, sin tocar). El listado de jugadores se sincroniza contra `reservation_players` con diff real (agregar/quitar solo lo que cambió) mediante `syncReservationPlayers` (`shared/reservations/playerSync.ts`); un jugador recién agregado se notifica igual que en la creación
* Nueva política compartida por estado temporal — `getReservationAdminEditPolicy`/`getReservationAdminEditPolicyNow` (`shared/reservations/editPolicy.ts`), evaluada siempre contra la hora real de Bogotá (`getBogotaNow()`, nunca `new Date()` crudo): futura/en curso sin restricciones nuevas; pasada (ya terminó) congela cancha/fecha/hora/duración/tipo — solo título, notas y jugadores siguen editables — y oculta abrir/cerrar, cancelar, agregar tiempo extra y gestionar solicitudes de unión, ninguna de las cuales tiene sentido sobre algo que ya ocurrió
* Aplicada de forma idéntica en `ReservationForm`/`ReservationTicketPanel`/`ReservationShareView` (WEB) y `WeekReservationModal`/`ReservationTicketPanel` (mobile) — los campos deshabilitados en UI son solo cortesía; `update_reservation_admin` re-valida la misma regla server-side y rechaza un cambio de campo restringido sobre una reserva pasada con un código propio (`P0006`, mensaje ya en español)
* Ver CLAUDE.md → Reservation Editing & Cancellation Principles

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

**Problema conocido, sin resolver:** Onboarding Step 2 (Ubicación) — se investigó una navegación hacia atrás inesperada del wizard (hipótesis inicial: un swipe de trackpad sobre el mapa de Leaflet burbujeando como gesto nativo de "volver" del navegador; el fix de `overscroll-contain` aplicado para esa hipótesis fue revertido por insuficiente) y una posible falla silenciosa al guardar visibilidad/descripción del club — ninguna causa raíz fue confirmada. Queda logging de depuración temporal en el código (`[WIZARD-DEBUG]` en `OnboardingWizard.tsx`/`LocationMap.tsx`/`Step2Location.tsx`, `[VISIBILITY-DEBUG]` en `onboarding/actions.ts`) — limpiar una vez diagnosticado, no confundir con instrumentación permanente.

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

✅ MVP funcional — UI administrativa completa del Ranking, Ranking público según visibilidad del club, medallas/badges deportivos unificados en toda superficie relevante, exportación visual (PNG) del Ranking en WEB, y paridad completa en la app móvil para PLAYER (ver "Ranking en Mobile" más abajo). `20260920000001` se documentó en su momento como pendiente de aplicación manual; dado que decenas de migraciones posteriores (incluida toda la saga de Torneos y el Panel de Plataforma SUPERADMIN) ya están confirmadas corriendo en vivo, se asume aplicada — no queda ninguna evidencia de que siga pendiente, pero no se ha vuelto a verificar directamente contra la base de datos.

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

## Rediseño del podio y correcciones adicionales (Bloques 3.6–3.10)

Ver también CLAUDE.md → Sports Data Export Principles, ya actualizado con las reglas permanentes de este bloque.

* **Rediseño "póster deportivo" (3.6)**: posiciones 1-3 ahora se renderizan como un podio real (avatares grandes, bloques de color elevados, paleta de medalla fija — ámbar/plata/bronce, deliberadamente independiente del color de marca del club, ver Club Identity Principles); 4-10 se movieron a una lista compacta de 2 columnas debajo. Mismos datos/orden que antes (`RankingShareRow` sin cambios) — puramente visual
* **Segundo bloqueo indefinido real, distinto del de Bloque 3.5 (3.7)**: incluso con `skipFonts: true`, la generación podía volver a colgarse con el podio más pesado — causa raíz confirmada reproduciendo `toBlob()`/`toCanvas()` en Chrome headless con avatares reales: ambas dependen internamente de `createImage()`, que encadena `img.decode()` sin `.catch()` y luego `requestAnimationFrame` sin timeout — cualquiera de los dos podía no resolver nunca. Corregido eliminando `toBlob()`/`toCanvas()` por completo: `exportCardToPngBlob` ahora solo usa `toSvg()` (nunca toca `decode()`/rAF) y rasteriza el SVG resultante a mano vía un `<img>` con `onload`/`onerror` explícitos y timeout propio de 8s
* **Bug de fuente incorrecta (3.8)**: con `skipFonts: true`, las tarjetas exportadas usaban silenciosamente la fuente de sistema en vez de la real de la app (Geist) — confirmado inspeccionando el SVG exportado, que no llevaba ninguna regla `@font-face`. Corregido llamando `getFontEmbedCSS(node, {})` una sola vez (timeout propio de 4s), pasando el resultado a `toSvg` vía `fontEmbedCSS`; degrada a `skipFonts: true` sin bloquear la generación si esa llamada es lenta o falla
* **Acceso extendido a PLAYER (3.9)**: `canShareRanking = !readOnly && (isAdmin || role === "PLAYER")` — sigue sin mostrarse jamás en la ruta pública de solo lectura, pero deja de ser exclusivo de OWNER/ADMIN
* **Avatares faltantes en mobile, posiciones 4-10 (3.10)**: reportado por un PLAYER real en Chrome iOS, nunca reproducido en desktop/wifi — causa raíz: hasta 11 descargas de imagen (logo + 10 avatares) disparadas en un solo `Promise.all` sin límite; en redes móviles compiten por ancho de banda y el podio (encolado primero) siempre terminaba a tiempo, pero 4-10 degradaban a iniciales por pura contención, indistinguible de una imagen rota. Corregido con un pool de concurrencia acotado (`AVATAR_FETCH_CONCURRENCY = 4`) en `resolveImageDataUrls`, preservando el orden de salida; timeout por imagen ampliado de 6s a 8s de paso
* **Flujo de compartir rediseñado**: "Compartir" → "Compartir por WhatsApp" → finalmente "Compartir imagen" — en un dispositivo con soporte de compartir archivos nativo (`canShareImageFile()`) adjunta el PNG real vía la hoja de compartir del sistema; en desktop/sin soporte, descarga el PNG automáticamente y abre WhatsApp Web con un mensaje de solo texto (el archivo no puede adjuntarse vía enlace de WhatsApp) — `window.open()` siempre síncrono, antes de cualquier `await`, para preservar el gesto de clic y evitar el bloqueador de pop-ups

## Ranking en Mobile

* `RankingScreen.tsx` — equivalente nativo real de `RankingView.tsx`, PLAYER-only (el `RankingTab` de OWNER/ADMIN en mobile sigue siendo `PlaceholderScreen`, sin cambios). Mismas RPCs exactas (`get_club_category_ranking_view`, `get_club_member_sport_state`), mismo cálculo de categoría inicial (propia del jugador → `default_player_category` del club → primera del catálogo), selector de categoría (modal simple, mismo patrón ya usado en Jugadores), tarjeta "Tu posición", listado completo con "Tú" marcado
* Podio Top 3 alineado con `TournamentPodium.tsx` (mobile): un solo pedestal por lugar (nunca "card + base separada"), altura variable 104/72/56 por lugar, fila alineada por el borde inferior, columnas parejas — la jerarquía viene de la altura/tamaño, nunca del ancho. A diferencia de Torneos (tinte ámbar único), Ranking conserva sus propios colores oro/plata/bronce por lugar, porque cada posición es un jugador individual, no una dupla. El avatar quedaba pegado al borde izquierdo de su pedestal (`PlayerSportAvatar` fija `alignSelf:"flex-start"`, pensado para filas horizontales) — corregido envolviéndolo en un `View` local sin ancho propio, sin tocar el componente compartido
* `computeRankingPresentation`/`buildRankingWhatsappMessage` extraídas a `shared/players/ranking.ts` — antes vivían solo inline dentro de `RankingView.tsx`; WEB ahora también las consume, una sola fuente para ambas plataformas
* "Compartir Ranking" reutiliza `ShareActions` (WhatsApp vía `api.whatsapp.com/send` + copiar enlace, ya usado en Reservaciones) con el mismo mensaje exacto que WEB — sin la exportación PNG, ver Sports Data Export Principles en CLAUDE.md
* No permite abrir el detalle de un jugador desde el podio/listado — WEB tampoco lo permite para PLAYER (`isAdmin`-only), así que no hay ningún subflujo que replicar

Pendiente:

* Confirmar de forma directa contra la base de datos que `20260920000001_public_club_ranking_read.sql` está aplicada (ver nota de estado más arriba)
* Badges de categoría en Reservas (evaluado, no implementado — ver arriba)
* Verificación visual real de la tarjeta exportable en dispositivo/navegador (validado por código y build, no por captura observada)
* **Hallazgo sin corregir**: `ShareCardModal.tsx` (usado por `RankingExportButton`) todavía construye el link de WhatsApp con `wa.me/?text=` en vez de `api.whatsapp.com/send?text=` — contradice directamente CLAUDE.md → WhatsApp Share Principles ("bug real, ya corregido en reservas/noticias/torneos"). Encontrado durante el port de Ranking a mobile, no corregido en esa pasada por ser un componente compartido (también usado por exportaciones futuras) fuera del alcance pedido — queda para una ronda dedicada

---

# Módulo de Torneos

Estado:

✅ Completo de punta a punta sobre el modelo actual (evento de club + inscripciones + clasificación por puntos, sin bracket), incluidas notificaciones de ciclo de vida completas. Ver CLAUDE.md → Tournament Module Principles para las reglas de arquitectura permanentes. Este apartado documenta el detalle de lo construido.

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
supabase/migrations/20261027000001_tournament_lifecycle_notifications.sql (notificaciones de ciclo de vida completas — ver más abajo; corrigió, de paso, la misma ambigüedad de columna en `confirm_tournament_entry`/`reject_tournament_entry`/`replace_tournament_entry_member`/`finalize_tournament`, cuyos cuerpos ya se estaban reescribiendo)
supabase/migrations/20261028000001_tournament_min_max_pairs_two.sql (piso de 2 duplas mínimas)
supabase/migrations/20261029000001_tournament_entry_fee.sql (cuota de inscripción informativa)
```

**Nota sobre aplicación manual**: `20260919000001` y `20260921000001` escriben/modifican funciones que la propia reconstrucción del núcleo (`20260922000001`) ya elimina (`DROP FUNCTION IF EXISTS`) — aplicarlas nunca tuvo efecto útil y pueden omitirse sin riesgo; el `IF EXISTS` del DROP posterior las neutraliza igual si se aplican en orden. Todo lo demás en esta lista está confirmado corriendo en vivo — varias de las correcciones de columna ambigua se diagnosticaron precisamente reproduciendo el error real (`42702`) contra la base de datos de producción/staging.

## Modelo de datos (post-reconstrucción)

* `tournaments`: `name`, `description`, `category` (superior o única), `secondary_category` (inferior, `NULL` = categoría única), `max_pairs` (cupo máximo de duplas — cualquier entero ≥ 2, ya no una potencia de 2 ni un mínimo de 1), `status` (`draft` → `registration_open` → `registration_closed` → `in_progress` → `completed`, o `cancelled` desde cualquiera de los tres primeros; `registration_closed` → `registration_open` también permitido — reapertura), `started_at`/`started_by` (poblados al iniciar, junto a los ya existentes `completed_at`/`completed_by`, `cancelled_at`/`cancelled_by`), `visibility` (`public`/`private`), `slug` (único por club, URL legible), `estimated_duration_minutes` (reemplaza `ends_at`), `prize_description`, `entry_fee_amount` (entero COP `>= 0`, default 0 — puramente informativo, sin cobro ni procesamiento de pago en ningún punto del módulo), `cover_image_url`
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

## Notificaciones de ciclo de vida (`20261027000001`)

Cierra el gap "ninguna RPC de Torneos generaba notificaciones" — mismo patrón ya usado por solicitudes de ingreso/reserva: inserción directa en `notifications`, en la misma transacción, `SECURITY DEFINER`, nunca un mecanismo paralelo. Tres helpers privados nuevos (`_`, `REVOKE ALL FROM PUBLIC`, nunca otorgados a `authenticated`): `_notify_club_admins` (OWNER/ADMIN activos del club), `_notify_eligible_tournament_players` (jugadores activos cuya categoría real coincide con `category`/`secondary_category` — reutiliza exactamente el mismo join de elegibilidad que ya valida `register_tournament_entry`, nunca una segunda fórmula), `_notify_tournament_entry_players` (los dos integrantes de una pareja, con exclusión opcional del propio actor en un retiro voluntario).

Tipos: `tournament_registration_open` (abrir o reabrir), `tournament_entry_created` (inscripción `pending`, notifica a admins), `tournament_entry_confirmed` (confirmación directa o explícita, notifica a la pareja), `tournament_entry_rejected` (rechazo manual o automático por cupo lleno), `tournament_entry_withdrawn`, `tournament_entry_member_replaced` (3 variantes: saliente/entrante/compañero), `tournament_started`, `tournament_completed`. Sin mecanismo de idempotencia nuevo: cada notificación vive justo después de un compare-and-swap (`UPDATE ... WHERE status = <esperado>` + `GET DIAGNOSTICS`/`RAISE`) que ya existía — un reintento nunca llega a la línea de notificar, falla antes en el guard existente.

## Lecciones permanentes (capturadas en CLAUDE.md → Tournament Module Principles)

Dos clases de bug real, ya corregidas, siguen siendo relevantes para cualquier función nueva del módulo: (1) cualquier `RETURN QUERY SELECT (row).*` debe mantenerse en sincronía manual con el esquema real de la tabla — una discordancia de aridad tras agregar una columna solo se detecta en tiempo de ejecución; (2) cualquier referencia a columna sin calificar (en un `WHERE`, una subconsulta, o un `RETURNING`) dentro de una función cuyo `RETURNS TABLE` comparte nombre de columna con una tabla leída o escrita en el cuerpo (p. ej. `id`, `club_id`, `status`) es ambigua (`42702`) y también solo se detecta en tiempo de ejecución — cualquier sentencia de este tipo debe alias la tabla explícitamente.

**Historial real de (2), no hipotético**: el bypass de acceso elevado SUPERADMIN agregado en `20261008000001` (ver Panel de Plataforma (SUPERADMIN)) introdujo exactamente este bug — una subconsulta `NOT EXISTS` sin alias sobre `club_members` — en prácticamente todas las funciones de ciclo de vida del módulo. Se fue encontrando y corrigiendo función por función, nunca de una sola pasada: `create_tournament` (`20261013000001`), `open_tournament_registration` (`20261014000001`), `close_tournament_registration` (`20261015000001`), `register_tournament_entry` (`20261016000001`), `cancel_tournament` (`20261017000001`), `start_tournament` (`20261018000001`), `set_tournament_entry_points` (`20261019000001`), `update_tournament`/`reopen_tournament_registration`/`update_tournament_cover_image` (`20261021000001`, encontradas de paso durante un sync de `RETURNS TABLE` no relacionado), `withdraw_tournament_entry` (`20261022000001`, encontrada diagnosticando un reporte real de un PLAYER que no podía retirar su dupla). `close_tournament_registration` volvió a fallar después de ya corregida, esta vez por una columna distinta (`status`, en el conteo de duplas confirmadas agregado por `20261015000001`) — corregido en `20261023000001` tras diagnosticar un reporte real de un OWNER. Lección operativa además de la técnica: cuando un patrón de bug se confirma en una función, auditar activamente las funciones hermanas que comparten el mismo patrón recién introducido, en vez de esperar a que cada una falle en producción una por una.

## Estado temporal para PLAYER (`registration_open` vencido)

Ver también CLAUDE.md → Tournament Module Principles, ya actualizado con la regla permanente.

* El MVP no tiene cron/scheduler — un torneo `registration_open` cuyo `registration_closes_at`/`starts_at` ya pasó se queda con ese `status` en la base de datos indefinidamente hasta que un OWNER/ADMIN actúe. Reportado como bug real: un PLAYER veía "Inscripciones abiertas" (badge, "Próxima actividad", "Mis torneos") sobre un torneo que ya no podía aceptar inscripciones
* `effectivePlayerTournamentStatus`/`isRegistrationTemporallyOpen`/`hasTournamentStarted` (`shared/tournaments/actions.ts`) son ahora la única fuente para lo que ve un PLAYER — un `registration_open` vencido se presenta como `registration_closed`, nunca se escribe de vuelta a la base de datos. Aplicado de forma consistente en `EntriesSection` (CTA "Inscribirme"), `TournamentDetailView`/`TournamentDetailScreen` (badge), `TournamentsGrid`/`TournamentsScreen` (listado), `MyTournamentsSection`, `UpcomingActivityCard` — WEB y mobile por igual
* `register_tournament_entry` gana el mismo chequeo server-side, la autoridad real — migración nueva (`20261108000001_tournament_registration_temporal_close.sql`), **pendiente de aplicar manualmente** (no hay forma de correr migraciones desde el entorno de desarrollo actual)
* OWNER/ADMIN nunca pasa por esta función — sus badges/acciones siguen leyendo el `status` real sin cambios, ya que son quienes lo transicionan

## UI — Administración

* Navegación: ítem "Torneos" (ícono `Swords`) para OWNER/ADMIN en sidebar/tab-bar-secundario, y para PLAYER en su propia navegación
* Ruta canónica única para los tres roles: `/[club]/tournaments/[tournamentSlug]` (`TournamentDetailView`, compartida — lo único que cambia por rol son las acciones administrativas, nunca el layout); `/[club]/admin/tournaments/[tournamentId]` (antigua) y cualquier enlace histórico basado en UUID redirigen a la URL canónica con slug
* Creación/edición: `TournamentForm` compartido, categoría principal + secundaria opcional, campos de fecha `datetime-local` convertidos a UTC vía `src/lib/utils/bogotaDatetime.ts`; `max_pairs` exige mínimo 2 duplas (cliente y servidor); `prize_description` arranca con una plantilla editable ("🥇 1er lugar:\n🥈 2do lugar:") solo al crear, nunca sobrescrita si el usuario la edita/limpia, y siempre el valor real guardado al editar
* Transiciones (abrir/cerrar/reabrir inscripciones, iniciar, cancelar) con `ConfirmDialog`, gateadas por el estado real, nunca adivinado
* "Compartir por WhatsApp" (`buildWhatsappShareMessage`) ahora arma un resumen completo según el estado real (`registration_open`/`registration_closed`/`in_progress`): copy distinto para inscripciones abiertas vs. en curso, descripción, premios, cuota (formateada o "Gratis"), y duplas registradas (con puntos en vivo si `in_progress`) tomadas de la misma `computeTournamentClassification` ya usada en el resto del componente, nunca una consulta paralela. Corregido el mismo bug real de codificación Unicode que reservas/noticias — `wa.me` cambiado por `api.whatsapp.com/send`, sin tocar el mensaje

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

* `TournamentNewsAction`, visible solo para OWNER/ADMIN con el torneo `completed`: "Generar noticia" abre el modal real de creación de Noticias (`CreateNewsModal`/`NewsForm`, nunca un segundo formulario) con título/contenido prellenados por `buildTournamentNewsDraft` (`tournamentNewsDraft.ts`) — derivado exclusivamente de la clasificación real (`computeTournamentClassification`), nunca inventa datos, ahora incluye además un bloque "🏆 Premios otorgados" con el `prize_description` real del torneo verbatim — y la portada del torneo como imagen inicial (editable/reemplazable como cualquier otra)
* La asociación noticia↔torneo es real y trazada: `club_news.tournament_id`, con índice único parcial que garantiza como máximo una noticia por torneo a nivel de base de datos (no solo una validación de aplicación) — una vez publicada, la acción cambia a "Ver noticia". Esta limitación (antes documentada como gap abierto) queda **resuelta**
* Esta acción es una superficie lateral OWNER/ADMIN-only — PLAYER y visitantes nunca la ven, pero la noticia publicada es completamente visible para todos bajo las reglas normales de Noticias, sin distinción por su origen

## Noticias — URLs legibles, metadata social y avatares de campeones

* `club_news.slug` (único por club, `UNIQUE(club_id, slug)`), generado con el mismo helper de slugificación que ya usa `tournaments` (`_slugify_tournament_name`, nunca duplicado); backfill de noticias existentes con resolución de colisión por fecha de publicación y sufijo incremental
* `create_club_news` (RPC nueva, reemplaza el `INSERT` directo desde el cliente que hacía `createNews`): valida rol, campos, y (cuando aplica) que el torneo exista, pertenezca al mismo club y esté `completed`; genera el slug con reintento real ante colisión (mismo patrón `INSERT`-retry ya establecido por `create_tournament`). Corrección real de columna ambigua (`20261030000001_fix_create_club_news_ambiguous_columns.sql`, misma clase documentada en CLAUDE.md → Tournament Module Principles, encontrada de forma proactiva antes de disparar en producción): `club_id` en la subconsulta de fallback SUPERADMIN y `tournament_id` en el chequeo de "ya tiene noticia publicada", ambas sin alias contra las propias columnas de salida de la función
* `newsDetailPath(clubSlug, newsSlug)` (`src/lib/newsPaths.ts`): único constructor de URL de noticia reutilizado en todos los puntos de enlace (tarjetas admin/públicas, `TournamentNewsAction`, la propia página de detalle). Un enlace histórico basado en UUID se resuelve por `id` y redirige de inmediato a la URL canónica con slug
* `generateMetadata` real (Open Graph/Twitter card: título/descripción/imagen) en el detalle de una noticia — descripción construida por `buildNewsDescription()` (colapsa espacios, trunca en límite de palabra ≤200 caracteres); afecta solo las etiquetas meta, nunca el contenido almacenado/mostrado (`news.content` sigue siendo `whitespace-pre-line` sin cambios)
* `NewsTournamentChampions`: en el detalle de una noticia con `tournament_id`, muestra a los campeones reales (posición 1 de `computeTournamentClassification`, con soporte de empate) — un avatar (`PlayerSportAvatar`) + nombre por jugador, nunca inventado ni aproximado por título/contenido
* "Compartir por WhatsApp" (`ShareNewsButtons.tsx`) corregido del mismo bug real de codificación Unicode que reservas y torneos — cambiado `wa.me` por `api.whatsapp.com/send`, sin tocar el mensaje ni el resto del botón

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

## Cambiar slug de un club

* `platform_update_club_slug(p_club_id, p_slug)` — SUPERADMIN-only, `/platform/clubs/[clubId]` (`ChangeSlugButton.tsx`). Toca únicamente `clubs.slug`; nunca el owner, la membresía, la configuración ni `is_active`. Reutiliza el mismo `SLUG_REGEX`/`RESERVED_SLUGS` (`src/lib/clubSlugs.ts`) que ya valida la creación de club. El slug anterior nunca redirige — queda disponible de inmediato para reutilizarse; la seguridad ante condición de carrera viene de la restricción `UNIQUE` ya existente (`clubs_slug_key`), no de un lock nuevo

## Herramientas de soporte para usuarios

* Nueva acción en `/platform/users/[userId]`: "Generar enlace de recuperación" (`generatePasswordRecoveryLink`, Supabase Admin API `generateLink({type:"recovery"})`) — nunca envía un correo, solo devuelve el enlace crudo para que soporte lo comparta manualmente (p. ej. por WhatsApp); mostrado en `RecoveryLinkModal` con copiar-al-portapapeles, nunca persistido en ningún lado (ni servidor ni cliente más allá del estado en memoria del modal abierto). Coexiste con la acción ya existente "Enviar recuperación" (que sí envía el correo) — mismo flujo de reset subyacente en ambos casos, nunca uno paralelo

**Correcciones reales de columna ambigua, misma clase documentada en CLAUDE.md → Tournament Module Principles, encontradas fuera del módulo de Torneos**: `create_club_with_owner` (`20261025000001`, `[42702] column reference "id" is ambiguous` al hacer clic en "Crear otro club" — dos referencias `WHERE id = auth.uid()` sin calificar contra `profiles.id`, ambiguas contra el propio `RETURNS TABLE (id uuid, ...)` de la función) y `create_club_news` (ver Módulo de Torneos → Noticias, encontrada de forma proactiva). `platform_update_club_slug` documenta explícitamente en su propia migración que alias cada referencia (`c.id`/`c.slug`) para evitar repetir el mismo bug — evidencia de que la disciplina ya se aplica por convención.

**Incidente real corregido, RLS `anon`**: `clubs_select_superadmin` (agregada en `20261008000001`) quedó sin `TO authenticated`, por lo que por defecto aplicaba también a `anon` — como `anon` nunca tuvo `EXECUTE` sobre `is_superadmin_club_access`, cualquier request anónimo evaluando esta política lanzaba un `42501` que reventaba la consulta completa (no solo esa cláusula del `OR`). Como la página pública del club solo desestructura `data`, el error silenciado aparecía como `clubData: null` → `notFound()` — un 404 de "el club no existe" indistinguible del real, más visible en el propio club de un SUPERADMIN. Corregido en `20261024000001_fix_superadmin_club_policy_anon_scope.sql`, alcance `TO authenticated` para igualar a su política hermana `clubs_select_own_member`.

---

# App Móvil (React Native / Expo)

Estado: 🚧 En desarrollo activo — no es un prototipo, es la misma plataforma sobre el mismo backend/RLS, reutilizando toda la lógica pura de negocio ya validada en WEB vía `shared/` (ver CLAUDE.md → Shared View & Data Patterns). Stack: Expo 54, React Navigation v7 (`bottom-tabs` + `native-stack`), Supabase JS. Sin URLs — la navegación es por tabs/stacks nativos.

## Navegación

`AppTabs.tsx` ramifica en dos navegadores completamente separados según `useClub().role` — nunca un único navegador compartido con gates internos (ver más abajo por qué):

* **OWNER/ADMIN** (`OwnerAdminTabs`, sin cambios en esta ronda): Inicio | Jugadores | Reservas | Torneos | Ranking | Club — mismo orden/íconos que `AppNav.tsx` en WEB. Ranking y Club siguen siendo `PlaceholderScreen` para este rol
* **PLAYER** (`PlayerTabs`): Dashboard | *(nombre real del club, ícono pelota de tenis)* | Reservaciones | Ranking | Torneos — mismo orden que `PLAYER_TAB_BAR_LABELS` en `AppNav.tsx`. El ítem del club usa `club.name` real (ya cargado en contexto, sin query nueva) en vez de un texto fijo, y el ícono de Torneos usa una raqueta (`tennis-racket`, `@lucide/lab`) en vez del ícono de espadas cruzadas que antes compartía con OWNER/ADMIN

**Incidente real corregido, no solo cosmético**: hasta esta ronda, el `RankingTab`/`ClubTab`/`PlayersTab` de PLAYER eran literalmente los mismos de OWNER/ADMIN, sin ningún guard de rol — un PLAYER podía abrir la pantalla "Jugadores" (roster administrativo completo: estado activo/inactivo, categoría, puntos, y el número de WhatsApp de cualquier otro miembro del club vía "Contactar por WhatsApp"), una violación real de CLAUDE.md → Player Contact Principles/Privacy Principles. Quitar ese tab para PLAYER no fue "ocultar una función temporalmente" — WEB nunca expuso "Jugadores" a PLAYER tampoco (`getNavItems` solo lo agrega para OWNER/ADMIN), así que no había nada que reubicar. Ver CLAUDE.md → Shared View & Data Patterns para la regla permanente que deja esto documentado.

## Qué está portado, por módulo

* **Dashboard PLAYER** (`HomeScreen` → `PlayerDashboardScreen`) — paridad completa con `/[club]/dashboard` (encabezado deportivo, próxima actividad, evolución, resumen, mis torneos, logros, actividad reciente)
* **Reservaciones** — Agenda + Semana, ticket panel, solicitudes pendientes/rechazadas, tiempo extra, detalle compartido; ver Sprint 2 para el detalle completo ya construido en rondas anteriores
* **Torneos** — detalle, inscripciones, clasificación en vivo, podio con confetti; **gap conocido, no corregido en esta pasada**: `TournamentsScreen.tsx` (el listado, no el detalle) sigue mostrando los 7 tabs y el botón "Crear torneo" de OWNER/ADMIN a cualquier rol que entre — a diferencia del resto de la navegación, que ya está correctamente gateada por rol
* **Página del club** (`ClubHomeScreen`, dentro del tab del nombre del club) — antes un placeholder, ahora paridad real con `/[club]/home`: portada + logo superpuesto + nombre + ciudad + indicador público/privado + descripción, "Mis próximas reservas"/"Mis solicitudes", noticias recientes (con detalle real, `NewsDetailScreen`), mapa real de ubicación (`react-native-maps`) + "Cómo llegar", horarios/instalaciones, contacto, galería (tocable, `ImagePreviewModal`), y nuevas secciones "Torneos activos"/"Torneos finalizados". Noticias/Torneos/Galería como carruseles horizontales compactos (~44% de ancho de card) para que la pantalla no crezca sin fin — mismo tratamiento aplicado también al breakpoint mobile de WEB, sin tocar su layout de escritorio
  * Diferencias deliberadas respecto a WEB, no gaps por descuido: sin lightbox de galería con navegación entre fotos (mínimo viable: tocar una foto la abre en grande, cerrar vuelve a la misma posición); sin la página completa "Ver todas las noticias" (`/clubs/[slug]/news`, un módulo aparte); el detalle de noticia no incluye el bloque de campeones de torneo asociado ni los botones de compartir
* **Ranking** — ver Módulo Deportivo — Ranking (Fase 2) → "Ranking en Mobile" para el detalle completo. PLAYER-only; OWNER/ADMIN sigue en `PlaceholderScreen`

## Dependencias nativas agregadas esta ronda

* `react-native-maps@1.20.1` (`npx expo install`, versión que Expo 54 empaqueta) — confirmado "Included in Expo Go" en la documentación oficial antes de instalarse, sin API key ni config plugin necesarios para desarrollo/testing (solo haría falta para un binario real de tienda a futuro)
* `@lucide/lab@0.2.0` — íconos fuera del set core de lucide (`tennis-ball`, `tennis-racket`), consumidos vía `createLucideIcon(nombre, iconNode)` en ambas plataformas, mismo lenguaje visual que cualquier ícono core

## Pendiente / gaps conocidos

* `TournamentsScreen.tsx` sin gate de rol real (ver arriba)
* Ranking/Club siguen sin implementar para OWNER/ADMIN en mobile
* Lightbox de galería con navegación multi-foto (Página del club) — mínimo viable implementado, no la experiencia completa de WEB
* Validación visual en dispositivo real pendiente para todo lo construido en esta ronda (mapa, podio, carruseles, hero) — verificado por `tsc`/lint/build, nunca por captura observada en un simulador o dispositivo real

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
* Torneos de eliminación directa por club ya están completos de punta a punta — inscripción de parejas, clasificación por puntos, cierre, noticia asistida y notificaciones de ciclo de vida (ver Módulo de Torneos)
* Clínicas
* Ladder
* Comunidad
* Pagos

La app móvil ya no es una funcionalidad futura — es parte activa del producto (ver App Móvil (React Native / Expo) para su estado, navegación y gaps conocidos).

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

El módulo deportivo (ranking por categoría, con su UI administrativa/pública y exportaciones), el módulo de Torneos (de punta a punta sobre el modelo actual — inscripciones, duplas, clasificación por puntos, cierre, noticia asistida y notificaciones de ciclo de vida completas; sin cuadro/scheduling, retirados en la reconstrucción del núcleo), el Panel de Plataforma SUPERADMIN (Entrega de Club, acceso elevado, desactivar/reactivar, cambiar slug, herramientas de soporte) y el detalle de reserva compartido (URL corta, acciones por rol, estado `expired`) ya están construidos. La nota histórica sobre `20260919000001`/`20260920000001`/`20260921000001` como "pendientes de aplicar" quedó obsoleta — más de 20 migraciones posteriores están confirmadas corriendo en vivo (ver Módulo de Torneos → Migraciones); solo `20260920000001` no se ha vuelto a verificar directamente.

La prioridad siguiente sigue siendo validar con datos reales, no una nueva categoría de funcionalidad. Queda abierto un problema conocido sin resolver en Onboarding Step 2 (ver Sprint 3 — Experiencia Owner) y la verificación directa de `20260920000001` contra la base de datos (ver Módulo Deportivo — Ranking (Fase 2)).

Antes de expandir el producto hacia funcionalidades sociales, clínicas o ladder.
