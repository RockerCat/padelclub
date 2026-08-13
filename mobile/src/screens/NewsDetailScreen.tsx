import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { formatLongDate } from "../lib/dateFormat";
import { theme } from "../lib/theme";
import type { ClubHomeStackParamList } from "../navigation/ClubHomeStack";

// Equivalente nativo de src/app/clubs/[slug]/news/[newsSlug]/page.tsx (app
// web) — mismo orden de contenido (imagen 3:4, fecha, título, contenido
// completo). Recibe la noticia completa por params (ya cargada por
// getClubPublicPageData en ClubHomeScreen) en vez de una query nueva —
// nunca se vuelve a pedir a Supabase algo que el llamador ya tiene.
//
// Dos piezas de la web NO se replican en esta pasada (decisión explícita,
// ver reporte): el bloque de campeones del torneo asociado
// (NewsTournamentChampions, requiere cargar tournament_id +
// tournament_entries + computeTournamentClassification — un subsistema
// aparte) y los botones de compartir por WhatsApp (ShareNewsButtons) — el
// contenido principal de la noticia (imagen/fecha/título/texto completo)
// sí queda con paridad total. "Editar noticia" tampoco aplica: es
// OWNER/ADMIN-only y esta pantalla es exclusiva de PLAYER.
export function NewsDetailScreen() {
  const { params } = useRoute<RouteProp<ClubHomeStackParamList, "NewsDetail">>();
  const { news } = params;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {news.image_url && (
          <View style={styles.imageWrap}>
            <Image source={{ uri: news.image_url }} style={styles.image} />
          </View>
        )}
        <Text style={styles.date}>{formatLongDate(news.published_at)}</Text>
        <Text style={styles.title}>{news.title}</Text>
        <Text style={styles.body}>{news.content}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 32, gap: 4 },
  imageWrap: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
  },
  image: { width: "100%", height: "100%" },
  date: { color: theme.colors.muted, fontSize: 12 },
  title: { color: theme.colors.white, fontSize: 22, fontWeight: "800", marginTop: 6, marginBottom: 10 },
  body: { color: "rgba(255,255,255,0.8)", fontSize: 14, lineHeight: 21 },
});
