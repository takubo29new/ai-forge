import { describe, expect, it } from "vitest";
import { scheduleBackground } from "./schedule-background";

describe("scheduleBackground", () => {
  it("Nextのリクエストスコープ外(通常のテスト実行時)ではtaskの完了を待ってから返す", async () => {
    let completed = false;
    await scheduleBackground(async () => {
      completed = true;
    });
    // after()はNextのAsyncLocalStorageベースのリクエストスコープが無いと例外を
    // 投げるため、この環境ではフォールバックしてtask()を直接awaitしているはず。
    expect(completed).toBe(true);
  });

  it("taskが例外を投げてもフォールバック時はそのまま伝播する", async () => {
    await expect(
      scheduleBackground(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
