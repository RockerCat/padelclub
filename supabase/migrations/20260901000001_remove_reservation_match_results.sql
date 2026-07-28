-- ============================================================
-- Retiro del bloque de resultados vinculado a reservations
-- Mi Pádel Club
-- ============================================================
-- Regla funcional definitiva, confirmada después de aplicar
-- 20260831000001/20260831000002: una reservation ordinaria (type='match')
-- NUNCA debe ser fuente oficial de resultado deportivo. Puede seguir
-- contando para "Partidos jugados" (confirmada + finalizada), pero nunca
-- tiene equipos, marcador, ganador, victorias, derrotas, puntos ni efecto
-- en ranking — eso queda reservado exclusivamente para el futuro módulo
-- de torneos (no diseñado todavía, no se crea nada de eso aquí).
--
-- Esta migración retira, de forma explícita y sin CASCADE, exactamente
-- los objetos introducidos por 20260831000001/20260831000002 — ninguna de
-- esas dos migraciones se modifica, renombra ni elimina; siguen
-- representando fielmente lo que se aplicó en su momento.
--
-- Auditado antes de escribir esto (vía REST, service_role, solo SELECT):
--   - public.match_results        → 0 filas
--   - public.match_result_players → 0 filas
--   - public.match_result_sets    → 0 filas
--   - public.record_match_result(uuid, uuid, uuid[], uuid[], integer[],
--     integer[]) existe, firma confirmada contra el esquema real (RPC
--     expuesta en /rpc/record_match_result).
--   - Ninguna otra migración, función, vista ni tabla del proyecto
--     referencia match_results/match_result_players/match_result_sets/
--     record_match_result — sin dependencias externas inesperadas, por lo
--     que ningún DROP de abajo necesita (ni usa) CASCADE.
--
-- No toca reservations, reservation_players, club_members, el ledger de
-- puntos, club_ranking_cycles, category cycles, profiles, ni ningún otro
-- objeto ajeno a este bloque. No hay datos que preservar (0 filas en las
-- tres tablas) — el DROP TABLE elimina automáticamente sus propios
-- índices, constraints y políticas RLS; no hace falta (ni se agrega)
-- ningún DROP POLICY/DROP INDEX/DROP CONSTRAINT redundante.
-- ============================================================

-- ─── 1. Revocar EXECUTE y eliminar la RPC de escritura ─────────────────────
REVOKE ALL ON FUNCTION public.record_match_result(uuid, uuid, uuid[], uuid[], integer[], integer[]) FROM authenticated;

DROP FUNCTION IF EXISTS public.record_match_result(uuid, uuid, uuid[], uuid[], integer[], integer[]);

-- ─── 2. Retirar las tablas — hijas primero, padre al final, sin CASCADE ───
-- DROP TABLE ya retira por sí solo, sin necesidad de statements aparte:
-- sus índices propios (match_result_players_result_idx,
-- match_result_players_member_idx, match_result_sets_result_idx,
-- match_results_one_active_per_reservation, match_results_club_idx), sus
-- constraints (incluidas las FK compuestas entre las tres tablas) y sus
-- políticas RLS (club_members_read_match_result_players/_sets/_results).
DROP TABLE IF EXISTS public.match_result_sets;
DROP TABLE IF EXISTS public.match_result_players;
DROP TABLE IF EXISTS public.match_results;
