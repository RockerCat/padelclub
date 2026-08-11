// Ya NO es una copia — Metro ahora resuelve shared/ fuera de la raíz de
// mobile/ (ver mobile/metro.config.js, watchFolders). Misma fuente única
// que RegisterEntryModal.tsx/ReplaceMemberModal.tsx (app web) también
// usan ahora (shared/tournaments/candidates.ts) — antes vivía duplicada
// inline en ambos componentes de WEB además de portada a mano aquí.
//
// getTournamentCandidates ahora devuelve {candidates, error} en vez de
// solo el array: la copia anterior de mobile ignoraba en silencio un
// fallo de get_club_category_ranking_view (lista vacía/parcial sin
// avisar); WEB siempre mostró "No se pudo cargar la lista de jugadores."
// en ese caso — mobile ahora hace lo mismo (ver RegisterEntryModal.tsx/
// ReplaceMemberModal.tsx).
export * from "../../../shared/tournaments/candidates";
