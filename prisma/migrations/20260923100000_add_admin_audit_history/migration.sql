CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorAdminId" TEXT NOT NULL,
  "actorNameSnapshot" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "entityName" TEXT,
  "summary" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PhotoStudioAsset" (
  "id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "creatorAdminId" TEXT NOT NULL,
  "attachedProductId" TEXT,
  "attachedByAdminId" TEXT,
  "attachedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhotoStudioAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_actorAdminId_idx" ON "AuditLog"("actorAdminId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "PhotoStudioAsset_creatorAdminId_idx" ON "PhotoStudioAsset"("creatorAdminId");
CREATE INDEX "PhotoStudioAsset_attachedProductId_idx" ON "PhotoStudioAsset"("attachedProductId");
CREATE INDEX "PhotoStudioAsset_createdAt_idx" ON "PhotoStudioAsset"("createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoStudioAsset" ADD CONSTRAINT "PhotoStudioAsset_creatorAdminId_fkey" FOREIGN KEY ("creatorAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoStudioAsset" ADD CONSTRAINT "PhotoStudioAsset_attachedByAdminId_fkey" FOREIGN KEY ("attachedByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;