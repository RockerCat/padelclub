-- Prepara (sin activar todavía) la infraestructura de push notifications:
-- crea únicamente la función trigger que llamará a la Edge Function
-- send-push vía net.http_post. NO crea el CREATE TRIGGER sobre
-- public.notifications — eso queda para una migración posterior,
-- una vez pg_net esté habilitado y el secreto exista en Vault.
--
-- Cualquier fallo leyendo el secreto o llamando a net.http_post nunca debe
-- impedir el INSERT normal de public.notifications: por eso todo el cuerpo
-- va envuelto en BEGIN ... EXCEPTION WHEN OTHERS THEN (sin RAISE) ... END,
-- y la función siempre termina en RETURN NEW pase lo que pase.
CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_push_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret
      INTO v_push_secret
      FROM vault.decrypted_secrets
      WHERE name = 'push_webhook_secret';

    IF v_push_secret IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://rfzyqmvqmqsjigcvxxnf.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Push-Secret', v_push_secret
        ),
        body := jsonb_build_object('notification_id', NEW.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
