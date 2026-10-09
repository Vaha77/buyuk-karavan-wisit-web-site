-- Password reset by the Super Admin: force a new password on the next login. Additive only.
-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "mustPasswordChange" BOOLEAN NOT NULL DEFAULT false;

