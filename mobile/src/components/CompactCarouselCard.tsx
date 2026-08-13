import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";

// Card mínima para los carruseles compactos de "Página del club" (Noticias
// recientes/Torneos activos/Torneos finalizados en ClubHomeScreen.tsx) —
// solo imagen + título, nunca fecha/categoría/estado/metadata (esa
// información sigue completa en el detalle real al que ya navega el tap).
// Un único componente reutilizado por los tres carruseles (mismo shape
// imagen+título para noticia y torneo) en vez de tres variantes
// compactas separadas. Nunca reemplaza TournamentCard/las cards
// completas usadas en otras pantallas (TournamentsScreen,
// MyTournamentsSection, etc.) — esas siguen intactas.
export function CompactCarouselCard({
  imageUrl,
  title,
  width,
  onPress,
}: {
  imageUrl: string | null;
  title: string;
  width: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.card, { width }]} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.imageWrap}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : <View style={styles.imagePlaceholder} />}
      </View>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
  },
  imageWrap: { width: "100%", aspectRatio: 4 / 3, backgroundColor: theme.colors.surfaceAlt },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { width: "100%", height: "100%" },
  titleWrap: { height: 44, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "flex-start" },
  title: { color: theme.colors.white, fontSize: 13, fontWeight: "700", lineHeight: 17, height: 34 },
});
