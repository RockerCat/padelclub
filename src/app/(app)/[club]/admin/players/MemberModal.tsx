"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, MessageCircle } from "lucide-react";
import { Badge, Button, ConfirmDialog, Toast } from "@/components/ui";
import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";
import type { SportCategory } from "@/types/database";
import { toWhatsAppLink } from "@/lib/utils/phone";
import {
  toggleMemberActive,
  getMatchesPlayedCount,
  getClubMemberSportState,
  getClubMemberEmail,
} from "./actions";
import { AdjustPlayerPointsModal } from "./AdjustPlayerPointsModal";
import { ChangePlayerCategoryModal } from "./ChangePlayerCategoryModal";
import type { MemberRow } from "./MembersClient";

interface MemberModalProps {
  member: MemberRow;
  clubId: string;
  clubSlug: string;
  sportCategories: SportCategory[];
  // Posición vigente en el ranking de su categoría — ya resuelta por el
  // padre (MembersClient) a partir del mismo sportStateByMember calculado
  // una vez en page.tsx; ninguna consulta nueva se agrega aquí. Solo para
  // la corona del avatar (1/2/3); la categoría del avatar sigue viniendo
  // del propio estado `sportCategory` de este modal (ya se mantenía
  // reactivo a un cambio de categoría hecho desde aquí mismo).
  rankingPosition?: number | null;
  onClose: () => void;
  // Optional — Jugadores doesn't pass this (router.refresh() on toggle/
  // category-change already keeps its server-rendered grid in sync, see
  // MembersClient). Ranking's own list/podium are client-state (`rows`,
  // set via its own fetchRanking()), never re-derived from a refreshed
  // server prop, so it passes this to explicitly re-fetch after any
  // mutation — same rule already applied to toggle/category-change,
  // extended here to also cover points, the one path that didn't call it.
  onMutationSuccess?: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Same bg-white/10 + animate-pulse convention as RankingSkeleton
// (ranking/RankingView.tsx) — reserva aproximadamente el ancho/alto del
// contenido real que va a reemplazar, para que la sección deportiva no
// cambie de altura al terminar de cargar.
function SkeletonBar({ width, height = "h-4", rounded = "rounded" }: { width: string; height?: string; rounded?: string }) {
  return <span className={`inline-block ${height} ${width} ${rounded} bg-white/10 animate-pulse`} />;
}

// Replaces the standalone /admin/players/[id] page for PLAYER members — same
// content (avatar/name/status header, "Información deportiva", activate/
// deactivate), just inline so the grid's filters/search/scroll never reset.
// Status is tracked as local state seeded from the prop and updated from
// the toggle action's own result, instead of re-reading `member` after a
// router.refresh() — the grid's data refreshes in the background, but this
// modal instance doesn't get fresh props until it remounts.
//
// "Categoría" here means the sport-module category (club_member_sport_
// state.category, e.g. "6a") — the only one shown anywhere in this modal.
// club_members.category (the legacy Principiante/5ta/... field) is no
// longer displayed or editable here; updateMemberCategory (actions.ts)
// still exists and still works, it's simply never called from this UI
// anymore.
export function MemberModal({ member, clubId, clubSlug, sportCategories, rankingPosition, onClose, onMutationSuccess }: MemberModalProps) {
  const router = useRouter();
  const name = member.profiles?.full_name ?? "Sin nombre";

  const [isActive, setIsActive] = useState(member.is_active);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [togglePending, startToggle] = useTransition();

  // "Partidos jugados" — computed on demand, not stored on the member row,
  // so it can never drift out of sync with reservations. null = no
  // resuelto todavía; matchesPlayedLoading distingue "cargando" (skeleton)
  // de "ya resolvió pero sin conteo" (error silencioso preexistente, mismo
  // fallback "—" de siempre) — así el skeleton nunca queda pulsando para
  // siempre si esta consulta puntual llegara a fallar. Se refetchea cada
  // vez que este modal se abre para un miembro (un selectedMember distinto
  // siempre remonta este componente — ver MembersClient). Cuenta reservas
  // type='match' confirmadas y finalizadas — nunca resultados oficiales
  // (una reservation ordinaria no tiene ganador/victorias/derrotas, ver
  // Sport / Ranking Module Principles).
  const [matchesPlayed, setMatchesPlayed] = useState<number | null>(null);
  const [matchesPlayedLoading, setMatchesPlayedLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMatchesPlayedCount(clubId, member.profile_id).then((result) => {
      if (cancelled) return;
      if (typeof result.count === "number") setMatchesPlayed(result.count);
      setMatchesPlayedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, member.profile_id]);

  // Fase 1 módulo deportivo — categoría/puntos vigentes, obtenidos vía RPC
  // (club_member_sport_state no tiene lectura directa de cliente, ver
  // 20260822000001). sportStateLoading separa explícitamente "cargando"
  // (skeleton) de "ya resolvió y el jugador no tiene estado deportivo aún"
  // (sportCategory sigue null, pero ya no es loading — muestra "—", el
  // placeholder real de "sin datos" que ya existía) y de "falló la
  // consulta" (sportStateError, mensaje real en vez de skeleton infinito).
  const [sportCategory, setSportCategory] = useState<string | null>(null);
  const [sportPoints, setSportPoints] = useState<number | null>(null);
  const [sportStateLoading, setSportStateLoading] = useState(true);
  const [sportStateError, setSportStateError] = useState<string | null>(null);
  const [adjustPointsOpen, setAdjustPointsOpen] = useState(false);
  const [changeCategoryOpen, setChangeCategoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getClubMemberSportState(clubId, member.id).then((result) => {
      if (cancelled) return;
      setSportCategory(result.category);
      setSportPoints(result.currentPoints);
      setSportStateError("error" in result ? (result.error ?? null) : null);
      setSportStateLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, member.id]);

  // Ficha de contacto — el correo no llega con `member` (profiles no tiene
  // esa columna, ver getClubMemberEmail), así que se resuelve aparte, bajo
  // demanda, igual que sportState/matchesPlayed arriba. El teléfono sí
  // viene ya incluido en member.profiles.phone (misma consulta de
  // page.tsx que ya se usaba) — no requiere ningún fetch.
  //
  // Todo jugador registrado tiene correo (se registra e inicia sesión con
  // uno) — emailLoading solo cubre el breve instante del fetch; una vez
  // resuelto, `email` siendo null sí sería una inconsistencia real de
  // datos (o un fallo del RPC, ya registrado con console.error dentro de
  // getClubMemberEmail), nunca el estado esperado.
  const [email, setEmail] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const phone = member.profiles?.phone ?? null;

  useEffect(() => {
    let cancelled = false;
    getClubMemberEmail(clubId, member.id).then((result) => {
      if (cancelled) return;
      setEmail(result.email);
      setEmailLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, member.id]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function handleConfirmToggle() {
    const nextActive = !isActive;
    startToggle(async () => {
      const result = await toggleMemberActive(clubId, member.id, nextActive, clubSlug);
      setConfirmOpen(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsActive(nextActive);
      router.refresh();
      onMutationSuccess?.();
      setToastMessage(nextActive ? "Miembro activado correctamente" : "Miembro desactivado correctamente");
    });
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[480px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal chrome — same as ConfirmDialog/ReservationModal */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">Miembro del club</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-6">
            {/* ─── Encabezado ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-4">
              <PlayerSportAvatar
                player={{ id: member.profile_id, ...member.profiles }}
                size="lg"
                sportCategory={sportCategory}
                rankingPosition={rankingPosition}
              />
              <div className="flex flex-col gap-1.5 min-w-0">
                <p className="text-base font-semibold text-white truncate">{name}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={isActive ? "success" : "default"} size="sm">
                    {isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* ─── Información deportiva ──────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
                Información deportiva
              </h3>

              {sportStateError ? (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {sportStateError}
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-brand-muted">Categoría</span>
                    {sportStateLoading ? (
                      <SkeletonBar width="w-8" />
                    ) : (
                      <span className="text-white/60">{sportCategory ?? "—"}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-brand-muted">Puntos actuales</span>
                    {sportStateLoading ? (
                      <SkeletonBar width="w-6" />
                    ) : (
                      <span className="text-white/60">{sportPoints === null ? "—" : sportPoints}</span>
                    )}
                  </div>
                </>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-muted">Partidos jugados</span>
                {matchesPlayedLoading ? (
                  <SkeletonBar width="w-6" />
                ) : (
                  <span className="text-white/60">{matchesPlayed === null ? "—" : matchesPlayed}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-muted">Ranking</span>
                {sportStateLoading ? (
                  <SkeletonBar width="w-8" />
                ) : (
                  <span className="text-white/60">{rankingPosition != null ? `#${rankingPosition}` : "—"}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-muted">Fecha de ingreso</span>
                <span className="text-white">{formatDate(member.joined_at)}</span>
              </div>

              {/* Solo disponibles una vez que el jugador tiene estado
                  deportivo (club ya configurado) — si sportCategory sigue
                  null tras cargar, el club aún no tiene
                  default_player_category y no hay nada que ajustar. Durante
                  la carga se reserva el mismo espacio con skeletons — los
                  botones reales nunca quedan disponibles antes de tiempo. */}
              {sportStateLoading ? (
                <div className="flex items-center gap-2 pt-1">
                  <SkeletonBar width="w-[104px]" height="h-8" rounded="rounded-xl" />
                  <SkeletonBar width="w-[130px]" height="h-8" rounded="rounded-xl" />
                </div>
              ) : (
                !sportStateError &&
                sportCategory !== null && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setAdjustPointsOpen(true)}>
                      Ajustar puntos
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setChangeCategoryOpen(true)}>
                      Cambiar categoría
                    </Button>
                  </div>
                )
              )}
            </div>

            {/* ─── Contacto ───────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Contacto</h3>

              {/* Correo/WhatsApp en una sola fila — correo como texto plano
                  (nunca clicable, sin mailto:, sin decoración de enlace),
                  truncado si es largo; el botón nunca pierde su ancho
                  natural. flex-wrap: en mobile, si no caben lado a lado,
                  el botón baja a su propia línea en vez de desbordar. */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {emailLoading ? (
                  <SkeletonBar width="w-32" />
                ) : (
                  <span className="text-sm text-white/60 truncate min-w-0">{email ?? "—"}</span>
                )}

                {/* Solo si hay teléfono almacenado — jugadores legacy (antes
                    del requisito obligatorio) pueden no tenerlo todavía;
                    nunca se inventa un número ni un país (ver
                    toWhatsAppLink). window.open (no <a> envolviendo el
                    botón) para no anidar dos elementos interactivos. */}
                {phone && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => window.open(toWhatsAppLink(phone), "_blank", "noopener,noreferrer")}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Contactar por WhatsApp
                  </Button>
                )}
              </div>
            </div>

            {/* Future sections (historial de reservas, ranking interno,
                torneos/clínicas inscritas, estadísticas) will be added here
                as additional sibling blocks — not implemented yet. */}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {error}
              </p>
            )}
          </div>

          {/* ─── Acciones ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-white/10 shrink-0">
            <Button
              type="button"
              variant={isActive ? "danger" : "secondary"}
              loading={togglePending}
              onClick={() => setConfirmOpen(true)}
            >
              {isActive ? "Desactivar jugador" : "Activar miembro"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={isActive ? "Desactivar jugador" : "Activar miembro"}
        message={
          isActive
            ? "Este jugador perderá acceso al club. Sus reservas futuras propias serán canceladas y dejará de participar en reservas futuras creadas por otros jugadores. Su historial se conservará."
            : "¿Deseas activar a este miembro?\nVolverá a tener acceso como jugador activo del club."
        }
        confirmLabel={isActive ? "Desactivar jugador" : "Activar miembro"}
        confirmVariant={isActive ? "danger" : "success"}
        loading={togglePending}
        onConfirm={handleConfirmToggle}
        onCancel={() => setConfirmOpen(false)}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />

      {adjustPointsOpen && sportCategory !== null && sportPoints !== null && (
        <AdjustPlayerPointsModal
          clubId={clubId}
          clubSlug={clubSlug}
          clubMemberId={member.id}
          playerName={name}
          category={sportCategory}
          currentPoints={sportPoints}
          onClose={() => setAdjustPointsOpen(false)}
          onSuccess={(newTotal) => {
            setSportPoints(newTotal);
            setAdjustPointsOpen(false);
            setToastMessage("Puntos actualizados correctamente");
            onMutationSuccess?.();
          }}
        />
      )}

      {changeCategoryOpen && (
        <ChangePlayerCategoryModal
          clubId={clubId}
          clubSlug={clubSlug}
          clubMemberId={member.id}
          playerName={name}
          currentCategory={sportCategory}
          categories={sportCategories}
          onClose={() => setChangeCategoryOpen(false)}
          onSuccess={(newCategory) => {
            setSportCategory(newCategory);
            setSportPoints(0);
            setChangeCategoryOpen(false);
            setToastMessage("Categoría actualizada correctamente");
            // Same background-refresh pattern as handleConfirmToggle above —
            // the grid behind this modal is filterable by category now, so
            // it needs a fresh server read to drop this member if they no
            // longer match the selected filter.
            router.refresh();
            onMutationSuccess?.();
          }}
        />
      )}
    </>
  );
}
