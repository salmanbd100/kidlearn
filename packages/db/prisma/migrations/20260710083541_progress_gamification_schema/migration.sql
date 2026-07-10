/*
  Warnings:

  - You are about to drop the column `avatarCharacterRef` on the `ChildProfile` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "LessonStep" AS ENUM ('intro', 'video', 'activity', 'quiz', 'reward');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('star', 'coin', 'badge');

-- CreateEnum
CREATE TYPE "SessionEventType" AS ENUM ('heartbeat', 'session_start', 'session_end', 'lesson_start', 'lesson_complete', 'story_start', 'story_complete');

-- CreateEnum
CREATE TYPE "AIJobType" AS ENUM ('lesson', 'story', 'quiz', 'audio', 'image');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('pending', 'generating', 'awaiting_review', 'approved', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "AIReviewDecision" AS ENUM ('approve', 'edit_then_approve', 'reject');

-- AlterTable
ALTER TABLE "ChildProfile" DROP COLUMN "avatarCharacterRef",
ADD COLUMN     "avatarCharacterId" TEXT;

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "currentStep" "LessonStep" NOT NULL DEFAULT 'intro',
    "completedAt" TIMESTAMP(3),
    "score" INTEGER,
    "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizResponse" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" TEXT NOT NULL,
    "rule" JSONB NOT NULL,
    "iconAssetId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardLedger" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "badgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "unlockRule" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildCharacter" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Streak" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" DATE,

    CONSTRAINT "Streak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenTimeSetting" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "dailyLimitMinutes" INTEGER,
    "windowStart" TIME(0),
    "windowEnd" TIME(0),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenTimeSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "type" "SessionEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGenerationJob" (
    "id" TEXT NOT NULL,
    "type" "AIJobType" NOT NULL,
    "input" JSONB NOT NULL,
    "rawOutput" JSONB,
    "status" "AIJobStatus" NOT NULL DEFAULT 'pending',
    "reviewerId" TEXT,
    "decision" "AIReviewDecision",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AIGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_childId_lessonId_key" ON "LessonProgress"("childId", "lessonId");

-- CreateIndex
CREATE INDEX "QuizResponse_childId_answeredAt_idx" ON "QuizResponse"("childId", "answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");

-- CreateIndex
CREATE INDEX "RewardLedger_childId_createdAt_idx" ON "RewardLedger"("childId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Character_slug_key" ON "Character"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ChildCharacter_childId_characterId_key" ON "ChildCharacter"("childId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "Streak_childId_key" ON "Streak"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenTimeSetting_childId_key" ON "ScreenTimeSetting"("childId");

-- CreateIndex
CREATE INDEX "SessionEvent_childId_occurredAt_idx" ON "SessionEvent"("childId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_childId_weekStart_key" ON "WeeklyReport"("childId", "weekStart");

-- CreateIndex
CREATE INDEX "AIGenerationJob_status_createdAt_idx" ON "AIGenerationJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ChildProfile" ADD CONSTRAINT "ChildProfile_avatarCharacterId_fkey" FOREIGN KEY ("avatarCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResponse" ADD CONSTRAINT "QuizResponse_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResponse" ADD CONSTRAINT "QuizResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_iconAssetId_fkey" FOREIGN KEY ("iconAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardLedger" ADD CONSTRAINT "RewardLedger_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardLedger" ADD CONSTRAINT "RewardLedger_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildCharacter" ADD CONSTRAINT "ChildCharacter_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildCharacter" ADD CONSTRAINT "ChildCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenTimeSetting" ADD CONSTRAINT "ScreenTimeSetting_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGenerationJob" ADD CONSTRAINT "AIGenerationJob_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
