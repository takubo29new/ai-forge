# 作業ログ

開発に費やした時間の記録。日時はセッション(Claude Codeとの対話)の開始〜終了を目安とする。

| 日付 | 開始 | 終了 | 作業時間 | 内容 |
| --- | --- | --- | --- | --- |
| 2026-08-23 | 07:00 | 08:05 | 1h05m | リポジトリ初期化、ブランチ運用ルール策定(main/dev/feature/bugfix/hotfix)、GitHubリポジトリ作成・gh CLIセットアップ、Next.jsひな形セットアップ(TypeScript + Tailwind + App Router)、PRレビューと指摘対応(.gitignore修正)、devへマージ |
| 2026-08-23 | 13:00 | 13:44 | 44m | ローカルDB環境構築(docker-compose.ymlでpgvector/pgvector:pg16のPostgresを起動)、.env設定、`prisma migrate dev`で初期スキーマ適用、PR作成(#5) |
| 2026-08-23 | 13:44 | 13:52 | 8m | 画面遷移・UI設計(docs/phase1-ui-design.md)、phase1-design.mdのステータス更新、PR作成(#6) |
| 2026-08-23 | 16:00 | 16:40 | 40m | GitHub OAuth App作成手順の案内、NextAuth.js(v5) + GitHub Provider + PrismaAdapter実装、@prisma/adapter-pg追加(Prisma 7のドライバーアダプタ必須化対応)、ログイン/prompts仮画面実装、ビルド・OAuthリダイレクトの動作確認 |
| 2026-08-23 | 16:40 | 17:01 | 21m | カテゴリCRUD実装(API: GET/POST /api/categories, PATCH/DELETE /api/categories/:id、画面: /categories)、実データベースでの動作確認(作成・更新・一意制約違反・削除) |
| 2026-08-23 | 17:01 | 17:08 | 7m | プロンプト・バージョンCRUD実装(API: GET/POST /api/prompts, GET/PATCH/DELETE /api/prompts/:id, GET /api/prompts/:id/versions、画面: /prompts一覧・/prompts/new・/prompts/:idの編集/バージョン履歴タブ)、実データベースでの動作確認(バージョン採番・カテゴリ削除時のSetNull・プロンプト削除時のバージョンカスケード削除) |
