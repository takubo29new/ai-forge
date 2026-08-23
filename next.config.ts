import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // POST /api/documents/syncがdocs/*.mdやREADME.md等をfs経由で直接読むため、
  // Vercel等のサーバーレス関数バンドルにこれらのファイルを含める(Next.jsの
  // デフォルトのfile tracingは静的解析できないfs呼び出しを自動追跡しないため)。
  outputFileTracingIncludes: {
    "/api/documents/sync": ["./docs/**/*.md", "./README.md", "./ai-dev-tool-handoff.md"],
  },
};

export default nextConfig;
