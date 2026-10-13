-- Additive: VoiceLab credits per TTS generation (new nullable / defaulted columns only).
-- AlterTable
ALTER TABLE "TtsGeneration" ADD COLUMN "credits" INTEGER,
ADD COLUMN "creditsExact" BOOLEAN NOT NULL DEFAULT false;
