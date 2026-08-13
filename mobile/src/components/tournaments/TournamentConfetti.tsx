import { useEffect, useState } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";

interface TournamentConfettiProps {
  onDone: () => void;
}

interface ConfettiPiece {
  id: number;
  left: number; // 0-100, %
  color: string;
  width: number;
  height: number;
  delay: number;
  duration: number;
  rotateStart: number;
  driftX: number;
  // Vive DENTRO de cada pieza (nunca en un ref aparte leído en el render)
  // — evita "Cannot access refs during render": el valor animado se crea
  // una sola vez, junto con el resto de los datos de la pieza, y el
  // render solo lo LEE desde `pieces` (estado), nunca desde un ref.
  progress: Animated.Value;
}

const COLORS = ["#00ffff", "#f59e0b", "#f472b6", "#34d399", "#818cf8"];
const PIECE_COUNT = 28;
const DURATION_MS = 2600;

function generatePieces(): ConfettiPiece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORS[i % COLORS.length],
    width: 6 + Math.random() * 5,
    height: 9 + Math.random() * 6,
    delay: Math.random() * 400,
    duration: DURATION_MS - 400 + Math.random() * 600,
    rotateStart: Math.random() * 360,
    driftX: (Math.random() - 0.5) * 60,
    progress: new Animated.Value(0),
  }));
}

// Adaptación de TournamentConfetti.tsx (app web: piezas CSS absolutas +
// keyframes) a React Native — mismo espíritu (nada de canvas ni librería
// nueva, `Animated` ya viene con React Native), pero UNA sola celebración
// breve al montar (nunca el ciclo "cada 10s mientras la pestaña esté
// visible" de la web — pedido explícito de esta pantalla). Nunca bloquea
// toques/scroll (`pointerEvents="none"` en el overlay entero) ni deja
// nada montado más allá de `onDone` — se autodestruye sola vía un único
// `setTimeout`, sin temporizadores para navegación/modales. A diferencia
// de la web, en mobile no hay hidratación server/cliente, así que generar
// las piezas (Math.random) directamente en el estado inicial sería seguro
// igual — se hace dentro de un efecto de montaje solo para mantener la
// misma forma exacta que la fuente web.
export function TournamentConfetti({ onDone }: TournamentConfettiProps) {
  // Inicializador perezoso — corre una sola vez, antes del primer pintado
  // (nunca en cada render). En mobile no hay hidratación server/cliente
  // (a diferencia de la web, que por eso genera sus piezas dentro de un
  // efecto), así que este es el lugar correcto para el único Math.random
  // impuro que este componente necesita — deja además el efecto de abajo
  // libre de cualquier setState propio.
  const [pieces] = useState<ConfettiPiece[]>(() => generatePieces());

  useEffect(() => {
    const animations = pieces.map((p) =>
      Animated.timing(p.progress, {
        toValue: 1,
        duration: p.duration,
        delay: p.delay,
        useNativeDriver: true,
      })
    );
    Animated.parallel(animations).start();

    const timer = setTimeout(onDone, DURATION_MS + 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { height: screenHeight } = Dimensions.get("window");

  return (
    <View style={styles.overlay} pointerEvents="none">
      {pieces.map((piece) => {
        const translateY = piece.progress.interpolate({ inputRange: [0, 1], outputRange: [-20, screenHeight] });
        const translateX = piece.progress.interpolate({ inputRange: [0, 1], outputRange: [0, piece.driftX] });
        const rotate = piece.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [`${piece.rotateStart}deg`, `${piece.rotateStart + 360}deg`],
        });
        const opacity = piece.progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
        return (
          <Animated.View
            key={piece.id}
            style={[
              styles.piece,
              {
                left: `${piece.left}%`,
                width: piece.width,
                height: piece.height,
                backgroundColor: piece.color,
                opacity,
                transform: [{ translateY }, { translateX }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // elevation es el equivalente Android de zIndex para el apilamiento de
  // Views nativas — sin él, algunos dispositivos Android pueden seguir
  // pintando este overlay detrás de hermanos posteriores pese al zIndex.
  // No afecta iOS (ignora la propiedad).
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 500, elevation: 500 },
  piece: { position: "absolute", top: 0, borderRadius: 1 },
});
