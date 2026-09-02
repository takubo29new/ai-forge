import { processPendingReviews } from "@/lib/process-pending-reviews";
import { prisma } from "@/lib/prisma";

// GitHub Actionsの定期実行から呼ばれるエントリーポイント(Issue #129)。
// 処理本体はsrc/lib/process-pending-reviews.tsに置き、単体・統合テストの
// 対象にできるようにしている(このファイル自体はテスト対象外)。
processPendingReviews()
  .then(({ processed }) => {
    console.log(`[process-pending-reviews] ${processed}件処理しました`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
