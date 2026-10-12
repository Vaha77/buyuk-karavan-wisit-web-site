-- Additive: optional second product on an Instagram post rule ({mahsulot2} {narx_som2} {havola2}). New column, index, FK only.
-- AlterTable
ALTER TABLE "InstagramMediaRule" ADD COLUMN "secondProductId" TEXT;

-- CreateIndex
CREATE INDEX "InstagramMediaRule_secondProductId_idx" ON "InstagramMediaRule"("secondProductId");

-- AddForeignKey
ALTER TABLE "InstagramMediaRule" ADD CONSTRAINT "InstagramMediaRule_secondProductId_fkey" FOREIGN KEY ("secondProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
