import { FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { CompactCarouselCard } from "./CompactCarouselCard";
import type { PlayerTournamentCard } from "../lib/playerDashboard";
import { theme } from "../lib/theme";

// Mismas constantes de carrusel que los carruseles de Torneos activos/
// finalizados en ClubHomeScreen.tsx — nunca un cálculo/valor distinto para
// el mismo patrón visual.
const CAROUSEL_GAP = 12;
const CAROUSEL_SIDE_INSET = 16;

// Antes esta sección usaba TournamentCard (la card grande vertical del
// listado de Torneos). Ahora reutiliza el mismo carrusel horizontal
// compacto que ya usan "Torneos activos"/"Torneos finalizados" en
// ClubHomeScreen.tsx: CompactCarouselCard (imagen + título) dentro de un
// FlatList horizontal con snap — mismas constantes, mismo cálculo de ancho
// (~44% de pantalla), nunca un diseño nuevo. Categoría/estado/compañero/
// posición/puntos siguen disponibles en TournamentDetail, al que el tap
// sigue navegando sin cambios — igual que el mismo recorte ya aceptado
// para Torneos en ClubHomeScreen. Cada tarjeta ya trae la clasificación
// oficial calculada en playerDashboard.ts (computeTournamentClassification)
// — nunca una posición recalculada aquí. Sin torneos propios, la sección
// no se muestra (nunca un carrusel vacío), igual que antes.
export function MyTournamentsSection({ cards }: { cards: PlayerTournamentCard[] }) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { width: windowWidth } = useWindowDimensions();
  const carouselCardWidth = Math.round(windowWidth * 0.44);

  if (cards.length === 0) return null;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mis torneos</Text>
        <TouchableOpacity onPress={() => navigation.navigate("TournamentsTab", { screen: "TournamentsList" })}>
          <Text style={styles.link}>Ver todos los torneos</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        style={styles.carousel}
        data={cards}
        keyExtractor={(card) => card.tournament.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={carouselCardWidth + CAROUSEL_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: CAROUSEL_SIDE_INSET, gap: CAROUSEL_GAP }}
        renderItem={({ item: card }) => (
          <CompactCarouselCard
            imageUrl={card.tournament.cover_image_url}
            title={card.tournament.name}
            width={carouselCardWidth}
            onPress={() => navigation.navigate("TournamentsTab", { screen: "TournamentDetail", params: { tournamentId: card.tournament.id } })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { color: theme.colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  link: { color: theme.colors.muted, fontSize: 12, fontWeight: "600" },
  // Cancela el padding horizontal (16) del ScrollView contenedor
  // (PlayerDashboardScreen.tsx → `content`) — mismo truco exacto que
  // `carousel`/CAROUSEL_SIDE_INSET en ClubHomeScreen.tsx, para que el
  // carrusel llegue hasta el borde real de pantalla y se asome la
  // siguiente card.
  carousel: { marginHorizontal: -16 },
});
