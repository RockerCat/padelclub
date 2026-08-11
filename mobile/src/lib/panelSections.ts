import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Equivalente RN de setPanelSectionExpanded/getPanelSectionSnapshot en
// PlayerAvailabilityCalendar.tsx (app web) — misma clave por club+jugador+
// sección, mismo default (expandido salvo que se haya colapsado
// explícitamente antes).
type PanelSection = "solicitudes" | "reservas";

function storageKey(clubId: string, playerId: string, section: PanelSection): string {
  return `padelclub:panel-section:${clubId}:${playerId}:${section}`;
}

export function usePanelSectionExpanded(
  clubId: string,
  playerId: string,
  section: PanelSection
): { expanded: boolean; toggle: () => void } {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey(clubId, playerId, section)).then((value) => {
      if (!cancelled) setExpanded(value !== "collapsed");
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, playerId, section]);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      AsyncStorage.setItem(storageKey(clubId, playerId, section), next ? "expanded" : "collapsed").catch(() => {});
      return next;
    });
  }, [clubId, playerId, section]);

  return { expanded, toggle };
}
