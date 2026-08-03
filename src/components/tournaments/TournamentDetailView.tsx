"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Camera, ChevronDown, Globe, ImageIcon, Lock, Maximize2, MessageCircle, Pencil, X } from "lucide-react";
import { Badge, Button, ConfirmDialog, Toast } from "@/components/ui";
import { formatDurationMinutes } from "@/lib/utils/tournamentDuration";
import { TournamentForm } from "@/app/(app)/[club]/admin/tournaments/TournamentForm";
import { EditTournamentCoverModal } from "@/app/(app)/[club]/admin/tournaments/EditTournamentCoverModal";
import {
  archiveTournament,
  cancelTournament,
  closeTournamentRegistration,
  finalizeTournament,
  openTournamentRegistration,
  reopenTournamentRegistration,
  restoreTournament,
  startTournament,
  updateTournament,
} from "@/app/(app)/[club]/admin/tournaments/actions";
import {
  tournamentCategoryLabel,
  tournamentEntryFeeLabel,
  tournamentStatusBadgeVariant,
  tournamentStatusLabel,
  tournamentVisibilityLabel,
} from "@/lib/tournamentLabels";
import { EntriesSection } from "@/components/tournaments/EntriesSection";
import { ClassificationSection } from "@/components/tournaments/ClassificationSection";
import { ClassificationSkeleton } from "@/components/tournaments/ClassificationSkeleton";
import { TournamentPodium } from "@/components/tournaments/TournamentPodium";
import { TournamentConfetti } from "@/components/tournaments/TournamentConfetti";
import { TournamentNewsAction } from "@/components/tournaments/TournamentNewsAction";
import { ImagePreviewModal } from "@/components/tournaments/ImagePreviewModal";
import { WithdrawnEntriesAccordion } from "@/components/tournaments/WithdrawnEntriesAccordion";
import { computeTournamentClassification, type TournamentEntriesCapacity, type TournamentEntryWithMembers } from "@/lib/tournamentEntries";
import { useMemberModal } from "@/app/(app)/[club]/admin/players/useMemberModal";
import { MemberModalHost } from "@/app/(app)/[club]/admin/players/MemberModalHost";
import type { Tournament, SportCategory } from "@/types/database";

