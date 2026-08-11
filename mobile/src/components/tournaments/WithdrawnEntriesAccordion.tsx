import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { theme } from "../../lib/theme";
import { EntryCard } from "./EntryCard";
import type { TournamentEntryWithMembers } from "../../lib/tournamentEntries";

// Traducción 1:1 de WithdrawnEntriesAccordion.tsx (app web) — colapsado
// por defecto, cada EntryCard sin `actions` (solo lectura), null si no
// hay retiradas. Lista independiente de los 3 grupos de EntriesSection.
export function WithdrawnEntriesAccordion({
  entries,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: {
  entries: TournamentEntryWithMembers[];
  avatarsClickable?: boolean;
  onSelectMember?: (clubMemberId: string) => void;
  loadingMemberId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <Text style={styles.headerText}>Duplas retiradas ({entries.length})</Text>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <ChevronDown width={16} height={16} color={theme.colors.muted} />
        </View>
      </TouchableOpacity>
      {open && (
        <ScrollView style={styles.list} nestedScrollEnabled>
          <View style={{ gap: 10 }}>
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} avatarsClickable={avatarsClickable} onSelectMember={onSelectMember} loadingMemberId={loadingMemberId} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  headerText: { fontSize: 13, fontWeight: "600", color: theme.colors.white },
  list: { maxHeight: 360, paddingHorizontal: 14, paddingBottom: 14 },
});
