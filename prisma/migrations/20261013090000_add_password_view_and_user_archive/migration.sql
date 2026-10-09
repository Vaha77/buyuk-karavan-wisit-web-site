-- Users page: encrypted copy of the password for the Super Admin's view, and soft archive of users. Additive only.
-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "passwordEncrypted" TEXT;

