import { Badge } from "@/components/ui";
import { PairMemberSlot } from "./PairMemberSlot";
import { cn } from "@/lib/utils/cn";
import type { TournamentEntryWithMembers } from "@/lib/tournamentEntries";

const ENTRY_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  withdrawn: "Retirada",
  rejected: "Rechazada",
};

const ENTRY_STATUS_VARIANT: Record<string, "success" | "warning" | "default" | "danger"> = {
  pending: "warning",
  confirmed: "success",
  withdrawn: "default",
  rejected: "danger",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

interface EntryCardProps {
  entry: TournamentEntryWithMembers;
  isOwn?: boolean;
  actions?: React.ReactNode;
  // "Miembro del club" — mismo modal/estado que Ranking (useMemberModal),
  // nunca una copia. Siblings de `actions` (Confirmar/Rechazar/Retirar):
  // nunca anidados, así que no hay riesgo de botón dentro de botón.
  avatarsClickable: boolean;
  onSelectMember: (clubMemberId: string) => void;
  loadingMemberId: string | null;
}

export function EntryCard({ entry, isOwn, actions, avatarsClickable, onSelectMember, loadingMemberId }: EntryCardProps) {
  const [memberOne, memberTwo] = entry.members;
  // Pendiente = requiere una acción inmediata del organizador (Confirmar/
  // Rechazar) — tinte ámbar muy sutil sobre el mismo fondo oscuro de
  // siempre (nunca lo reemplaza), borde fino apenas tintado, sin sombra
  // ni animación. "Requiere atención", no "error" — el resto de estados
  // (confirmed/withdrawn/rejected) conserva bg-brand-surface tal cual.
  const isPending = entry.status === "pending";

  return (
    <div
      className={cn("border rounded-2xl p-4 flex flex-col gap-3", isPending ? "border-amber-500/20" : "bg-brand-surface border-white/10")}
      style={isPending ? { backgroundColor: "color-mix(in srgb, var(--color-brand-surface), #f59e0b 6%)" } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <PairMemberSlot
            member={memberOne}
            category={entry.category}
            avatarsClickable={avatarsClickable}
            onSelectMember={onSelectMember}
            loadingMemberId={loadingMemberId}
          />
          <PairMemberSlot
            member={memberTwo}
            category={entry.category}
            avatarsClickable={avatarsClickable}
            onSelectMember={onSelectMember}
            loadingMemberId={loadingMemberId}
          />
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={ENTRY_STATUS_VARIANT[entry.status] ?? "default"} size="sm">
            {ENTRY_STATUS_LABEL[entry.status] ?? entry.status}
          </Badge>
          {entry.status === "confirmed" && (
            <span className="text-[10px] font-medium text-brand-muted">{entry.points} pts</span>
          )}
          {isOwn && (
            <span className="text-[10px] font-medium text-brand-muted">Tu dupla</span>
          )}
        </div>
      </div>

      {entry.status === "rejected" && entry.rejection_reason && (
        <p className="text-xs text-red-400/90 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {entry.rejection_reason}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
        <span className="text-xs text-brand-muted">Registrada el {formatDate(entry.created_at)}</span>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
