-- DropIndex
DROP INDEX "Document_userId_sourcePath_key";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "repositoryId" TEXT;

-- CreateIndex
CREATE INDEX "Document_repositoryId_idx" ON "Document"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_userId_repositoryId_sourcePath_key" ON "Document"("userId", "repositoryId", "sourcePath");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
