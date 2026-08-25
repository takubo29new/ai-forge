-- Postgresのユニークインデックスは複合キーに含まれるNULLを「区別可能」として扱うため、
-- Document_userId_repositoryId_sourcePath_key(userId, repositoryId, sourcePath)は
-- repositoryIdがNULLの行(ai-forge自身の設計書同期)同士の重複を防げない。
-- ai-forge自身の同期はリポジトリに紐づかず必ずrepositoryId IS NULLになるため、
-- この場合のみ(userId, sourcePath)の組で別途ユニーク制約を持たせる部分インデックスを追加する。
CREATE UNIQUE INDEX "Document_userId_sourcePath_self_sync_key" ON "Document"("userId", "sourcePath") WHERE "repositoryId" IS NULL;
