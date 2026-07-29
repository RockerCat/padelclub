"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Globe, Lock, Pencil, X } from "lucide-react";
import { Badge, Button, ConfirmDialog, Toast } from "@/components/ui";
import { TournamentForm } from "../TournamentForm";
import {
  cancelTournament,
  closeTournamentRegistration,
  openTournamentRegistration,
  updateTournament,
} from "../actions";
import {
  tournamentCategoryLabel,
  tournamentStatusBadgeVariant,
  tournamentStatusLabel,
  tournamentVisibilityLabel,
} from "@/lib/tournamentLabels";
import { EntriesSection } from "@/components/tournaments/EntriesSection";
import { BracketSection } from "@/components/tournaments/BracketSection";
import type { TournamentEntriesCapacity, TournamentEntryWithMembers } from "@/lib/tournamentEntries";
import type { BracketRound } from "@/lib/tournamentBracket";
import type { Tournament, SportCategory } from "@/types/database";

interface TournamentDetailActionsProps {
  tournament: Tournament;
  categories: Pick<SportCategory, "code" | "sort_order">[];
  clubSlug: string;
  clubId: string;
  entries: TournamentEntryWithMembers[];
  entriesError: string | null;
  capacity: TournamentEntriesCapacity;
  rounds: BracketRound[];
  bracketError: string | null;
  role: "OWNER" | "ADMIN";
  ownClubMemberId: string;
  ownUserId: string;
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

type PendingTransition = "open" | "close" | "cancel" | null;

export function TournamentDetailActions({
  tournament: initialTournament,
  categories,
  clubSlug,
  clubId,
  entries,
  entriesError,
  capacity,
  rounds,
  bracketError,
  role,
  ownClubMemberId,
  ownUserId,
}: TournamentDetailActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createdFlag = searchParams.get("created") === "1";

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

  const [editing, setEditing] = useState(false);
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
      router.replace(`/${clubSlug}/admin/tournaments/${initialTournament.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boundUpdate = updateTournament.bind(null, clubId, tournament.id, clubSlug);

  const canEdit = tournament.status === "draft" || tournament.status === "registration_open";
  const canOpenRegistration = tournament.status === "draft";
  const canCloseRegistration = tournament.status === "registration_open";
  const canCancel = ["draft", "registration_open", "registration_closed"].includes(tournament.status);

  function handleEditSuccess(updated: Tournament | undefined) {
    setEditing(false);
    if (updated) setTournament(updated);
    setToastMessage("Cambios guardados correctamente");
    router.refresh();
  }

  function handleConfirmTransition() {
    if (!confirming) return;
    setActionError(null);
    startTransition(async () => {
      const result =
        confirming === "open"
          ? await openTournamentRegistration(clubId, tournament.id, clubSlug)
          : confirming === "close"
          ? await closeTournamentRegistration(clubId, tournament.id, clubSlug)
          : await cancelTournament(clubId, tournament.id, clubSlug);

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
        "Al abrir las inscripciones, la categoría, el tamaño del cuadro y la fecha de apertura ya no podrán modificarse.",
      confirmLabel: "Abrir inscripciones",
      confirmVariant: "primary",
    },
    close: {
      title: "Cerrar inscripciones",
      message:
        "Al cerrar las inscripciones ya no se podrán registrar nuevas parejas. Después podrás generar el cuadro del torneo.",
      confirmLabel: "Cerrar inscripciones",
      confirmVariant: "primary",
    },
    cancel: {
      title: "¿Cancelar este torneo?",
      message:
        "Esta acción conservará el torneo como historial, pero no podrá continuar su operación.",
      confirmLabel: "Cancelar torneo",
      confirmVariant: "danger",
    },
  };

  return (
    <>
      <Link
        href={`/${clubSlug}/admin/tournaments`}
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Torneos
      </Link>

      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
            <Badge variant={tournamentStatusBadgeVariant(tournament.status)} size="sm">
              {tournamentStatusLabel(tournament.status)}
            </Badge>
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

        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </Button>
          )}
          {canOpenRegistration && (
            <Button
              size="sm"
              onClick={() => {
                setActionError(null);
                setConfirming("open");
              }}
            >
              Abrir inscripciones
            </Button>
          )}
          {canCloseRegistration && (
            <Button
              size="sm"
              onClick={() => {
                setActionError(null);
                setConfirming("close");
              }}
            >
              Cerrar inscripciones
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setActionError(null);
                setConfirming("cancel");
              }}
            >
              Cancelar torneo
            </Button>
          )}
        </div>
      </div>

      {/* Summary — prepared visually for future blocks (Inscripciones, Cuadro,
          Partidos, Canchas, Resultados) without pre-building empty tabs or
          "próximamente" placeholders (spec explicitly prefers this). */}
      <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-3xl">
        <div>
          <p className="text-xs text-brand-muted mb-1">Categoría</p>
          <p className="text-sm text-white font-medium">
            {tournamentCategoryLabel(tournament.category, tournament.secondary_category)}
          </p>
        </div>
        <div>
          <p className="text-xs text-brand-muted mb-1">Tamaño del cuadro</p>
          <p className="text-sm text-white font-medium">{tournament.bracket_size} parejas</p>
        </div>
        <div>
          <p className="text-xs text-brand-muted mb-1">Inicio</p>
          <p className="text-sm text-white font-medium">{formatDateTime(tournament.starts_at)}</p>
        </div>
        <div>
          <p className="text-xs text-brand-muted mb-1">Fin</p>
          <p className="text-sm text-white font-medium">{formatDateTime(tournament.ends_at)}</p>
        </div>
        <div>
          <p className="text-xs text-brand-muted mb-1">Apertura de inscripciones</p>
          <p className="text-sm text-white font-medium">{formatDateTime(tournament.registration_opens_at)}</p>
        </div>
        <div>
          <p className="text-xs text-brand-muted mb-1">Cierre de inscripciones</p>
          <p className="text-sm text-white font-medium">{formatDateTime(tournament.registration_closes_at)}</p>
        </div>
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

      <div className="mt-8">
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
            ownFullName={null}
            ownAvatarUrl={null}
            ownCategory={null}
            revalidatePaths={[`/${clubSlug}/admin/tournaments/${tournament.id}`]}
          />
        )}
      </div>

      <div className="mt-8">
        {bracketError ? (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-3xl">
            {bracketError}
          </p>
        ) : (
          <BracketSection
            tournament={tournament}
            rounds={rounds}
            capacity={capacity}
            isAdmin
            revalidatePaths={[`/${clubSlug}/admin/tournaments/${tournament.id}`]}
          />
        )}
      </div>

      {editing && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[400]"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setEditing(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
            <div
              className="pointer-events-auto w-full md:w-[640px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
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
                  tournament={tournament}
                  categories={categories}
                  action={boundUpdate}
                  onSuccess={handleEditSuccess}
                  onCancel={() => setEditing(false)}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {confirming && (
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

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}
