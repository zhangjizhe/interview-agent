-- Stop before changing the schema if historical mixed-case addresses collide.
-- The deployment owner must resolve those accounts before retrying this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    GROUP BY lower("email")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce case-insensitive email uniqueness: duplicate addresses exist in users';
  END IF;
END $$;

ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Prisma's @unique remains the canonical exact index; this expression index also
-- protects concurrent registration/legacy email claims across application nodes.
CREATE UNIQUE INDEX "users_email_lowercase_key" ON "users" (lower("email"));
