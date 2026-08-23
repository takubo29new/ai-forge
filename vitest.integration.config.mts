import { defineConfig } from "vitest/config";

// ルートレベルの統合テスト用設定。実際のPostgres(DATABASE_URL)に対して
// prisma経由でクエリを発行するため、npm testの対象からは分離している
// (詳細はdocs/quality-improvements.md参照)。
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
});
