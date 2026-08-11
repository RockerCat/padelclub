import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Repeat } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";
import { pairLabel } from "../../lib/tournaments";
import { setTournamentEntryPoints } from "../../lib/tournamentEntryActions";
import { computeTournamentClassification, type TournamentEntryWithMembers } from "../../lib/tournamentEntries";
import { PlayerAvatar } from "../PlayerAvatar";
import { ReplaceMemberModal } from "./ReplaceMemberModal";
import type { TournamentEntryRow } from "../../types/domain";

const MEDAL = ["🥇", "🥈", "🥉"];

// Traducción 1:1 de ClassificationSection.tsx (app web) — misma lista
// (sin split top-3/resto), mismo cálculo de posición vía
// computeTournamentClassification (ya portado), mismo empate absoluto
// oculta medallas (posición cae a orden simple, nunca muta la posición
// real), mismos puntos editables solo si editable=true (in_progress),
// mismo "Cambiar jugadores" por fila cuando editable.
export function ClassificationSection({
  clubId,
  tournamentId,
  category,
  secondaryCategory,
  entries,
  editable,
  isLive,
  completed,
  ownClubMemberId,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
  onPointsSaved,
  onReplaceSuccess,
  onToast,
}: {
  clubId: string;
  tournamentId: string;
  category: string;
  secondaryCategory: string | null;
  entries: TournamentEntryWithMembers[];
  editable: boolean;
  isLive?: boolean;
  completed?: boolean;
  ownClubMemberId?: string | null;
  avatarsClickable?: boolean;
  onSelectMember?: (clubMemberId: string) => void;
  loadingMemberId?: string | null;
  onPointsSaved: (rows: TournamentEntryRow[]) => void;
  onReplaceSuccess: () => void;
  onToast: (msg: string) => void;
}) {
  const classification = computeTournamentClassification(entries);
  const [pointsInput, setPointsInput] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacingEntry, setReplacingEntry] = useState<TournamentEntryWithMembers | null>(null);

  useEffect(() => {
    setPointsInput(Object.fromEntries(classification.map((r) => [r.entry.id, String(r.entry.points)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  if (classification.length === 0) {
    return <Text style={styles.emptyText}>Aún no hay duplas confirmadas.</Text>;
  }

  const maxPoints = Math.max(...classification.map((r) => r.entry.points), 0);
  const isTie = classification[0].entry.points === classification[classification.length - 1].entry.points;

  async function handleSave() {
    const changed = classification
      .map((r) => ({ entryId: r.entry.id, points: Number(pointsInput[r.entry.id]) }))
      .filter((c) => Number.isFinite(c.points) && classification.find((r) => r.entry.id === c.entryId)!.entry.points !== c.points);

    for (const c of changed) {
      if (!Number.isInteger(c.points) || c.points < 0) {
        const entry = classification.find((r) => r.entry.id === c.entryId)!.entry;
        setError(`Los puntos de "${pairLabel(entry)}" deben ser un número entero mayor o igual a cero.`);
        return;
      }
    }
    if (changed.length === 0) return;

    setError(null);
    setSaving(true);
    const { entries: updated, error: rpcError } = await setTournamentEntryPoints(supabase, tournamentId, changed);
    setSaving(false);
    if (rpcError) {
      setError(rpcError);
      return;
    }
    onPointsSaved(updated);
    onToast("Puntos guardados correctamente");
  }

  const registeredMemberIds = entries.flatMap((e) => e.members.map((m) => m.club_member_id));

  return (
    <View style={{ gap: 10 }}>
      {classification.map(({ entry, position }) => {
        const isOwn = ownClubMemberId && entry.members.some((m) => m.club_member_id === ownClubMemberId);
        const barWidth = maxPoints > 0 ? `${Math.max(6, Math.round((entry.points / maxPoints) * 100))}%` : "10%";
        return (
          <View key={entry.id} style={styles.row}>
            <Text style={styles.position}>{!isTie && position <= 3 ? MEDAL[position - 1] : `#${position}`}</Text>

            <View style={styles.avatars}>
              {entry.members.map((m) => (
                <TouchableOpacity
                  key={m.club_member_id}
                  disabled={!avatarsClickable}
                  onPress={() => onSelectMember?.(m.club_member_id)}
                  activeOpacity={0.7}
                >
                  <PlayerAvatar player={{ id: m.club_member_id, full_name: m.full_name, avatar_url: m.avatar_url }} size="sm" />
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.pairName} numberOfLines={1}>
                  {pairLabel(entry)}
                </Text>
                {isOwn && (
                  <View style={styles.ownBadge}>
                    <Text style={styles.ownBadgeText}>TÚ</Text>
                  </View>
                )}
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: barWidth as `${number}%` }]} />
              </View>
            </View>

            {editable ? (
              <TextInput
                value={pointsInput[entry.id] ?? String(entry.points)}
                onChangeText={(v) => setPointsInput((prev) => ({ ...prev, [entry.id]: v }))}
                keyboardType="number-pad"
                style={styles.pointsInput}
              />
            ) : (
              <Text style={styles.pointsText}>{entry.points} pts</Text>
            )}

            {editable && (
              <TouchableOpacity style={styles.replaceButton} onPress={() => setReplacingEntry(entry)} hitSlop={6}>
                <Repeat width={14} height={14} color={theme.colors.muted} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {editable && (
        <>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} disabled={saving} onPress={handleSave}>
            {saving ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={styles.saveButtonText}>Guardar puntos</Text>}
          </TouchableOpacity>
        </>
      )}

      {replacingEntry && (
        <ReplaceMemberModal
          clubId={clubId}
          entryId={replacingEntry.id}
          members={replacingEntry.members}
          category={category}
          secondaryCategory={secondaryCategory}
          excludeClubMemberIds={registeredMemberIds}
          onClose={() => setReplacingEntry(null)}
          onSuccess={() => {
            setReplacingEntry(null);
            onToast("Integrante reemplazado correctamente");
            onReplaceSuccess();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: { fontSize: 13, color: theme.colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  position: { fontSize: 15, fontWeight: "700", color: theme.colors.primary, width: 30 },
  avatars: { flexDirection: "row" },
  pairName: { fontSize: 13, color: theme.colors.white, fontWeight: "500", flexShrink: 1 },
  ownBadge: { backgroundColor: `${theme.colors.primary}26`, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  ownBadgeText: { fontSize: 9, fontWeight: "700", color: theme.colors.primary },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2, backgroundColor: theme.colors.primary },
  pointsText: { fontSize: 12, color: theme.colors.muted, width: 64, textAlign: "right" },
  pointsInput: {
    width: 56,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: theme.colors.white,
    fontSize: 13,
    textAlign: "center",
  },
  replaceButton: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  errorText: { fontSize: 13, color: theme.colors.danger },
  saveButton: { borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: theme.colors.primary, marginTop: 4 },
  saveButtonText: { fontSize: 13, fontWeight: "700", color: theme.colors.bg },
});
