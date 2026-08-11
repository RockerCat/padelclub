import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type ViewStyle } from "react-native";
import { theme } from "../lib/theme";

// Placeholder de carga reutilizable — pantallas montan de inmediato
// (navegación nunca espera a los datos) y este componente cubre el hueco
// mientras la query real resuelve, en vez de un spinner de pantalla
// completa (ver requisito "cargar primero la pantalla y luego los datos").
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.base, style, { opacity }]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
  },
});