interface TournamentDetailViewProps {
  tournament: Tournament;
  // Antes Pick<SportCategory, "code" | "sort_order">[] — ensanchado a la
  // forma completa porque MemberModalHost (mismo "Miembro del club" que
  // Jugadores/Ranking) necesita sportCategories completo; page.tsx ya
  // consulta code/sort_order/created_at, así que esto no agrega ninguna
  // query nueva, solo corrige el tipo declarado.
  categories: SportCategory[];
  clubSlug: string;
  clubId: string;
  entries: TournamentEntryWithMembers[];
  entriesError: string | null;
  capacity: TournamentEntriesCapacity;
  // Única fuente de verdad de layout para el detalle del torneo — OWNER,
  // ADMIN y PLAYER renderizan exactamente el mismo componente. Lo único
  // que cambia según el rol son las acciones administrativas (editar,
  // ciclo de vida) y los datos de participación propia — nunca una
  // segunda implementación visual.
  role: "OWNER" | "ADMIN" | "PLAYER";
  ownClubMemberId: string;
  ownUserId: string;
  ownFullName?: string | null;
  ownAvatarUrl?: string | null;
  ownCategory?: string | null;
  // Cierre editorial (torneo completed) — slug de la noticia de club_news
  // ya asociada a este torneo (tournament_id real), resuelta por el
  // Server Component padre. null cuando todavía no existe ninguna.
  // Irrelevante para cualquier otro estado del torneo.
  existingNewsSlug?: string | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Sin definir";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PendingTransition =
  | "open"
  | "close"
  | "reopen"
  | "cancel"
  | "start"
  | "finalize"
  | "archive"
  | "restore"
  | null;

export function TournamentDetailView({
  tournament: initialTournament,
  categories,
  clubSlug,
  clubId,
  entries,
  entriesError,
  capacity,
  role,
  ownClubMemberId,
  ownUserId,
  ownFullName = null,
  ownAvatarUrl = null,
  ownCategory = null,
  existingNewsSlug = null,
}: TournamentDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createdFlag = searchParams.get("created") === "1";
  const isAdmin = role === "OWNER" || role === "ADMIN";
  // Misma colección `entries` ya cargada por el padre — solo un filtro de
  // presentación, nunca una consulta nueva. Historial administrativo
  // (OWNER/ADMIN); PLAYER nunca ve este bloque.
  const withdrawnEntries = entries.filter((e) => e.status === "withdrawn");

  // "Miembro del club" — mismo hook/modal que Ranking (useMemberModal),
  // nunca una copia. Sin onMutationSuccess: a diferencia de RankingView,
  // `classification`/`podiumRows` se derivan de la prop `entries` (nunca
  // copiada a estado) y EntriesSection ya reconcilia su propio estado con
  // initialEntries en cada prop change — el router.refresh() que
  // MemberModal ya dispara en cada mutación es suficiente. Editar un
  // jugador desde aquí nunca reescribe puntos/clasificación/resultados del
  // torneo (ese dato vive en tournament_entries/club_player_point_movements,
  // nunca tocado por esta modal). Solo OWNER/ADMIN: el modal no tiene modo
  // de solo lectura para PLAYER todavía, mismo criterio que Ranking.
  const memberModal = useMemberModal({ clubId });

  // tournament mirrors the initialTournament prop (fresh server data after
  // router.refresh()) but is also updated locally right after a successful
  // RPC call — React's documented "adjusting state when a prop changes"
  // pattern (setState during render, not inside an effect) keeps both in
  // sync without a set-state-in-effect violation.
  const [tournament, setTournament] = useState(initialTournament);
  const [prevInitialTournament, setPrevInitialTournament] = useState(initialTournament);
  if (initialTournament !== prevInitialTournament) {
    setPrevInitialTournament(initialTournament);
    setTournament(initialTournament);
  }

  // "En curso" y "Finalizado" son los dos únicos estados con jerarquía
  // distinta al resto (draft/registration_open/registration_closed
  // conservan el orden original 1..6 sin cambios):
  //  - in_progress: Clasificación pasa a ser el primer bloque tras el
  //    encabezado, Información se colapsa, EntriesSection pierde las
  //    tarjetas grandes de confirmadas (hideConfirmedList) pero se
  //    mantiene (el organizador sigue pudiendo registrar/gestionar).
  //  - completed: Podio final entra ANTES de la Clasificación (que sigue
  //    igual de protagonista), Información se colapsa igual que en vivo,
  //    y EntriesSection ya no se renderiza en absoluto — la etapa de
  //    inscripciones terminó y la Clasificación final ya contiene a
  //    todos los participantes relevantes. La columna derecha suma el
  //    cierre editorial (TournamentNewsAction, solo OWNER/ADMIN) entre
  //    la imagen y el historial de retiradas.
  const inProgress = tournament.status === "in_progress";
  const isCompleted = tournament.status === "completed";
  const podiumOrder = "order-2";
  // completed reparte dos secuencias de order-* distintas a propósito:
  // la SIN prefijo gobierna el flujo único de mobile/tablet (columnas
  // colapsadas vía `contents`), la `lg:` gobierna cada columna de
  // desktop de forma independiente entre sí (columna izquierda:
  // header/podio/clasificación/información; columna derecha: imagen +
  // cierre editorial, sin duplas retiradas — ver más abajo) — nunca
  // necesitan compartir numeración en desktop porque ahí son dos
  // flex-col reales, no un único flujo. Mobile pide explícitamente:
  // podio → noticia → clasificación → imagen → información.
  const classificationOrder = inProgress ? "order-2" : isCompleted ? "order-4 lg:order-3" : "order-6";
  const infoOrder = inProgress ? "order-4" : isCompleted ? "order-6 lg:order-5" : "order-2";
  const entriesOrder = inProgress ? "order-6" : "order-4";
  const imageOrder = isCompleted ? "order-5 lg:order-1" : "order-3";
  const newsActionOrder = "order-3 lg:order-2";
  // Duplas retiradas nunca se muestra en completed (más abajo), así que
  // este valor solo aplica a los demás estados — un único valor plano
  // basta, sin rama isCompleted.
  const withdrawnOrder = "order-5";

  // Misma computeTournamentClassification que ya usa ClassificationSection
  // (nunca una segunda lógica de clasificación) — se recalcula aquí, sobre
  // la misma prop `entries`, únicamente para poder armar el Podio final
  // antes de la Clasificación en el layout de "completed". Resultado
  // idéntico al que calcula internamente ClassificationSection porque es
  // la misma función pura sobre los mismos datos.
  const classification = useMemo(() => computeTournamentClassification(entries), [entries]);
  const podiumRows = useMemo(() => classification.filter((row) => row.position <= 3), [classification]);

  // Confetti de celebración — celebración permanente mientras se observa
  // un torneo completed: explosión inmediata al entrar, y una nueva cada
  // 10s mientras la pestaña siga visible. `confettiKey` fuerza un
  // remount real de <TournamentConfetti> en cada explosión (piezas
  // nuevas, mismo componente reutilizado sin tocarlo) — `showConfetti`
  // decide si algo se monta en absoluto, así que entre explosiones no
  // queda ningún nodo de confetti "en pausa" en el DOM.
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  useEffect(() => {
    if (!isCompleted) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let intervalId: number | null = null;
    let frameId: number | null = null;

    function fireBurst() {
      setConfettiKey((k) => k + 1);
      setShowConfetti(true);
    }

    // El ciclo (explosión inmediata + intervalo de 10s) solo corre
    // mientras document.visibilityState === "visible" — al ocultar la
    // pestaña se limpia por completo (sin temporizador de fondo); al
    // volver, se dispara una explosión inmediata y el intervalo arranca
    // de cero desde ese momento, nunca "recuperando" el tiempo perdido.
    function startCycle() {
      frameId = requestAnimationFrame(fireBurst);
      intervalId = window.setInterval(fireBurst, 10000);
    }

    function stopCycle() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        stopCycle();
        startCycle();
      } else {
        stopCycle();
      }
    }

    if (document.visibilityState === "visible") {
      startCycle();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopCycle();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isCompleted]);

