import { Badge } from "@/components/ui";
import { PairMemberSlot } from "./PairMemberSlot";
import type { TournamentEntryWithMembers } from "@/lib/tournamentEntries";

const ENTRY_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  withdrawn: "Retirada",
};

const ENTRY_STATUS_VARIANT: Record<string, "success" | "warning" | "default"> = {
  pending: "warning",
  confirmed: "success",
  withdrawn: "default",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

interface EntryCardProps {
  entry: TournamentEntryWithMembers;
  isOwn?: boolean;
  actions?: React.ReactNode;
}

export function EntryCard({ entry, isOwn, actions }: EntryCardProps) {
  const [memberOne, memberTwo] = entry.members;

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <PairMemberSlot member={memberOne} category={entry.category} />
          <PairMemberSlot member={memberTwo} category={entry.category} />
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={ENTRY_STATUS_VARIANT[entry.status] ?? "default"} size="sm">
            {ENTRY_STATUS_LABEL[entry.status] ?? entry.status}
          </Badge>
          {isOwn && (
            <span className="text-[10px] font-medium text-brand-muted">Tu pareja</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
        <span className="text-xs text-brand-muted">Registrada el {formatDate(entry.created_at)}</span>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
