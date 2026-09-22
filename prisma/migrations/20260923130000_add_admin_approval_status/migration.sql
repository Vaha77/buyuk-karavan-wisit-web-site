CREATE TYPE "AdminApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "AdminUser" ADD COLUMN "approvalStatus" "AdminApprovalStatus" NOT NULL DEFAULT 'APPROVED';
CREATE INDEX "AdminUser_approvalStatus_isActive_idx" ON "AdminUser"("approvalStatus", "isActive");