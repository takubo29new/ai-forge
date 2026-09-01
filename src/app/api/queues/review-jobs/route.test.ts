import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/queue", () => ({
  // handleCallbackの実体(署名検証・ack等)はVercel側の責務なので、テストでは
  // 渡されたコールバックをそのまま返す恒等関数として扱う。
  handleCallback: vi.fn((fn: unknown) => fn),
}));
vi.mock("@/lib/process-review-job", () => ({
  processReviewJob: vi.fn(),
}));
vi.mock("@/lib/error-log", () => ({
  logError: vi.fn(),
}));

import { processReviewJob } from "@/lib/process-review-job";
import { logError } from "@/lib/error-log";
import { POST } from "./route";

const mockProcess = vi.mocked(processReviewJob);
const mockLogError = vi.mocked(logError);

const metadata = { messageId: "msg_1" } as never;

describe("POST /api/queues/review-jobs", () => {
  it("processReviewJobにペイロードを渡す", async () => {
    mockProcess.mockResolvedValue(undefined);
    const payload = {
      repositoryId: "repo_1",
      userId: "user_1",
      promptVersionId: "pv_1",
      pullRequestNumber: 1,
      triggeredVia: "WEBHOOK" as const,
    };

    await (POST as unknown as (message: unknown, metadata: unknown) => Promise<void>)(
      payload,
      metadata,
    );

    expect(mockProcess).toHaveBeenCalledWith(payload);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("processReviewJobが失敗したらログに残し、例外は投げない(再配送させない)", async () => {
    mockProcess.mockRejectedValue(new Error("db down"));
    const payload = {
      repositoryId: "repo_1",
      userId: "user_1",
      promptVersionId: "pv_1",
      pullRequestNumber: 1,
      triggeredVia: "WEBHOOK" as const,
    };

    await expect(
      (POST as unknown as (message: unknown, metadata: unknown) => Promise<void>)(
        payload,
        metadata,
      ),
    ).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});
