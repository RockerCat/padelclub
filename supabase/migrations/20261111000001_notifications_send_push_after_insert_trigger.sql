DROP TRIGGER IF EXISTS notifications_send_push_after_insert
ON public.notifications;

CREATE TRIGGER notifications_send_push_after_insert
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notify_push_on_notification_insert();
