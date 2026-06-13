-- Add 'pending' status for player reservation requests

-- Extend the status constraint
ALTER TABLE public.reservations
  DROP CONSTRAINT reservations_valid_status;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_valid_status
  CHECK (status IN ('confirmed', 'cancelled', 'pending'));

-- Allow any active club member to insert a pending reservation
-- (existing admins policy already handles 'confirmed' inserts for OWNER/ADMIN)
CREATE POLICY "members insert pending reservations"
  ON public.reservations FOR INSERT
  WITH CHECK (
    public.club_role(club_id) IS NOT NULL
    AND status = 'pending'
  );
