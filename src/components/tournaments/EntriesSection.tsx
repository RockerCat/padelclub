"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, X } from "lucide-react";
import { Button, ConfirmDialog, Toast } from "@/components/ui";
import { EntryCard } from "./EntryCard";
import { RegisterEntryModal } from "./RegisterEntryModal";
import type { PlayerComboboxCandidate } from "./PlayerCombobox";
import {
  confirmTournamentEntryAction,
  rejectTournamentEntryAction,
  withdrawTournamentEntryAction,
} from "@/lib/tournamentEntryActions";
import { isOwnEntry, type TournamentEntriesCapacity, type TournamentEntryWithMembers } from "@/lib/tournamentEntries";
import { tournamentCategoryLabel } from "@/lib/tournamentLabels";
import { cn } from "@/lib/utils/cn";
import type { Tournament, TournamentEntryRow } from "@/types/database";

interface EntriesSectionProps {
  tournament: Pick<Tournament, "id" | "club_id" | "category" | "secondary_category" | "max_pairs" | "status">;
  initialEntries: TournamentEntryWithMembers[];
  capacity: TournamentEntriesCapacity;
  role: "OWNER" | "ADMIN" | "PLAYER";
  ownClubMemberId: string;
  ownUserId: string;
  ownFullName: string | null;
  ownAvatarUrl: string | null;
  // null = no sport state resolvable for this category at all — PLAYER-only
  // eligibility gate (see Bloque 2.2 spec §18); backend does not enforce
  // category matching itself (audited: register_tournament_entry only
  // freezes tournament.category onto the entry, never compares it against
  // either player's own sport state), so this is a client-side UX curation,
  // never a security boundary.
  ownCategory: string | null;
  revalidatePaths: string[];
  // Torneo "En curso" (TournamentDetailView): la Clasificación ya muestra
  // exactamente las mismas duplas confirmadas de forma más deportiva y
  // compacta, así que las tarjetas grandes dejan de ocupar el flujo
  // principal aquí — nunca se elimina el dato ni el componente, Pendientes/
  // Rechazadas/"Registrar dupla" siguen intactos (el organizador puede
  // seguir registrando duplas durante in_progress, ver canAdminRegister).
  hideConfirmedList?: boolean;
  // "Miembro del club" — mismo modal/estado que Ranking/Clasificación
  // (useMemberModal en TournamentDetailView), nunca una copia.
  avatarsClickable: boolean;
  onSelectMember: (clubMemberId: string) => void;
  loadingMemberId: string | null;
}

type PendingAction = { type: "confirm" | "withdraw"; entryId: string } | null;
type RejectingEntry = { entryId: string } | null;

