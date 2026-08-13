import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { TournamentCard } from "./TournamentCard";
import type { PlayerTournamentCard } from "../lib/playerDashboard";
import { effectivePlayerTournamentStatus } from "../lib/tournaments";
import { theme } from "../lib/theme";

// Línea extra bajo la fecha (compañero/posición/puntos) — traducción 1:1
// de TournamentFooterExtra en MyTournamentsSection.tsx (app web), vía el
// mismo slot `footerExtra` que TournamentCard.tsx (mobile) ahora expone.
function TournamentFooterExtra({ card }: { card: PlayerTournamentCard }) {
  const { partnerName, position, points, tournament } = card;
  const showResult = tournament.status === "completed" && position !== null;

  if (!partnerName && !showResult) return null;

  return (
    <View style={styles.footerExtraRow}>
      {partnerName ? (
        <Text style={styles.footerExtraMuted} numberOfLines={1}>
          Con {partnerName}
        </Text>
      ) : (
        <View />
      )}
      {showResult && (
        <Text style={styles.footerExtraStrong}>
          #{position} · {points} pts
        </Text>
      )}
    </View>
  );
}

// Traducción 1:1 de MyTournamentsSection.tsx (app web) — reutiliza
// EXACTAMENTE la misma tarjeta compacta que ya usa el listado de Torneos
// (TournamentCard, ver ../components/TournamentCard.tsx), nunca una
// variante grande exclusiva del Dashboard. Cada tarjeta ya trae la
// clasificación oficial calculada en playerDashboard.ts
// (computeTournamentClassification) — nunca una posición recalculada
// aquí. Sin torneos propios, la sección no se muestra (nunca una grilla
// vacía), igual que la web.
export function MyTournamentsSection({ cards }: { cards: PlayerTournamentCard[] }) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  if (cards.length === 0) return null;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mis torneos</Text>
        <TouchableOpacity onPress={() => navigation.navigate("TournamentsTab", { screen: "TournamentsList" })}>
          <Text style={styles.link}>Ver todos los torneos</Text>
        </TouchableOpacity>
      </View>
      <View style={{ gap: 12 }}>
        {cards.map((card) => (
          <TournamentCard
            key={card.tournament.id}
            tournament={card.tournament}
            onPress={() => navigation.navigate("TournamentsTab", { screen: "TournamentDetail", params: { tournamentId: card.tournament.id } })}
            footerExtra={<TournamentFooterExtra card={card} />}
            // Esta sección es exclusiva de PLAYER (Dashboard deportivo) —
            // siempre el estado EFECTIVO, mismo criterio que WEB.
            displayStatus={effectivePlayerTournamentStatus(card.tournament)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { color: theme.colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  link: { color: theme.colors.muted, fontSize: 12, fontWeight: "600" },
  footerExtraRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 },
  footerExtraMuted: { color: theme.colors.muted, fontSize: 12, flexShrink: 1 },
  footerExtraStrong: { color: theme.colors.primary, fontSize: 12, fontWeight: "700" },
});
