# RLS Validation Checklist — Sprint 1

Run these checks in the Supabase SQL Editor after applying the migration.
Each query simulates what a specific user type should or should not see.

---

## 1. Profile auto-created on signup

After a new user signs up via the app:

```sql
-- Check that a profile row was created automatically
SELECT id, full_name, created_at
FROM public.profiles
ORDER BY created_at DESC
LIMIT 5;
```

Expected: A row exists matching the new user's `auth.uid()`.

---

## 2. Owner can see and update their club

```sql
-- As an authenticated OWNER, this should return the club row
SELECT * FROM public.clubs WHERE slug = 'your-club-slug';

-- UPDATE should succeed (will be denied for non-owners)
UPDATE public.clubs SET name = 'New Name' WHERE slug = 'your-club-slug';
```

---

## 3. Active member can see club_members of their club

```sql
-- As an authenticated member, this should return rows
SELECT cm.role, p.full_name
FROM public.club_members cm
JOIN public.profiles p ON p.id = cm.profile_id
WHERE cm.club_id = '<your-club-id>';
```

Expected: Returns all active members. No rows from other clubs.

---

## 4. Non-member cannot access club_members of another club

```sql
-- As a user who is NOT a member of <other-club-id>
SELECT * FROM public.club_members WHERE club_id = '<other-club-id>';
```

Expected: Empty result (RLS blocks). NOT an error — just 0 rows.

---

## 5. Admin/Owner can create invitation links

```sql
-- As OWNER or ADMIN of club_id = '<your-club-id>'
INSERT INTO public.invitation_links (club_id, created_by, role)
VALUES ('<your-club-id>', auth.uid(), 'PLAYER');
```

Expected: Row inserted successfully.

---

## 6. Player cannot create invitation links

```sql
-- As a PLAYER (not OWNER/ADMIN), this should fail
INSERT INTO public.invitation_links (club_id, created_by, role)
VALUES ('<your-club-id>', auth.uid(), 'PLAYER');
```

Expected: `new row violates row-level security policy` error.

---

## 7. Slug format constraint

```sql
-- These should FAIL (invalid slug format)
INSERT INTO public.clubs (slug, name) VALUES ('My Club', 'My Club');
INSERT INTO public.clubs (slug, name) VALUES ('-badslug', 'Bad');
INSERT INTO public.clubs (slug, name) VALUES ('bad slug!', 'Bad');

-- These should SUCCEED
INSERT INTO public.clubs (slug, name) VALUES ('platino-padel', 'Platino Padel');
INSERT INTO public.clubs (slug, name) VALUES ('club123', 'Club 123');
```

---

## 8. handle_new_user trigger fires

After running:
```sql
-- Create a test user via Supabase Auth (use the signup flow or Auth dashboard)
-- Then immediately check:
SELECT id, full_name FROM public.profiles ORDER BY created_at DESC LIMIT 1;
```

Expected: Row exists with the user's `full_name` from signup metadata.

---

## Notes

- All checks should be run as authenticated users (use the Supabase Dashboard
  "SQL Editor → Run as user" or test via the app flow).
- An empty result is not the same as an error. RLS silently filters rows.
- To test as a specific user in SQL Editor:
  ```sql
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claim.sub = '<user-uuid>';
  -- then run your query
  ```
