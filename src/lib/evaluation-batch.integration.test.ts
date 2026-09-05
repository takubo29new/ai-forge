import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordBatchItemCompleted, recordBatchItemSkipped } from "./evaluation-batch";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

describe("evaluation-batch", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("完了が集中してもまとめ通知は1回だけ送られる(race-safety)", async () => {
    const batch = await prisma.evaluationBatch.create({
      data: { userId, total: 5 },
    });

    // 5件の完了がほぼ同時に届いた状況を再現する。
    await Promise.all(
      Array.from({ length: 5 }, () => recordBatchItemCompleted(batch.id)),
    );

    const updated = await prisma.evaluationBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(updated.completedCount).toBe(5);
    expect(updated.notifiedAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({
      where: { userId, link: `/evaluations/batches/${batch.id}` },
    });
    expect(notifications).toHaveLength(1);
  });

  it("バリデーションで弾かれた件数(skipped)もtotalに到達させる", async () => {
    const batch = await prisma.evaluationBatch.create({
      data: { userId, total: 2 },
    });

    await recordBatchItemCompleted(batch.id);
    await recordBatchItemSkipped(batch.id);

    const notifications = await prisma.notification.findMany({
      where: { userId, link: `/evaluations/batches/${batch.id}` },
    });
    expect(notifications).toHaveLength(1);
  });

  it("まとめ通知は成功件数を正しく報告する", async () => {
    const promptVersion = await prisma.promptVersion.create({
      data: {
        versionNumber: 1,
        content: "test",
        prompt: { create: { title: "batch test", userId } },
      },
    });

    const batch = await prisma.evaluationBatch.create({
      data: { userId, total: 2 },
    });
    await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: promptVersion.id,
        inputType: "IMAGE",
        title: "成功分",
        status: "SUCCESS",
        batchId: batch.id,
      },
    });
    await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: promptVersion.id,
        inputType: "IMAGE",
        title: "失敗分",
        status: "FAILED",
        batchId: batch.id,
      },
    });

    await recordBatchItemCompleted(batch.id);
    await recordBatchItemCompleted(batch.id);

    const notification = await prisma.notification.findFirst({
      where: { userId, link: `/evaluations/batches/${batch.id}` },
    });
    expect(notification?.message).toBe("バッチ評価(2件)が完了しました(成功1件)");
  });
});