function CapacityBar({ capacity }: { capacity: TournamentEntriesCapacity }) {
  const pct = capacity.total > 0 ? Math.min(100, Math.round((capacity.occupied / capacity.total) * 100)) : 0;
  const full = capacity.occupied >= capacity.total;
  const almostFull = !full && capacity.occupied >= capacity.total - 1;
  // Cupo completo es un estado de éxito (el torneo llenó su cupo), nunca
  // un error — mismo verde ya usado por Badge variant="success" en el
  // resto de Mi Pádel Club. Nunca rojo para representar "lleno".
  const barColor = full ? "bg-emerald-400" : almostFull ? "bg-amber-400" : "bg-brand-primary";

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-white flex items-center gap-2 flex-wrap">
        <span>
          {capacity.occupied} de {capacity.total} duplas inscritas
        </span>
        {full && <span className="text-xs font-medium text-emerald-400">Cupo completo</span>}
      </p>
      <div className="h-1.5 w-full max-w-xs rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EntriesSection({
  tournament,
  initialEntries,
  capacity,
  role,
  ownClubMemberId,
  ownUserId,
  ownFullName,
  ownAvatarUrl,
  ownCategory,
  revalidatePaths,
  hideConfirmedList = false,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: EntriesSectionProps) {
  const router = useRouter();
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const [entries, setEntries] = useState(initialEntries);
  // entries mirrors the initialEntries prop (fresh server data after
  // router.refresh()) but is also updated locally right after a
  // successful action — React's documented "adjusting state when a prop
  // changes" pattern (setState during render, not inside an effect) so a
  // completed server refetch always wins over any earlier optimistic
  // local update, exactly like TournamentDetailView already does for
  // `tournament`. Without this, entries stayed permanently disconnected
  // from initialEntries after the very first mount — router.refresh()
  // alone never reached the rendered UI.
  const [prevInitialEntries, setPrevInitialEntries] = useState(initialEntries);
  if (initialEntries !== prevInitialEntries) {
    setPrevInitialEntries(initialEntries);
    setEntries(initialEntries);
  }
  const [registering, setRegistering] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [rejecting, setRejecting] = useState<RejectingEntry>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const registeredMemberIds = entries
    .filter((e) => e.status === "pending" || e.status === "confirmed")
    .flatMap((e) => e.members.map((m) => m.club_member_id));

  // Única fuente de verdad de "cupo completo" — la misma que ya usa
  // CapacityBar (capacity.occupied/capacity.total) para la barra verde y
  // el texto "Cupo completo". canPlayerRegister/canAdminRegister deben
  // aplicar siempre `!full`, sin excepción por estado: el backend sigue
  // permitiendo a un ADMIN registrar más allá del cupo durante
  // registration_closed/in_progress (ver register_tournament_entry), pero
  // el botón ya no ofrece esa acción en la UI cuando el cupo está lleno —
  // solo oculta la entrada, nunca bloquea ni debilita esa validación real.
  const full = capacity.occupied >= capacity.total;
  // Un jugador solo puede inscribirse mientras las inscripciones están
  // abiertas; el organizador puede seguir registrando parejas durante
  // registration_closed/in_progress ("agregar nuevas duplas durante el
  // torneo") — ambos casos ahora exigen además que quede cupo disponible.
  const canPlayerRegister = tournament.status === "registration_open" && !full;
  const canAdminRegister =
    (tournament.status === "registration_open" ||
      tournament.status === "registration_closed" ||
      tournament.status === "in_progress") &&
    !full;
  const canConfirmOrRejectStatus = tournament.status === "registration_open" || tournament.status === "registration_closed";
  const canWithdrawStatus = tournament.status === "registration_open" || tournament.status === "registration_closed";

  // Únicamente pending/confirmed cuentan como "activa" — una inscripción
  // retirada o rechazada sigue existiendo (historial intacto en
  // entries/base de datos), pero deja de ser la inscripción vigente del
  // jugador: no debe seguir ocupando el bloque "Tu inscripción" ni bloquear
  // que vuelva a registrarse.
  const ownActiveEntry = entries.find(
    (e) => (e.status === "pending" || e.status === "confirmed") && isOwnEntry(e, ownUserId, ownClubMemberId)
  );

  function handleRegisterSuccess(entry: TournamentEntryRow | undefined, selectedMembers: PlayerComboboxCandidate[]) {
    setRegistering(false);
    setToastMessage(
      isAdmin ? "Dupla registrada correctamente" : "Tu inscripción fue enviada y está pendiente de aprobación."
    );
    if (entry) {
      // Optimistic local append so the new entry is visible immediately —
      // built with the two real players already selected in the modal
      // (name/avatar/category), never empty slots, so "Por confirmar"
      // never flashes even for the instant before router.refresh()
      // resolves. The prop-sync above then reconciles this with the
      // server's own authoritative row once the refetch lands.
      setEntries((prev) => [
        ...prev,
        {
          ...entry,
          members: selectedMembers.map((m) => ({
            club_member_id: m.club_member_id,
            profile_id: null,
            full_name: m.full_name,
            avatar_url: m.avatar_url,
            category: m.category,
          })),
        },
      ]);
    }
    router.refresh();
  }

  function handleConfirmAction() {
    if (!pendingAction) return;
    setActionError(null);
    startTransition(async () => {
      const result =
        pendingAction.type === "confirm"
          ? await confirmTournamentEntryAction(tournament.club_id, pendingAction.entryId, revalidatePaths)
          : await withdrawTournamentEntryAction(tournament.club_id, pendingAction.entryId, revalidatePaths);

      if (result.error) {
        setActionError(result.error);
        return;
      }

      if (result.entry) {
        setEntries((prev) => prev.map((e) => (e.id === result.entry!.id ? { ...e, ...result.entry! } : e)));
      }
      setPendingAction(null);
      setToastMessage(pendingAction.type === "confirm" ? "Dupla confirmada correctamente" : "Inscripción retirada correctamente");
      router.refresh();
    });
  }

  function entryActions(entry: TournamentEntryWithMembers) {
    const isMine = isOwnEntry(entry, ownUserId, ownClubMemberId);
    const showConfirm = isAdmin && entry.status === "pending" && canConfirmOrRejectStatus;
    const showReject = isAdmin && entry.status === "pending" && canConfirmOrRejectStatus;
    // El organizador nunca ve "Retirar" junto a "Confirmar"/"Rechazar" para
    // la misma dupla pendiente — Confirmar/Rechazar ya cubren resolverla,
    // así que para el organizador Retirar solo aparece una vez confirmada.
    // El propio jugador conserva "Retirar" en ambos estados (pending y
    // confirmed) — es su única acción de autoservicio para cancelar su
    // propia solicitud antes o después de que el organizador la resuelva.
    const showWithdraw =
      canWithdrawStatus &&
      (isAdmin ? entry.status === "confirmed" : isMine && (entry.status === "pending" || entry.status === "confirmed"));

    if (!showConfirm && !showReject && !showWithdraw) return null;

    return (
      <>
        {showConfirm && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setActionError(null);
              setPendingAction({ type: "confirm", entryId: entry.id });
            }}
          >
            Confirmar
          </Button>
        )}
        {showReject && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setActionError(null);
              setRejectReason("");
              setRejecting({ entryId: entry.id });
            }}
          >
            Rechazar
          </Button>
        )}
        {showWithdraw && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setActionError(null);
              setPendingAction({ type: "withdraw", entryId: entry.id });
            }}
          >
            Retirar
          </Button>
        )}
      </>
    );
  }

  function handleReject() {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      setActionError("Escribe un motivo para el rechazo.");
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const result = await rejectTournamentEntryAction(tournament.club_id, rejecting.entryId, rejectReason.trim(), revalidatePaths);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      if (result.entry) {
        setEntries((prev) => prev.map((e) => (e.id === result.entry!.id ? { ...e, ...result.entry! } : e)));
      }
      setRejecting(null);
      setToastMessage("Solicitud rechazada correctamente");
      router.refresh();
    });
  }

  const confirmed = entries.filter((e) => e.status === "confirmed");
  const pending = entries.filter((e) => e.status === "pending");
  // Retiradas ya no se listan aquí — TournamentDetailView las muestra en
  // un acordeón de historial en la columna derecha (OWNER/ADMIN), fuera
  // de la lista principal de inscripciones activas.
  const rejected = entries.filter((e) => e.status === "rejected");

  // A player is eligible when their own current category is either of the
  // two categories the tournament accepts (single or combined) — the exact
  // H+L/L+H/L+L pairing rule between the TWO players of a pair is not
  // implemented yet; this is only "can this player see a register action at
  // all", never the final composition check.
  const ownCategoryMatches =
    !!ownCategory && (ownCategory === tournament.category || ownCategory === tournament.secondary_category);

  const eligibleToRegister = isAdmin ? canAdminRegister : (canPlayerRegister && ownCategoryMatches && !ownActiveEntry);

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-white">Inscripciones</h2>
        {isAdmin && eligibleToRegister && (
          <Button size="sm" onClick={() => setRegistering(true)}>
            <Plus className="w-3.5 h-3.5" />
            Registrar dupla
          </Button>
        )}
      </div>

      <CapacityBar capacity={capacity} />

      {tournament.status === "draft" && (
        <p className="text-sm text-brand-muted bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          Abre las inscripciones para comenzar a registrar duplas.
        </p>
      )}

      {full && tournament.status === "registration_open" && (
        <p className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
          El torneo alcanzó su cupo máximo de duplas.
        </p>
      )}

      {/* PLAYER: own pending entry surfaced explicitly (never duplicated
          with the confirmed list below, which already shows a confirmed
          own entry tagged "Tu dupla"). A withdrawn/rejected own entry is
          never shown here — it stays in entries/history untouched, it
          simply stops being the player's "active" one. */}
      {!isAdmin && ownActiveEntry && ownActiveEntry.status !== "confirmed" && (
        <div>
          <p className="text-xs font-medium text-brand-muted mb-2">Tu inscripción</p>
          <EntryCard
            entry={ownActiveEntry}
            isOwn
            actions={entryActions(ownActiveEntry)}
            avatarsClickable={avatarsClickable}
            onSelectMember={onSelectMember}
            loadingMemberId={loadingMemberId}
          />
        </div>
      )}

      {!isAdmin && !ownActiveEntry && (
        <>
          {eligibleToRegister ? (
            <Button size="sm" onClick={() => setRegistering(true)} className="self-start">
              <Plus className="w-3.5 h-3.5" />
              Inscribirme
            </Button>
          ) : canPlayerRegister && !ownCategoryMatches ? (
            <p className="text-sm text-brand-muted bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              No perteneces a la categoría {tournamentCategoryLabel(tournament.category, tournament.secondary_category)} de
              este torneo, así que no puedes inscribirte.
            </p>
          ) : null}
        </>
      )}

      {isAdmin ? (
        <div className="flex flex-col gap-5">
          <EntryGroup
            title="Pendientes"
            entries={pending}
            entryActions={entryActions}
            emptyText={null}
            highlight
            avatarsClickable={avatarsClickable}
            onSelectMember={onSelectMember}
            loadingMemberId={loadingMemberId}
          />
          {!hideConfirmedList && (
            <EntryGroup
              title="Confirmadas"
              entries={confirmed}
              entryActions={entryActions}
              ownUserId={ownUserId}
              ownClubMemberId={ownClubMemberId}
              emptyText={null}
              avatarsClickable={avatarsClickable}
              onSelectMember={onSelectMember}
              loadingMemberId={loadingMemberId}
            />
          )}
          <EntryGroup
            title="Rechazadas"
            entries={rejected}
            entryActions={entryActions}
            emptyText={null}
            avatarsClickable={avatarsClickable}
            onSelectMember={onSelectMember}
            loadingMemberId={loadingMemberId}
          />
          {pending.length === 0 && confirmed.length === 0 && rejected.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-brand-muted" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">Aún no hay duplas inscritas</h3>
              <p className="text-sm text-brand-muted max-w-sm">
                {tournament.status === "registration_open"
                  ? "Todavía no hay duplas inscritas. Registra la primera dupla del torneo."
                  : "Cuando abras las inscripciones podrás registrar duplas para el torneo."}
              </p>
            </div>
          )}
        </div>
      ) : (
        !hideConfirmedList && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-brand-muted">Duplas confirmadas</p>
            {confirmed.length === 0 ? (
              <p className="text-sm text-brand-muted">Aún no hay duplas confirmadas.</p>
            ) : (
              confirmed.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  isOwn={isOwnEntry(entry, ownUserId, ownClubMemberId)}
                  actions={entryActions(entry)}
                  avatarsClickable={avatarsClickable}
                  onSelectMember={onSelectMember}
                  loadingMemberId={loadingMemberId}
                />
              ))
            )}
          </div>
        )
      )}

      {registering && (
        <RegisterEntryModal
          clubId={tournament.club_id}
          tournamentId={tournament.id}
          category={tournament.category}
          secondaryCategory={tournament.secondary_category}
          excludeClubMemberIds={registeredMemberIds}
          revalidatePaths={revalidatePaths}
          mode={
            isAdmin
              ? { type: "admin" }
              : { type: "player", ownClubMemberId, ownFullName, ownAvatarUrl, ownCategory }
          }
          onClose={() => setRegistering(false)}
          onSuccess={handleRegisterSuccess}
        />
      )}

      {pendingAction && (
        <ConfirmDialog
          open={!!pendingAction}
          title={pendingAction.type === "confirm" ? "¿Confirmar esta dupla?" : "¿Retirar esta inscripción?"}
          message={
            (pendingAction.type === "confirm"
              ? "La dupla quedará oficialmente inscrita en el torneo."
              : "La dupla dejará de ocupar un cupo en el torneo.") + (actionError ? `\n\n${actionError}` : "")
          }
          confirmLabel={pendingAction.type === "confirm" ? "Confirmar" : "Retirar inscripción"}
          confirmVariant={pendingAction.type === "confirm" ? "primary" : "danger"}
          loading={isPending}
          onConfirm={handleConfirmAction}
          onCancel={() => {
            setPendingAction(null);
            setActionError(null);
          }}
        />
      )}

      {rejecting && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[400]"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setRejecting(null)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
            <div
              className="pointer-events-auto w-full md:w-[480px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <h2 className="text-base font-semibold text-white">Rechazar solicitud</h2>
                <button
                  type="button"
                  onClick={() => setRejecting(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-5 flex flex-col gap-3">
                <label className="text-sm font-medium text-white/80">Motivo del rechazo</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Explica brevemente por qué se rechaza esta solicitud..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
                />
                {actionError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    {actionError}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 px-5 py-4 border-t border-white/10">
                <Button variant="danger" loading={isPending} onClick={handleReject}>
                  Rechazar solicitud
                </Button>
                <Button variant="secondary" disabled={isPending} onClick={() => setRejecting(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}

function EntryGroup({
  title,
  entries,
  entryActions,
  ownUserId,
  ownClubMemberId,
  emptyText,
  // Solo el grupo "Pendientes" lo activa (ver el llamador más abajo) —
  // refuerzo puramente tipográfico/color, nunca una condición nueva de
  // negocio: cuando no hay pendientes, no hay nada que reforzar.
  highlight,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: {
  title: string;
  entries: TournamentEntryWithMembers[];
  entryActions: (entry: TournamentEntryWithMembers) => React.ReactNode;
  ownUserId?: string;
  ownClubMemberId?: string;
  emptyText: string | null;
  highlight?: boolean;
  avatarsClickable: boolean;
  onSelectMember: (clubMemberId: string) => void;
  loadingMemberId: string | null;
}) {
  if (entries.length === 0 && !emptyText) return null;
  const emphasize = highlight && entries.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        {emphasize && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />}
        <p className={cn("text-xs", emphasize ? "font-semibold text-amber-400" : "font-medium text-brand-muted")}>
          {title} ({entries.length})
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-brand-muted">{emptyText}</p>
      ) : (
        entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            isOwn={ownUserId && ownClubMemberId ? isOwnEntry(entry, ownUserId, ownClubMemberId) : false}
            actions={entryActions(entry)}
            avatarsClickable={avatarsClickable}
            onSelectMember={onSelectMember}
            loadingMemberId={loadingMemberId}
          />
        ))
      )}
    </div>
  );
}
