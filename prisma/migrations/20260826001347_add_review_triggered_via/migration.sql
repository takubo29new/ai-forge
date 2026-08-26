-- CreateEnum
CREATE TYPE "ReviewTrigger" AS ENUM ('UI', 'CHAT');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "triggeredVia" "ReviewTrigger" NOT NULL DEFAULT 'UI';