  // Actualización automática de la Clasificación al recuperar el foco —
  // únicamente mientras el torneo está in_progress (el efecto se
  // desmonta/reinstala solo según `inProgress`, así que en cuanto el
  // torneo deja ese estado —p. ej. tras finalizar mientras la pestaña
  // estaba en segundo plano— los listeners se retiran automáticamente en
  // el siguiente render). `useTransition` propio (no el `pending` de
  // abajo, que es de las acciones del organizador) porque
  // `router.refresh()` no devuelve una Promise — envolverlo en
  // startTransition es la única forma correcta de saber cuándo terminó
  // realmente de llegar el nuevo payload del Server Component
  // (`isPending` pasa a false recién cuando React aplica el render con
  // los datos frescos, nunca antes).
  const [classificationRefreshing, startClassificationRefresh] = useTransition();
  // wasHiddenRef: solo dispara un refresh si la pestaña/ventana estuvo
  // realmente oculta o sin foco antes de volver — ignora el foco inicial
  // al montar (arranca en false) y evita que un simple parpadeo de foco
  // sin pérdida previa dispare algo.
  const wasHiddenRef = useRef(false);
  // debounceTimerRef: coalesce — visibilitychange y focus casi siempre
  // llegan juntos al volver a la pestaña; el primero en procesar ya deja
  // wasHiddenRef en false, así que el segundo nunca llega a agendar un
  // segundo timer. El timer en sí (700ms) es el cooldown pedido (500–
  //1000ms) antes de disparar el refresh real.
  const debounceTimerRef = useRef<number | null>(null);
  // refreshingRef: espejo síncrono de `classificationRefreshing` (el
  // estado de React llega un tick después) — evita apilar un segundo
  // refresh si el usuario entra/sale varias veces mientras el anterior
  // sigue en vuelo; se resincroniza solo en el efecto de abajo.
  const refreshingRef = useRef(false);

  useEffect(() => {
    refreshingRef.current = classificationRefreshing;
  }, [classificationRefreshing]);

  useEffect(() => {
    if (!inProgress) return;

    function triggerRefresh() {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      startClassificationRefresh(() => {
        router.refresh();
      });
    }

    function scheduleRefresh() {
      if (refreshingRef.current || debounceTimerRef.current !== null) return;
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        triggerRefresh();
      }, 700);
    }

