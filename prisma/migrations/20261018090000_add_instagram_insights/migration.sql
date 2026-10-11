-- Additive: Instagram statistics (daily account stats, media stats, audience snapshots) and granted scopes. New tables / columns only.
-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "insightsError" TEXT,
ADD COLUMN     "insightsFetchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InstagramDailyStat" (
    "date" VARCHAR(10) NOT NULL,
    "followersCount" INTEGER,
    "reach" INTEGER,
    "views" INTEGER,
    "accountsEngaged" INTEGER,
    "totalInteractions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "replies" INTEGER,
    "reposts" INTEGER,
    "follows" INTEGER,
    "unfollows" INTEGER,
    "linkTaps" INTEGER,
    "callTaps" INTEGER,
    "directionTaps" INTEGER,
    "emailTaps" INTEGER,
    "textTaps" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramDailyStat_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "InstagramMediaStat" (
    "mediaId" VARCHAR(64) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "mediaType" VARCHAR(20),
    "postedAt" TIMESTAMP(3) NOT NULL,
    "caption" TEXT,
    "permalink" TEXT,
    "thumbnail" TEXT,
    "views" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "totalInteractions" INTEGER,
    "profileVisits" INTEGER,
    "follows" INTEGER,
    "websiteClicks" INTEGER,
    "callClicks" INTEGER,
    "directionClicks" INTEGER,
    "avgWatchMs" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramMediaStat_pkey" PRIMARY KEY ("mediaId")
);

-- CreateTable
CREATE TABLE "InstagramAudienceSnapshot" (
    "date" VARCHAR(10) NOT NULL,
    "timeframe" VARCHAR(20) NOT NULL,
    "follower" JSONB NOT NULL DEFAULT '{}',
    "engaged" JSONB NOT NULL DEFAULT '{}',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramAudienceSnapshot_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "InstagramMediaStat_postedAt_idx" ON "InstagramMediaStat"("postedAt");

