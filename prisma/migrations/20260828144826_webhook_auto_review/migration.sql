-- AlterEnum
ALTER TYPE "ReviewTrigger" ADD VALUE 'WEBHOOK';

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "defaultPromptId" TEXT,
ADD COLUMN     "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookId" INTEGER,
ADD COLUMN     "webhookSecret" TEXT;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_defaultPromptId_fkey" FOREIGN KEY ("defaultPromptId") REFERENCES "Prompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
