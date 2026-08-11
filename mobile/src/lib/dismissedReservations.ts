import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Equivalente RN del store localStorage en PlayerActivity.tsx (app web) —
// misma clave por club, mismo alcance (solo tarjetas "Rechazada" son
// descartables). La web usa useSyncExternalStore para mantener varias
// pestañas sincronizadas; en RN solo hay una instancia de la app, así que
// un simple useState cargado desde AsyncStorage al montar cumple lo
// mismo sin esa complejidad extra.
function dismissedStorageKey(clubId: string): string {
  return `padelclub:dismissed-reservations:${clubId}`;
}

async function loadDismissedIds(clubId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(dismissedStorageKey(clubId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function useDismissedReservationIds(clubId: string): {
  dismissedIds: Set<string>;
  dismiss: (id: string) => void;
} {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    loadDismissedIds(clubId).then((ids) => {
      if (!cancelled) setDismissedIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const dismiss = useCallback(
    (id: string) => {
      setDismissedIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        AsyncStorage.setItem(dismissedStorageKey(clubId), JSON.stringify([...next])).catch(() => {});
        return next;
      });
    },
    [clubId]
  );

  return { dismissedIds, dismiss };
}
