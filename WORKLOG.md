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
| 2026-08-23 | 17:08 | 17:18 | 10m | Claude実行機能・実行履歴の実装(@anthropic-ai/sdk追加、API: POST /api/prompts/:id/execute, GET /api/prompts/:id/executions、{{変数}}検出・置換ロジック、/prompts/:idの実行/実行履歴タブ)。ANTHROPIC_API_KEY発行手順を案内。APIキー未設定の状態でFAILED実行の記録が正しく動作することを確認(変数抽出・置換ロジックも検証済み) |
| 2026-08-23 | 17:18 | 17:41 | 23m | APIキー課金後にClaude実行が成功することを確認(変数置換→実行→結果/トークン数/実行時間の記録)。PR #5〜#10を依存順にdevへマージ(#7→#8→#9→#10→#5→#6、ドキュメント競合を解消)、devをmainへ統合(PR #11)、マージ済みfeatureブランチを整理。README・ai-dev-tool-handoff.md・docs配下のPhase 1完了に伴うステータス更新 |
| 2026-08-23 | 17:41 | 17:54 | 13m | ドキュメント更新をPR #12(dev)・PR #13(main)としてマージ。設計書アーティファクトをPhase 1完了・mainマージ済みの状態に更新。アプリ内ヘルプページ(/help)を追加(ログイン・カテゴリ・プロンプト編集・バージョン履歴・実行・実行履歴・FAQ)、/promptsヘッダーにリンクを追加 |
| 2026-08-23 | 17:54 | 18:03 | 9m | ヘルプページをPR #14(dev)・PR #15(main)としてマージ。Phase 2のDBスキーマ設計・実装(Repository/Review/ReviewCommentを追加。Reviewは実際のAI呼び出しをExecutionに委譲し、PromptVersionへの参照はRestrictでレビュー履歴を保護)、prisma migrate devで適用、実データベースでRestrict/Cascade制約の動作を確認、docs/db-design.md・ai-dev-tool-handoff.mdを更新 |
