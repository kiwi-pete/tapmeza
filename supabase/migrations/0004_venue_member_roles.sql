-- Safe to run more than once.

-- The live database calls the venue's managing role 'manager'; the original schema called it 'owner'.
-- Allow both, so the app's demo sign-up and every database agree on the role names.
ALTER TABLE venue_members DROP CONSTRAINT IF EXISTS venue_members_role_check;
ALTER TABLE venue_members ADD CONSTRAINT venue_members_role_check CHECK (role IN ('owner', 'manager', 'staff'));
