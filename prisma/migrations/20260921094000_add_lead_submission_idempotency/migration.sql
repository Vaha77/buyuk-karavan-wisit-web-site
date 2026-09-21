-- AddColumn
ALTER TABLE "Lead" ADD COLUMN "submissionKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_submissionKey_key" ON "Lead"("submissionKey");