    function handleReturn() {
      if (!wasHiddenRef.current) return;
      wasHiddenRef.current = false;
      scheduleRefresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
        return;
      }
      handleReturn();
    }

    function handleBlur() {
      wasHiddenRef.current = true;
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleReturn);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleReturn);
      window.removeEventListener("blur", handleBlur);
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [inProgress, router]);

  const [editing, setEditing] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [editingCover, setEditingCover] = useState(false);
  // Acordeón "Información del torneo" — solo existe/importa en "En curso"
  // (única rama que lo usa); cerrado por defecto ahí, sin afectar los
  // demás estados, que siguen mostrando la misma tarjeta siempre abierta.
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirming, setConfirming] = useState<PendingTransition>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Lazily seeded from ?created=1 (set once by TournamentsGrid right after
  // create_tournament) instead of set inside an effect — the effect below
  // only performs the external side effect (stripping the URL), never
  // setState, so it runs exactly once per mount regardless of StrictMode.
  const [toastMessage, setToastMessage] = useState<string | null>(() =>
    createdFlag ? "Torneo creado correctamente" : null
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (createdFlag) {
      router.replace(`/${clubSlug}/tournaments/${initialTournament.slug}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same hydration-safe origin pattern as ShareNewsButtons — starts as the
  // relative path (matches SSR output) and upgrades to an absolute URL
  // once mounted, so the WhatsApp share link always carries a real,
  // shareable tournament URL.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const boundUpdate = updateTournament.bind(null, clubId, tournament.id, tournament.slug, clubSlug);

  const canEdit =
    isAdmin &&
    (tournament.status === "draft" ||
      tournament.status === "registration_open" ||
      tournament.status === "registration_closed");
  const canOpenRegistration = isAdmin && tournament.status === "draft";
  // Cerrar inscripciones requiere al menos 2 duplas realmente confirmadas
  // (nunca pendientes/rechazadas/retiradas) — con 0 o 1, el organizador
  // solo puede mantener las inscripciones abiertas o cancelar el torneo
  // (canCancel, sin cambios). Misma regla reforzada en el RPC.
  const canCloseRegistration =
    isAdmin && tournament.status === "registration_open" && capacity.confirmed >= 2;
  const canReopenRegistration = isAdmin && tournament.status === "registration_closed";
  const canStart = isAdmin && tournament.status === "registration_closed" && capacity.confirmed >= 1;
  const canFinalize = isAdmin && tournament.status === "in_progress";
  const canCancel =
    isAdmin && ["draft", "registration_open", "registration_closed", "in_progress"].includes(tournament.status);
  // Compartir por WhatsApp — solo mientras el torneo tiene sentido
  // promocionar (inscripciones abiertas/cerradas o ya en curso), nunca en
  // draft (aún no es público de facto), cancelled o completed.
  const canShareWhatsApp =
    isAdmin && ["registration_open", "registration_closed", "in_progress"].includes(tournament.status);
  // Archivar — solo torneos finalizados o cancelados, y solo si aún no
  // están archivados (nunca dos veces). Restaurar es la acción inversa,
  // solo disponible una vez archivado. El estado deportivo (status) nunca
  // cambia por ninguna de las dos — ver 20261020000001_tournament_archive.
  const canArchive =
    isAdmin && ["completed", "cancelled"].includes(tournament.status) && !tournament.archived_at;
  const canRestore = isAdmin && !!tournament.archived_at;
  const hasAnyAdminAction =
    canEdit ||
    canOpenRegistration ||
    canCloseRegistration ||
    canReopenRegistration ||
    canStart ||
    canFinalize ||
    canCancel ||
    canShareWhatsApp ||
    canArchive ||
    canRestore;

  const tournamentUrl = `${origin ?? ""}/${clubSlug}/tournaments/${tournament.slug}`;
  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(
    [`🏆 ${tournament.name}`, ...(tournament.description ? ["", tournament.description] : []), "", "Inscríbete aquí:", tournamentUrl].join("\n")
  )}`;

  function handleEditSuccess(updated: Tournament | undefined) {
    setEditing(false);
    if (updated) setTournament(updated);
    setToastMessage("Cambios guardados correctamente");
    router.refresh();
  }

  function handleCoverSuccess(updated: Tournament | undefined) {
    setEditingCover(false);
    if (updated) setTournament(updated);
    setToastMessage("Portada actualizada correctamente");
    // router.refresh() propaga el nuevo cover_image_url a cualquier otra
    // vista que ya dependa de datos frescos del servidor (listados,
    // página pública) — junto con los revalidatePath ya hechos por la
    // propia action, nunca hace falta una recarga manual.
    router.refresh();
  }

  function handleConfirmTransition() {
    if (!confirming) return;
    setActionError(null);
    startTransition(async () => {
      if (confirming === "finalize") {
        const result = await finalizeTournament(clubId, tournament.id, tournament.slug, clubSlug);
        if (result.error) {
          setActionError(result.error);
          return;
        }
        setConfirming(null);
        setToastMessage(
          result.alreadyFinalized ? "Este torneo ya estaba finalizado." : "Torneo finalizado y puntos aplicados al ranking."
        );
        router.refresh();
        return;
      }

      const action =
        confirming === "open"
          ? openTournamentRegistration
          : confirming === "close"
          ? closeTournamentRegistration
          : confirming === "reopen"
          ? reopenTournamentRegistration
          : confirming === "start"
          ? startTournament
          : confirming === "archive"
          ? archiveTournament
          : confirming === "restore"
          ? restoreTournament
          : cancelTournament;

      const result = await action(clubId, tournament.id, tournament.slug, clubSlug);

      if (result.error) {
        setActionError(result.error);
        return;
      }

      if (result.tournament) setTournament(result.tournament);
      setConfirming(null);
      setToastMessage(
        confirming === "open"
          ? "Inscripciones abiertas correctamente"
          : confirming === "close"
          ? "Inscripciones cerradas correctamente"
          : confirming === "reopen"
          ? "Inscripciones reabiertas correctamente"
          : confirming === "start"
          ? "Torneo iniciado — ¡en curso!"
          : confirming === "archive"
          ? "Torneo archivado correctamente"
          : confirming === "restore"
          ? "Torneo restaurado correctamente"
          : "Torneo cancelado correctamente"
      );
      router.refresh();
    });
  }

  const confirmDialogConfig: Record<Exclude<PendingTransition, null>, {
    title: string;
    message: string;
    confirmLabel: string;
    confirmVariant: "primary" | "danger";
  }> = {
    open: {
      title: "Abrir inscripciones",
      message:
        "Al abrir las inscripciones, la categoría, el número máximo de duplas y la fecha de apertura ya no podrán modificarse.",
      confirmLabel: "Abrir inscripciones",
      confirmVariant: "primary",
    },
    close: {
      title: "Cerrar inscripciones",
      message: "Al cerrar las inscripciones ya no se podrán registrar nuevas duplas hasta que las reabras.",
      confirmLabel: "Cerrar inscripciones",
      confirmVariant: "primary",
    },
    reopen: {
      title: "Reabrir inscripciones",
      message: "Los jugadores elegibles podrán volver a inscribirse. Las solicitudes ya rechazadas no se reactivan.",
      confirmLabel: "Reabrir inscripciones",
      confirmVariant: "primary",
    },
    start: {
      title: "Iniciar torneo",
      message:
        'Al iniciar el torneo cambiará su estado a "En curso".\n\n' +
        "Los partidos se juegan normalmente en la cancha y el club es libre de organizarlos como prefiera.\n\n" +
        "Al finalizar el torneo, Mi Pádel Club registrará únicamente la clasificación final de las duplas para actualizar el ranking y generar automáticamente la noticia del torneo.",
      confirmLabel: "Iniciar torneo",
      confirmVariant: "primary",
    },
    finalize: {
      title: "Finalizar torneo",
      message:
        "La clasificación actual quedará congelada. Cada integrante final de cada dupla recibirá la cantidad completa de puntos de su dupla en el ranking (no se dividen entre los dos). Esta acción no se puede deshacer ni se duplica si se ejecuta más de una vez.",
      confirmLabel: "Finalizar torneo",
      confirmVariant: "danger",
    },
    cancel: {
      title: "¿Cancelar este torneo?",
      message: "Esta acción conservará el torneo como historial, pero no podrá continuar su operación.",
      confirmLabel: "Cancelar torneo",
      confirmVariant: "danger",
    },
    archive: {
      title: "Archivar torneo",
      message:
        "El torneo se moverá a la pestaña Archivados y dejará de mezclarse con los demás torneos. Conserva toda su información e historial — puedes restaurarlo cuando quieras.",
      confirmLabel: "Archivar torneo",
      confirmVariant: "primary",
    },
    restore: {
      title: "Restaurar torneo",
      message: "El torneo volverá a aparecer en la pestaña correspondiente a su estado actual.",
      confirmLabel: "Restaurar torneo",
      confirmVariant: "primary",
    },
  };

  return (
    <>
      {/* Desktop (lg:): dos columnas totalmente independientes — la
          izquierda (~70%) es un único bloque flex-col cuya altura depende
          solo de su propio contenido, nunca de la derecha; la derecha
          (~30%) es otro bloque flex-col independiente: portada arriba, y
          debajo (solo OWNER/ADMIN) el acordeón de duplas retiradas. Cada
          columna es un wrapper `contents`/`flex flex-col` propio — nunca
          filas sueltas de la misma cuadrícula (col-start/row-start por
          elemento), que acoplaba la altura de ambas columnas entre sí.

          Mobile/tablet: `contents` en ambos wrappers los saca del árbol de
          cajas, así sus hijos vuelven a competir como items flex directos
          del contenedor exterior por `order-*`, sin duplicar ningún nodo.
          El orden es el mismo en todos los estados (encabezado →
          información → imagen → duplas → historial de retiradas →
          clasificación) EXCEPTO "En curso" (classificationOrder/infoOrder/
          entriesOrder arriba): ahí la Clasificación pasa a ser el primer
          bloque tras el encabezado (order-2), Información del torneo se
          colapsa y baja a order-4, y las duplas confirmadas de
          EntriesSection dejan de mostrarse en el flujo principal
          (order-6, hideConfirmedList) — la imagen (order-3) y el
          historial de retiradas (order-5) no cambian en ningún estado. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[7fr_3fr] lg:gap-8 lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-6 lg:min-w-0">
          <div className="order-1 min-w-0">
            <Link
              href={isAdmin ? `/${clubSlug}/admin/tournaments` : `/${clubSlug}/tournaments`}
              className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Torneos
            </Link>

            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
                  <Badge variant={tournamentStatusBadgeVariant(tournament.status)} size="sm">
                    {tournamentStatusLabel(tournament.status)}
                  </Badge>
                  {/* Señal visual PRINCIPAL de que el torneo está
                      ocurriendo ahora — deliberadamente más grande y
                      sólido que el Badge genérico de arriba (que muestra
                      el estado "En curso" y permanece discreto, sin
                      tocar). Markup propio, no una variante de Badge: el
                      fondo rojo oscuro sólido, el padding y la tipografía
                      que pide esta pieza no encajan en las variantes
                      compartidas sin alterarlas para el resto de la app. */}
                  {tournament.status === "in_progress" && (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-950 border border-red-500/50">
                      <span className="inline-flex w-2 h-2 shrink-0 live-dot" aria-hidden>
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                      </span>
                      <span className="text-sm font-bold text-white leading-none">En vivo</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-brand-muted">
                    {tournament.visibility === "public" ? (
                      <Globe className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    {tournamentVisibilityLabel(tournament.visibility)}
                  </span>
                </div>
                {tournament.description && <p className="text-brand-muted text-sm max-w-2xl">{tournament.description}</p>}
              </div>

              {hasAnyAdminAction && (
                <div className="flex items-center gap-2 flex-wrap">
                  {canShareWhatsApp && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => window.open(whatsappShareHref, "_blank", "noopener,noreferrer")}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Compartir por WhatsApp
                    </Button>
                  )}
                  {canEdit && (
                    <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </Button>
                  )}
                  {canOpenRegistration && (
                    <Button size="sm" onClick={() => { setActionError(null); setConfirming("open"); }}>
                      Abrir inscripciones
                    </Button>
                  )}
                  {canCloseRegistration && (
                    <Button size="sm" onClick={() => { setActionError(null); setConfirming("close"); }}>
                      Cerrar inscripciones
                    </Button>
                  )}
                  {canReopenRegistration && (
                    <Button variant="secondary" size="sm" onClick={() => { setActionError(null); setConfirming("reopen"); }}>
                      Reabrir inscripciones
                    </Button>
                  )}
                  {canStart && (
                    <Button size="sm" onClick={() => { setActionError(null); setConfirming("start"); }}>
                      Iniciar torneo
                    </Button>
                  )}
                  {canFinalize && (
                    <Button size="sm" onClick={() => { setActionError(null); setConfirming("finalize"); }}>
                      Finalizar torneo
                    </Button>
                  )}
                  {canCancel && (
                    <Button variant="danger" size="sm" onClick={() => { setActionError(null); setConfirming("cancel"); }}>
                      Cancelar torneo
                    </Button>
                  )}
                  {canArchive && (
                    <Button variant="secondary" size="sm" onClick={() => { setActionError(null); setConfirming("archive"); }}>
                      Archivar torneo
                    </Button>
                  )}
                  {canRestore && (
                    <Button variant="secondary" size="sm" onClick={() => { setActionError(null); setConfirming("restore"); }}>
                      Restaurar torneo
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {(() => {
            // Mismos campos de siempre, en un único lugar — la rama "En
            // curso" (acordeón) y el resto de estados (tarjeta siempre
            // abierta) renderizan exactamente este mismo nodo una sola vez
            // cada vez, nunca dos copias del marcado.
            const infoFields = (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div>
                  <p className="text-xs text-brand-muted mb-1">Categoría</p>
                  <p className="text-sm text-white font-medium">
                    {tournamentCategoryLabel(tournament.category, tournament.secondary_category)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-muted mb-1">Cupo máximo</p>
                  <p className="text-sm text-white font-medium">{tournament.max_pairs} duplas</p>
                </div>
                <div>
                  <p className="text-xs text-brand-muted mb-1">Inscripción</p>
                  <p className="text-sm text-white font-medium">
                    {tournamentEntryFeeLabel(tournament.entry_fee_amount)}
                  </p>
                </div>
                {tournament.prize_description && (
                  <div>
                    <p className="text-xs text-brand-muted mb-1">Premios</p>
                    <p className="text-sm text-white font-medium">{tournament.prize_description}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-brand-muted mb-1">Inicio</p>
                  <p className="text-sm text-white font-medium">{formatDateTime(tournament.starts_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-muted mb-1">Duración estimada</p>
                  <p className="text-sm text-white font-medium">
                    {tournament.estimated_duration_minutes
                      ? formatDurationMinutes(tournament.estimated_duration_minutes)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-muted mb-1">Apertura de inscripciones</p>
                  <p className="text-sm text-white font-medium">{formatDateTime(tournament.registration_opens_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-muted mb-1">Cierre de inscripciones</p>
                  <p className="text-sm text-white font-medium">{formatDateTime(tournament.registration_closes_at)}</p>
                </div>
                {tournament.started_at && (
                  <div>
                    <p className="text-xs text-brand-muted mb-1">Iniciado</p>
                    <p className="text-sm text-white font-medium">{formatDateTime(tournament.started_at)}</p>
                  </div>
                )}
                {tournament.completed_at && (
                  <div>
                    <p className="text-xs text-brand-muted mb-1">Finalizado</p>
                    <p className="text-sm text-white font-medium">{formatDateTime(tournament.completed_at)}</p>
                  </div>
                )}
                {tournament.cancelled_at && (
                  <div>
                    <p className="text-xs text-brand-muted mb-1">Cancelado</p>
                    <p className="text-sm text-white font-medium">{formatDateTime(tournament.cancelled_at)}</p>
                  </div>
                )}
              </div>
            );

            return inProgress ? (
              <div className={`${infoOrder} max-w-3xl`}>
                <div className="rounded-2xl border border-white/10 bg-brand-surface overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setInfoOpen((v) => !v)}
                    aria-expanded={infoOpen}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm font-medium text-white/80">Información del torneo</span>
                    <ChevronDown
                      className={`w-4 h-4 text-brand-muted shrink-0 transition-transform ${infoOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {infoOpen && <div className="px-5 pb-5 pt-1">{infoFields}</div>}
                </div>
              </div>
            ) : (
              <div className={`${infoOrder} bg-brand-surface border border-white/10 rounded-2xl p-5 max-w-3xl`}>
                {infoFields}
              </div>
            );
          })()}

          {/* Inscripciones — ya no existe en absoluto cuando el torneo está
              completed: esa etapa terminó y la Clasificación final de
              abajo ya contiene a todos los participantes relevantes.
              Nunca se elimina el componente para in_progress/draft/etc.,
              solo se deja de montar puntualmente en este estado. */}
          {!isCompleted && (
            <div className={entriesOrder}>
              {entriesError ? (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-3xl">
                  {entriesError}
                </p>
              ) : (
                <EntriesSection
                  tournament={tournament}
                  initialEntries={entries}
                  capacity={capacity}
                  role={role}
                  ownClubMemberId={ownClubMemberId}
                  ownUserId={ownUserId}
                  ownFullName={ownFullName}
                  ownAvatarUrl={ownAvatarUrl}
                  ownCategory={ownCategory}
                  revalidatePaths={[`/${clubSlug}/tournaments/${tournament.slug}`]}
                  hideConfirmedList={inProgress}
                  avatarsClickable={isAdmin}
                  onSelectMember={memberModal.openMember}
                  loadingMemberId={memberModal.loadingMemberId}
                />
              )}
            </div>
          )}

          {/* Podio final — solo completed, siempre antes de la
              Clasificación. Agrupado por posición oficial (nunca las
              primeras 3 filas del arreglo): un empate real se refleja
              apilando duplas dentro del mismo lugar, y un lugar sin
              ninguna dupla no se dibuja. */}
          {isCompleted && podiumRows.length > 0 && (
            <div className={`${podiumOrder} max-w-3xl`}>
              <h2 className="text-lg font-semibold text-white mb-4">Podio final</h2>
              <TournamentPodium
                rows={podiumRows}
                avatarsClickable={isAdmin}
                onSelectMember={memberModal.openMember}
                loadingMemberId={memberModal.loadingMemberId}
              />
            </div>
          )}

          {/* Clasificación — únicamente puntos de duplas confirmadas, con salto
              de posición en empates, una sola lista (top 3 con medalla,
              sin una sección de "Podio" aparte dentro de ella — el Podio
              visual grande de arriba es un bloque distinto, nunca una
              segunda clasificación). Editable en bloque ("Guardar
              puntos") mientras in_progress y solo para OWNER/ADMIN;
              PLAYER y completed siempre en solo lectura. Nunca partidos,
              victorias, sets ni estadísticas competitivas.

              Mientras `classificationRefreshing` está activo (refresh
              automático al recuperar el foco, ver el efecto de arriba —
              nunca ocurre en completed, el efecto solo se instala durante
              in_progress) se muestra ClassificationSkeleton en su lugar —
              mismo bloque, mismo ancho, mismo alto aproximado por fila,
              nunca un spinner de página completa ni se oculta el
              encabezado/imagen de al lado. `aria-busy` + texto oculto
              avisan a lectores de pantalla sin depender de la
              animación. */}
          {(tournament.status === "in_progress" || isCompleted) && (
            <div className={`${classificationOrder} max-w-3xl`} aria-busy={classificationRefreshing}>
              <h2 className="text-lg font-semibold text-white mb-4">
                {isCompleted ? "Clasificación final" : "Clasificación"}
              </h2>
              {classificationRefreshing && (
                <span role="status" className="sr-only">
                  Actualizando clasificación
                </span>
              )}
              {classificationRefreshing ? (
                <ClassificationSkeleton
                  rows={Math.min(Math.max(capacity.confirmed, 1), 12)}
                  editable={isAdmin && tournament.status === "in_progress"}
                />
              ) : (
                <ClassificationSection
                  clubId={clubId}
                  tournamentId={tournament.id}
                  category={tournament.category}
                  secondaryCategory={tournament.secondary_category}
                  entries={entries}
                  editable={isAdmin && tournament.status === "in_progress"}
                  isLive={inProgress}
                  completed={isCompleted}
                  ownClubMemberId={ownClubMemberId}
                  ownUserId={ownUserId}
                  revalidatePaths={[`/${clubSlug}/tournaments/${tournament.slug}`]}
                  avatarsClickable={isAdmin}
                  onSelectMember={memberModal.openMember}
                  loadingMemberId={memberModal.loadingMemberId}
                />
              )}
            </div>
          )}
        </div>

        {/* Columna derecha: portada arriba, historial de retiradas
            (OWNER/ADMIN) inmediatamente debajo — mismo wrapper `contents`
            que la columna izquierda, así en mobile ambos bloques vuelven
            a competir en el flujo principal por `order-*` (imagen antes
            de inscripciones, historial después de ellas) sin duplicar
            nada, y en desktop quedan apilados en su propia columna
            independiente de la izquierda. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4 lg:min-w-0">
          {/* Portada — editable por OWNER/ADMIN en CUALQUIER estado del
              torneo (draft/registration_open/registration_closed/
              in_progress/completed/cancelled), a diferencia del resto
              del torneo (Editar, arriba, solo disponible antes de
              in_progress). El ícono de edición es un botón hermano del
              de ampliar imagen (nunca anidado: dos <button> no pueden
              anidarse), superpuesto en la esquina. Sin portada, un
              admin ve un placeholder para agregar una — un visitante/
              PLAYER sin portada simplemente no ve nada, igual que
              siempre. */}
          {(tournament.cover_image_url || isAdmin) && (
            <div className={imageOrder}>
              <div className="relative">
                {tournament.cover_image_url ? (
                  <button
                    type="button"
                    onClick={() => setImagePreviewOpen(true)}
                    aria-label="Ampliar imagen de portada del torneo"
                    className="group relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- portada arbitraria de Supabase Storage, no un asset de build */}
                    <img
                      src={tournament.cover_image_url}
                      alt={`Portada de ${tournament.name}`}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingCover(true)}
                    aria-label="Agregar portada del torneo"
                    className="w-full aspect-[3/4] rounded-2xl border border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center gap-2 text-brand-muted/60 hover:border-white/30 transition-colors"
                  >
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-xs">Agregar portada</span>
                  </button>
                )}

                {isAdmin && tournament.cover_image_url && (
                  <button
                    type="button"
                    onClick={() => setEditingCover(true)}
                    aria-label="Editar portada del torneo"
                    className="absolute top-2 right-2 z-10 w-8 h-8 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Cierre editorial — solo OWNER/ADMIN, solo completed. Decisión
              de producto tomada aquí: PLAYER/visitantes no ven este
              control lateral (ni "Generar noticia" ni "Ver noticia") —
              la noticia, una vez publicada, sigue siendo perfectamente
              accesible para cualquiera a través del módulo de Noticias y
              la página pública del club, con exactamente las mismas
              reglas de visibilidad de siempre (RLS de club_news sin
              cambios) — esto solo decide si aparece el atajo en esta
              columna, nunca quién puede leer la noticia. */}
          {isAdmin && isCompleted && (
            <div className={newsActionOrder}>
              <TournamentNewsAction
                clubId={clubId}
                clubSlug={clubSlug}
                tournament={tournament}
                classification={classification}
                existingNewsSlug={existingNewsSlug}
              />
            </div>
          )}

          {/* Duplas retiradas — solo tiene valor operativo mientras el
              torneo sigue en curso (gestionar inscripciones); una vez
              completed deja de aportar, así que directamente no se
              monta (nunca `hidden`/oculto con espacio reservado) — la
              columna derecha en completed queda solo con imagen + cierre
              editorial, sin hueco vacío donde iba este acordeón. */}
          {isAdmin && !isCompleted && (
            <div className={withdrawnOrder}>
              <WithdrawnEntriesAccordion
                entries={withdrawnEntries}
                avatarsClickable={isAdmin}
                onSelectMember={memberModal.openMember}
                loadingMemberId={memberModal.loadingMemberId}
              />
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <MemberModalHost controller={memberModal} clubId={clubId} clubSlug={clubSlug} sportCategories={categories} />
      )}

      {imagePreviewOpen && tournament.cover_image_url && (
        <ImagePreviewModal
          src={tournament.cover_image_url}
          alt={`Portada de ${tournament.name}`}
          onClose={() => setImagePreviewOpen(false)}
        />
      )}

      {isAdmin && editingCover && (
        <EditTournamentCoverModal
          clubId={clubId}
          tournamentId={tournament.id}
          tournamentSlug={tournament.slug}
          clubSlug={clubSlug}
          currentImageUrl={tournament.cover_image_url}
          onClose={() => setEditingCover(false)}
          onSuccess={handleCoverSuccess}
        />
      )}

      {isAdmin && editing && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[400]"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setEditing(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
            <div
              className="pointer-events-auto w-full md:w-[720px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
              style={{ maxHeight: "90dvh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <h2 className="text-base font-semibold text-white">Editar torneo</h2>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-5">
                <TournamentForm
                  clubId={clubId}
                  tournament={tournament}
                  categories={categories}
                  action={boundUpdate}
                  onSuccess={handleEditSuccess}
                  onCancel={() => setEditing(false)}
                  minMaxPairs={capacity.occupied}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {isAdmin && confirming && (
        <ConfirmDialog
          open={!!confirming}
          title={confirmDialogConfig[confirming].title}
          message={confirmDialogConfig[confirming].message + (actionError ? `\n\n${actionError}` : "")}
          confirmLabel={confirmDialogConfig[confirming].confirmLabel}
          confirmVariant={confirmDialogConfig[confirming].confirmVariant}
          loading={pending}
          onConfirm={handleConfirmTransition}
          onCancel={() => {
            setConfirming(null);
            setActionError(null);
          }}
        />
      )}

      {showConfetti && <TournamentConfetti key={confettiKey} onDone={() => setShowConfetti(false)} />}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}
