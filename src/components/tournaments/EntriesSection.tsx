"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, X } from "lucide-react";
import { Button, ConfirmDialog, Toast } from "@/components/ui";
import { EntryCard } from "./EntryCard";
import { RegisterEntryModal } from "./RegisterEntryModal";
import { ReplaceMemberModal } from "./ReplaceMemberModal";
import {
  confirmTournamentEntryAction,
  rejectTournamentEntryAction,
  withdrawTournamentEntryAction,
} from "@/lib/tournamentEntryActions";
import { isOwnEntry, type TournamentEntriesCapacity, type TournamentEntryWithMembers } from "@/lib/tournamentEntries";
import { tournamentCategoryLabel } from "@/lib/tournamentLabels";
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
}

type PendingAction = { type: "confirm" | "withdraw"; entryId: string } | null;
type RejectingEntry = { entryId: string } | null;

function CapacityBar({ capacity }: { capacity: TournamentEntriesCapacity }) {
  const pct = capacity.total > 0 ? Math.min(100, Math.round((capacity.occupied / capacity.total) * 100)) : 0;
  const full = capacity.occupied >= capacity.total;
  const almostFull = !full && capacity.occupied >= capacity.total - 1;
  const barColor = full ? "bg-red-400" : almostFull ? "bg-amber-400" : "bg-brand-primary";

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-white">
        {capacity.occupied} de {capacity.total} parejas inscritas
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
}: EntriesSectionProps) {
  const router = useRouter();
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const [entries, setEntries] = useState(initialEntries);
  const [registering, setRegistering] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [rejecting, setRejecting] = useState<RejectingEntry>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [replacingEntry, setReplacingEntry] = useState<TournamentEntryWithMembers | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const registeredMemberIds = entries
    .filter((e) => e.status === "pending" || e.status === "confirmed")
    .flatMap((e) => e.members.map((m) => m.club_member_id));

  const full = capacity.occupied >= capacity.total;
  // El organizador puede seguir registrando parejas directamente durante
  // registration_closed/in_progress ("agregar nuevas duplas durante el
  // torneo", sin restricción de cupo fuera de registration_open) — un
  // jugador solo puede inscribirse mientras las inscripciones están
  // abiertas.
  const canPlayerRegister = tournament.status === "registration_open" && !full;
  const canAdminRegister =
    tournament.status === "registration_open"
      ? !full
      : tournament.status === "registration_closed" || tournament.status === "in_progress";
  const canConfirmOrRejectStatus = tournament.status === "registration_open" || tournament.status === "registration_closed";
  const canWithdrawStatus = tournament.status === "registration_open" || tournament.status === "registration_closed";

  const ownActiveEntry = entries.find(
    (e) => (e.status === "pending" || e.status === "confirmed") && isOwnEntry(e, ownUserId, ownClubMemberId)
  );
  const ownAnyEntry = entries.find((e) => isOwnEntry(e, ownUserId, ownClubMemberId));

  function handleRegisterSuccess(entry: TournamentEntryRow | undefined) {
    setRegistering(false);
    setToastMessage(
      isAdmin ? "Pareja registrada correctamente" : "Tu inscripción fue enviada y está pendiente de aprobación."
    );
    if (entry) {
      // Optimistic local append so the new entry is visible immediately —
      // members will resolve fully on the next router.refresh() (server
      // re-fetch), consistent with how the rest of this section stays in
      // sync with the server.
      setEntries((prev) => [...prev, { ...entry, members: [] }]);
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
      setToastMessage(pendingAction.type === "confirm" ? "Pareja confirmada correctamente" : "Inscripción retirada correctamente");
      router.refresh();
    });
  }

  function entryActions(entry: TournamentEntryWithMembers) {
    const isMine = isOwnEntry(entry, ownUserId, ownClubMemberId);
    const showConfirm = isAdmin && entry.status === "pending" && canConfirmOrRejectStatus;
    const showReject = isAdmin && entry.status === "pending" && canConfirmOrRejectStatus;
    const showWithdraw =
      canWithdrawStatus &&
      (entry.status === "pending" || entry.status === "confirmed") &&
      (isAdmin || isMine);
    // Reemplazo/corrección de integrante — solo sobre una pareja
    // confirmada, solo mientras el torneo está in_progress (backend:
    // replace_tournament_entry_member).
    const showReplace = isAdmin && entry.status === "confirmed" && tournament.status === "in_progress";

    if (!showConfirm && !showReject && !showWithdraw && !showReplace) return null;

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
        {showReplace && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setActionError(null);
              setReplacingEntry(entry);
            }}
          >
            Reemplazar integrante
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
  const withdrawn = entries.filter((e) => e.status === "withdrawn");
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
            Registrar pareja
          </Button>
        )}
      </div>

      <CapacityBar capacity={capacity} />

      {tournament.status === "draft" && (
        <p className="text-sm text-brand-muted bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          Abre las inscripciones para comenzar a registrar parejas.
        </p>
      )}

      {full && tournament.status === "registration_open" && (
        <p className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
          El torneo alcanzó su cupo máximo de parejas.
        </p>
      )}

      {/* PLAYER: own pending/withdrawn/rejected entry surfaced explicitly
          (never duplicated with the confirmed list below, which already
          shows a confirmed own entry tagged "Tu pareja"). */}
      {!isAdmin && ownAnyEntry && ownAnyEntry.status !== "confirmed" && (
        <div>
          <p className="text-xs font-medium text-brand-muted mb-2">Tu inscripción</p>
          <EntryCard entry={ownAnyEntry} isOwn actions={entryActions(ownAnyEntry)} />
        </div>
      )}

      {!isAdmin && !ownAnyEntry && (
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
          <EntryGroup title="Pendientes" entries={pending} entryActions={entryActions} emptyText={null} />
          <EntryGroup title="Confirmadas" entries={confirmed} entryActions={entryActions} ownUserId={ownUserId} ownClubMemberId={ownClubMemberId} emptyText={null} />
          <EntryGroup title="Rechazadas" entries={rejected} entryActions={entryActions} emptyText={null} />
          <EntryGroup title="Retiradas" entries={withdrawn} entryActions={entryActions} emptyText={null} />
          {entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-brand-muted" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">Aún no hay parejas inscritas</h3>
              <p className="text-sm text-brand-muted max-w-sm">
                {tournament.status === "registration_open"
                  ? "Todavía no hay parejas inscritas. Registra la primera pareja del torneo."
                  : "Cuando abras las inscripciones podrás registrar parejas para el torneo."}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-brand-muted">Parejas confirmadas</p>
          {confirmed.length === 0 ? (
            <p className="text-sm text-brand-muted">Aún no hay parejas confirmadas.</p>
          ) : (
            confirmed.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                isOwn={isOwnEntry(entry, ownUserId, ownClubMemberId)}
                actions={entryActions(entry)}
              />
            ))
          )}
        </div>
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

      {replacingEntry && (
        <ReplaceMemberModal
          clubId={tournament.club_id}
          tournamentEntryId={replacingEntry.id}
          category={tournament.category}
          secondaryCategory={tournament.secondary_category}
          members={replacingEntry.members}
          excludeClubMemberIds={registeredMemberIds}
          revalidatePaths={revalidatePaths}
          onClose={() => setReplacingEntry(null)}
          onSuccess={() => {
            setReplacingEntry(null);
            setToastMessage("Integrante reemplazado correctamente");
            router.refresh();
          }}
        />
      )}

      {pendingAction && (
        <ConfirmDialog
          open={!!pendingAction}
          title={pendingAction.type === "confirm" ? "¿Confirmar esta pareja?" : "¿Retirar esta inscripción?"}
          message={
            (pendingAction.type === "confirm"
              ? "La pareja quedará oficialmente inscrita en el torneo."
              : "La pareja dejará de ocupar un cupo en el torneo.") + (actionError ? `\n\n${actionError}` : "")
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
}: {
  title: string;
  entries: TournamentEntryWithMembers[];
  entryActions: (entry: TournamentEntryWithMembers) => React.ReactNode;
  ownUserId?: string;
  ownClubMemberId?: string;
  emptyText: string | null;
}) {
  if (entries.length === 0 && !emptyText) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-brand-muted">
        {title} ({entries.length})
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-brand-muted">{emptyText}</p>
      ) : (
        entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            isOwn={ownUserId && ownClubMemberId ? isOwnEntry(entry, ownUserId, ownClubMemberId) : false}
            actions={entryActions(entry)}
          />
        ))
      )}
    </div>
  );
}
