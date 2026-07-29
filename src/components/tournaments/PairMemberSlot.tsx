import { PlayerSportAvatar } from "@/components/players/PlayerSportAvatar";

export interface PairMemberSlotPlayer {
  club_member_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

// Shared by EntryCard (Bloque 2.2) and MatchCard (Bloque 2.3) — one pair
// always shows its two members the same way, never two slightly different
// versions of the same presentation. `member` undefined means RLS hid that
// row (documented tradeoff, see tournamentEntries.ts) — never a raw UUID,
// never a crash, just an honest placeholder.
export function PairMemberSlot({ member, category }: { member: PairMemberSlotPlayer | undefined; category: string }) {
  if (!member) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 shrink-0" />
        <span className="text-sm text-brand-muted truncate">Por confirmar</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <PlayerSportAvatar
        player={{ id: member.club_member_id, full_name: member.full_name, avatar_url: member.avatar_url }}
        size="sm"
        sportCategory={category}
      />
      <span className="text-sm text-white truncate">{member.full_name ?? "Jugador"}</span>
    </div>
  );
}
