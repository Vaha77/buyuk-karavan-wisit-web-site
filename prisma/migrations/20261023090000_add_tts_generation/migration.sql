-- Additive: Ovoz studiyasi (TTS) history and usage (new table only).
-- CreateTable
CREATE TABLE "TtsGeneration" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'FULL',
    "source" VARCHAR(10) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "model" VARCHAR(80),
    "voice" VARCHAR(120) NOT NULL,
    "voiceName" VARCHAR(120),
    "lang" VARCHAR(10) NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "format" VARCHAR(8) NOT NULL,
    "text" TEXT NOT NULL,
    "chars" INTEGER NOT NULL,
    "chunks" INTEGER NOT NULL DEFAULT 1,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "sizeBytes" INTEGER,
    "audioUrl" TEXT,
    "audioKey" VARCHAR(200),
    "createdBy" VARCHAR(120),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtsGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TtsGeneration_createdAt_idx" ON "TtsGeneration"("createdAt");

-- CreateIndex
CREATE INDEX "TtsGeneration_kind_createdAt_idx" ON "TtsGeneration"("kind", "createdAt");
