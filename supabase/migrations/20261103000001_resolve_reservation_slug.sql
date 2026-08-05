-- ============================================================
-- resolve_reservation_slug — resuelve el slug corto y legible
-- "nombre-YYYYMMDDHHmm" (sin uuid) a la reserva real
-- Mi Pádel Club
-- ============================================================
-- El slug corto nuevo (ver @/lib/reservationSlug, turno actual) nunca
-- lleva el uuid en el texto — page.tsx necesita una forma de resolverlo
-- ANTES de poder llamar a get_reservation_share_detail(uuid), que sigue
-- siendo la única puerta real de autorización/contenido (esta función
-- nunca la reemplaza ni la duplica).
--
-- Por qué es una RPC SECURITY DEFINER y no una consulta directa desde el
-- cliente: una consulta directa a reservations quedaría sujeta a la RLS
-- normal ("club members read reservations" — exige membresía activa), así
-- que un visitante autenticado pero SIN membresía nunca encontraría la
-- fila candidata y la página mostraría "no encontrado" en vez del mensaje
-- correcto de "acceso restringido" que get_reservation_share_detail ya
-- resuelve bien. Esta función resuelve el uuid para CUALQUIER llamador
-- autenticado, sin importar su membresía — es seguro porque lo único que
-- expone es un uuid opaco (nunca cancha, jugadores, precio ni ningún otro
-- dato de la reserva), y ese uuid pasa igual por el control de acceso real
-- justo después, en la misma página.
--
-- Unicidad: coincide por club + fecha + hora exacta + nombre del creador
-- ya normalizado (mismo algoritmo que slugifyNamePart en TypeScript:
-- quitar acentos, minúsculas, separar por guiones). Si hay 0 o más de 1
-- coincidencia (dos jugadores homónimos, o el mismo jugador con dos
-- reservas en canchas distintas a la misma hora — raro pero posible, ya
-- que create_reservation_player solo evita conflictos en la MISMA
-- cancha), devuelve NULL — nunca adivina, nunca decide por cercanía. La
-- página trata esto exactamente igual que "no se encontró": el enlace
-- corto deja de ser ambiguo al costo de, en ese caso raro, no resolver
-- (el uuid completo, si el visitante lo tiene, siempre sigue funcionando).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.resolve_reservation_slug(
  p_club_id   uuid,
  p_name_slug text,
  p_date      date,
  p_start_time time
)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id          uuid;
  v_match_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), min(r.id) INTO v_match_count, v_id
  FROM public.reservations r
  JOIN public.profiles p ON p.id = r.created_by
  WHERE r.club_id = p_club_id
    AND r.date = p_date
    AND r.start_time = p_start_time
    AND trim(both '-' from regexp_replace(lower(unaccent(coalesce(p.full_name, ''))), '[^a-z0-9]+', '-', 'g'))
        = p_name_slug;

  IF v_match_count = 1 THEN
    RETURN v_id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_reservation_slug(uuid, text, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_reservation_slug(uuid, text, date, time) TO authenticated;
