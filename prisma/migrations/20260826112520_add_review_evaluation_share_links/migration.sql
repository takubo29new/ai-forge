-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "shareToken" TEXT,
ADD COLUMN     "sharedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "shareToken" TEXT,
ADD COLUMN     "sharedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Review_shareToken_key" ON "Review"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_shareToken_key" ON "Evaluation"("shareToken");
