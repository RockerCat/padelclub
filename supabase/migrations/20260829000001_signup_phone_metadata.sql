-- ============================================================
-- handle_new_user — captura opcional de teléfono al registrarse
-- Mi Pádel Club
-- ============================================================
-- WhatsApp obligatorio para un jugador que se registra específicamente
-- para unirse a un club (SignupForm, ?intent=join-club) — pero el
-- formulario de registro es COMPARTIDO por cualquier account_type todavía
-- sin definir (una cuenta recién creada no tiene account_type hasta su
-- primera acción calificante: crear club → OWNER, unirse a un club →
-- PLAYER, aceptar invitación ADMIN → ADMIN). No hay forma de hacer el
-- teléfono obligatorio a nivel de base de datos sin también bloquear los
-- registros de futuros OWNER/ADMIN que comparten este mismo formulario.
--
-- Esta migración solo permite que, cuando SignupForm sí lo recolecta (caso
-- ?intent=join-club), el valor llegue a profiles.phone de forma atómica,
-- exactamente con el mismo mecanismo que ya usa full_name — via
-- user_metadata en el INSERT de auth.users, nunca un segundo UPDATE
-- después. Esto es intencional: si el registro requiere confirmación de
-- correo, no hay sesión autenticada todavía para hacer un UPDATE aparte
-- (profiles_update_own exige auth.uid()) — insertarlo ya en el mismo
-- INSERT evita ese hueco por completo, sin introducir ningún estado
-- parcial nuevo.
--
-- Aditivo y NULL-safe: si raw_user_meta_data no trae 'phone' (todo
-- registro que no sea este caso puntual — OWNER, ADMIN, genérico),
-- profiles.phone queda NULL exactamente igual que hoy. Ningún otro flujo
-- cambia de comportamiento.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;
