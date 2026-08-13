import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../../lib/theme";
import { PlayerAvatar } from "../PlayerAvatar";
import type { TournamentEntryWithMembers } from "../../lib/tournamentEntries";

const ENTRY_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  withdrawn: "Retirada",
  rejected: "Rechazada",
};

const ENTRY_STATUS_COLOR: Record<string, string> = {
  pending: theme.colors.warning,
  confirmed: theme.colors.success,
  withdrawn: theme.colors.muted,
  rejected: theme.colors.danger,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// Traducción 1:1 de EntryCard.tsx (app web) — mismo tinte ámbar sutil
// para pendientes, mismos 2 slots de integrante (o "Por confirmar" si
// RLS ocultó la fila), mismo footer "Registrada el {fecha}" + acciones.
export function EntryCard({
  entry,
  isOwn,
  actions,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: {
  entry: TournamentEntryWithMembers;
  isOwn?: boolean;
  actions?: ReactNode;
  avatarsClickable?: boolean;
  onSelectMember?: (clubMemberId: string) => void;
  loadingMemberId?: string | null;
}) {
  const isPending = entry.status === "pending";
  const [memberOne, memberTwo] = entry.members;

  return (
    <View style={[styles.card, isPending && styles.cardPending]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 8 }}>
          <MemberSlot member={memberOne} avatarsClickable={avatarsClickable} onSelectMember={onSelectMember} loadingMemberId={loadingMemberId} />
          <MemberSlot member={memberTwo} avatarsClickable={avatarsClickable} onSelectMember={onSelectMember} loadingMemberId={loadingMemberId} />
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={[styles.statusBadge, { color: ENTRY_STATUS_COLOR[entry.status] ?? theme.colors.muted }]}>
            {ENTRY_STATUS_LABEL[entry.status] ?? entry.status}
          </Text>
          {entry.status === "confirmed" && <Text style={styles.points}>{entry.points} pts</Text>}
          {isOwn && <Text style={styles.ownLabel}>Tu dupla</Text>}
        </View>
      </View>

      {entry.status === "rejected" && entry.rejection_reason && (
        <View style={styles.rejectionBox}>
          <Text style={styles.rejectionText}>{entry.rejection_reason}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Registrada el {formatDate(entry.created_at)}</Text>
        {actions && <View style={styles.actionsRow}>{actions}</View>}
      </View>
    </View>
  );
}

function MemberSlot({
  member,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: {
  member: TournamentEntryWithMembers["members"][number] | undefined;
  avatarsClickable?: boolean;
  onSelectMember?: (clubMemberId: string) => void;
  loadingMemberId?: string | null;
}) {
  if (!member) {
    return (
      <View style={styles.memberRow}>
        <View style={styles.placeholderAvatar} />
        <Text style={styles.placeholderText}>Por confirmar</Text>
      </View>
    );
  }
  const clickable = avatarsClickable && !!onSelectMember;
  const loading = loadingMemberId === member.club_member_id;
  return (
    <View style={styles.memberRow}>
      <TouchableOpacity disabled={!clickable} onPress={() => onSelectMember?.(member.club_member_id)} activeOpacity={0.7}>
        {loading ? (
          <View style={styles.placeholderAvatar}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : (
          <PlayerAvatar player={{ id: member.club_member_id, full_name: member.full_name, avatar_url: member.avatar_url }} size="sm" />
        )}
      </TouchableOpacity>
      <Text style={styles.memberName} numberOfLines={1}>
        {member.full_name ?? "Sin nombre"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  cardPending: { borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.06)" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { flex: 1, fontSize: 13, color: theme.colors.white, flexShrink: 1 },
  placeholderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { fontSize: 13, color: theme.colors.muted, fontStyle: "italic" },
  statusBadge: { fontSize: 11, fontWeight: "700" },
  points: { fontSize: 10, color: theme.colors.muted },
  ownLabel: { fontSize: 10, fontWeight: "500", color: theme.colors.muted },
  rejectionBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.2)",
    backgroundColor: "rgba(248,113,113,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rejectionText: { fontSize: 12, color: "#fca5a5" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  footerText: { fontSize: 11, color: theme.colors.muted },
  actionsRow: { flexDirection: "row", gap: 8 },
});
