---
name: ai-feature-scaffold
description: This skill should be used when the user asks to "AI機能を追加して", "新しいAIドメインを作って", "Reviewと同じパターンで作って", "Evaluationみたいな機能を追加", or wants a new Claude-powered feature (structured output over a prompt) added to this app following the existing Review(Phase 2)/Evaluation(Phase 5) pattern. Not for changes to an existing domain — only for scaffolding a brand-new one.
---

# 新しいAI機能ドメインの雛形作成

このプロジェクトでは「プロンプト(PromptVersion)を使ってClaudeを呼び、構造化出力を個別レコードとしてDBに保存する」という同じ形のドメインを複数回作っている(Phase 2の`Review`/`ReviewComment`、Phase 5の`Evaluation`/`EvaluationFinding`)。新しいAI機能(例: 「テキスト評価」「別の分析機能」)を追加するときは、既存パターンを踏襲することでバグと設計の手戻りを減らす。

**着手前に`references/pattern-checklist.md`を読み、そこに列挙された参照ファイル(review-schema.ts・evaluation-schema.tsなど)を実際に読んで現在のコードの形を確認する。** このSKILL.md自体にはコードを書き写さない(コードは変わるが、このファイルは更新されにくいため陳腐化する)。

## 進め方

1. **ユーザーと要件を確認する**: 入力形式(テキストのみか、画像などマルチモーダルか)、構造化出力の形(EvaluationのようなFinding配列か、単一の判定か)、既存ドメインとの関係(独立した新モデルか、既存モデルの拡張か)。既存2ドメインは「Reviewはコード差分専用のフィールドを持ち既存機能と深く統合されているため無理に汎用化しない」という判断をしている(docs/phases/phase5-design.md参照) — 新ドメインも同様に、既存モデルを汎用化するより新設する方が安全な場合が多い。
2. **DBスキーマを追加する**: `references/pattern-checklist.md`のFKパターンに従い`prisma/schema.prisma`にモデルを追加、`npx prisma migrate dev`でマイグレーションを作成・適用する。
3. **構造化出力スキーマを作る**: `src/lib/<domain>-schema.ts`にzodスキーマを定義する(`review-schema.ts`/`evaluation-schema.ts`と同じ形)。ユニットテストも対で作る。
4. **APIルートを実装する**: `src/lib/run-ai-execution.ts`の`runAiExecution()`を使い、認証チェック→(必要なら所有権/参照先の存在チェック)→レート制限チェック→AI呼び出し→`$transaction`での保存、という既存ルートと同じ順序で実装する。AI失敗時にHTTP 201ではなく200を返す(成功と失敗を区別しつつ、リクエスト自体は成立している)という既存の判断も踏襲する。
5. **レート制限にpurposeを追加する**: `src/lib/rate-limit.ts`に新しい`purpose`(例: `"evaluation"`)を追加する(RateLimitBucketは`userId × windowStart × purpose`で分離されているため、既存の実行系レート制限と独立してカウントできる)。
6. **統合テストを追加する**: `route.integration.test.ts`に、既存パターンと同じ観点(未認証401、他ユーザー/存在しない参照先への400または404、レート制限429、AI成功時201、AI失敗時200かつ201にしない)を最低限カバーする。
7. **UIを実装する**: 一覧+新規作成フォーム(`evaluation-manager.tsx`相当)と詳細画面(`[id]/page.tsx`相当)。`useApiMutation`フックを使い、二重送信ガード(`pending`は`mutate()`呼び出し以降のみtrueになる点に注意。ファイル読み込み等mutate呼び出し前に非同期処理が挟まる場合は別途busyフラグでガードする)、`ConfirmDialog`での削除確認、`useToast`での成功フィードバックを既存画面と揃える。
8. **導線を追加する**: ヘッダーナビゲーション(`app-header.tsx`)・`/help`ページ・`/dashboard`の集計タイルに新ドメインへのリンクを追加する。
9. **ドキュメントを更新する**: 対応するdocs/phases/phaseN-design.mdのステータス、`docs/db-design.md`への新モデルの追記、`ai-dev-tool-handoff.md`・`README.md`の進捗欄を更新する。
10. **検証する**: `npx eslint .`・`npm test`・`npm run build`・`npm run test:integration`をすべて実行し、既存テストを壊していないことを確認する。

## 参照ファイル

- **`references/pattern-checklist.md`** — FKパターン・レート制限・エラーハンドリングなど、既存2ドメインの実装から抽出した詳細チェックリストと、読むべき具体的なファイルパス一覧
