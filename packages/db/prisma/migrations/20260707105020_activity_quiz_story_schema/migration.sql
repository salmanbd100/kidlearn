-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('drag_drop', 'trace', 'match', 'puzzle');

-- CreateEnum
CREATE TYPE "QuizQuestionFormat" AS ENUM ('mcq', 'match_pair', 'drag_answer', 'picture_select');

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "definition" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTranslation" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "promptAudioAssetId" TEXT,

    CONSTRAINT "ActivityTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "format" "QuizQuestionFormat" NOT NULL,
    "definition" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestionTranslation" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "audioAssetId" TEXT,

    CONSTRAINT "QuizQuestionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "gradeLevels" "GradeLevel"[],
    "coverAssetId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPage" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "illustrationAssetId" TEXT,

    CONSTRAINT "StoryPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPageTranslation" (
    "id" TEXT NOT NULL,
    "storyPageId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "text" TEXT NOT NULL,
    "narrationAudioAssetId" TEXT,

    CONSTRAINT "StoryPageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTranslation_activityId_language_key" ON "ActivityTranslation"("activityId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestion_quizId_sortOrder_key" ON "QuizQuestion"("quizId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestionTranslation_questionId_language_key" ON "QuizQuestionTranslation"("questionId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Story_slug_key" ON "Story"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StoryPage_storyId_sortOrder_key" ON "StoryPage"("storyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StoryPageTranslation_storyPageId_language_key" ON "StoryPageTranslation"("storyPageId", "language");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTranslation" ADD CONSTRAINT "ActivityTranslation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTranslation" ADD CONSTRAINT "ActivityTranslation_promptAudioAssetId_fkey" FOREIGN KEY ("promptAudioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestionTranslation" ADD CONSTRAINT "QuizQuestionTranslation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestionTranslation" ADD CONSTRAINT "QuizQuestionTranslation_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPage" ADD CONSTRAINT "StoryPage_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPage" ADD CONSTRAINT "StoryPage_illustrationAssetId_fkey" FOREIGN KEY ("illustrationAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPageTranslation" ADD CONSTRAINT "StoryPageTranslation_storyPageId_fkey" FOREIGN KEY ("storyPageId") REFERENCES "StoryPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPageTranslation" ADD CONSTRAINT "StoryPageTranslation_narrationAudioAssetId_fkey" FOREIGN KEY ("narrationAudioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
