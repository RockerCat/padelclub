-- ============================================================
-- Fix: resolve_reservation_slug usaba min(uuid), que no existe en
-- Postgres (no hay orden natural definido para agregar MIN/MAX sobre
-- uuid) — cualquier llamada con al menos una fila candidata fallaba con
-- "function min(uuid) does not exist" (42883). El CREATE FUNCTION en sí
-- no lo detectó porque plpgsql no valida el SQL interno al crear la
-- función, solo al ejecutarla — encontrado al probar la lógica de
-- matching real contra datos reales, antes de que esto llegara a
-- producción de verdad.
-- Mi Pádel Club
-- ============================================================
-- Fix mínimo: (array_agg(r.id))[1] en vez de min(r.id) — funciona para
-- cualquier tipo, sin depender de un operador de orden. Ninguna otra
-- línea cambia: misma firma, misma autorización, misma regla de
-- unicidad (0 o >1 coincidencias siguen devolviendo NULL).
-- ============================================================

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

  SELECT count(*), (array_agg(r.id))[1] INTO v_match_count, v_id
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
