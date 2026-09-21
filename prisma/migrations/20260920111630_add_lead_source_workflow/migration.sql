-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('CONTACT_FORM', 'MADINA', 'PRODUCT', 'PROJECT', 'HOME_CTA', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "LeadStatus" ADD VALUE 'WON';
ALTER TYPE "LeadStatus" ADD VALUE 'LOST';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "managerNote" TEXT,
ADD COLUMN     "source" "LeadSource" NOT NULL DEFAULT 'OTHER';
