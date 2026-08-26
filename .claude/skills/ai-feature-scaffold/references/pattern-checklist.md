# 新規AI機能ドメインの詳細チェックリスト

Review(Phase 2)・Evaluation(Phase 5)の実装から抽出したパターン。新しいドメインを作る前に、ここに挙がっているファイルを実際に読み、現在のコードと照合すること(このファイルはスナップショットであり、コード自体が正)。

## 1. Prismaモデル

参照: `prisma/schema.prisma`の`Review`/`ReviewComment`(Phase 2セクション)・`Evaluation`/`EvaluationFinding`(Phase 5セクション)。

FKパターン:
- `promptVersionId String` + `promptVersion PromptVersion @relation(..., onDelete: Restrict)` — 使ったプロンプトを削除しても実行履歴が消えないよう`Restrict`にする(`Execution`は`onDelete: Cascade`だが、蓄積データとして保持を優先する場合は`Restrict`)。
- `executionId String? @unique` + `execution Execution? @relation(..., onDelete: SetNull)` — 実際のAI呼び出しは`Execution`に委譲するため、親レコード側から1:1で参照する。`Execution`削除時にレコード自体は残るよう`SetNull`。
- `userId String` + `user User @relation(..., onDelete: Cascade)` — 所有者。ユーザー削除時は連動削除。
- ステータス管理: `status`列にenum(`PENDING`/`SUCCESS`/`FAILED`)を持たせ、コメント/指摘の子モデルへは`onDelete: Cascade`。
- 埋め込み検索(RAG)対象にする場合は`ReviewCommentEmbedding`/`PromptVersionEmbedding`/`ExecutionEmbedding`と同じ「別テーブルに1:1で`Unsupported("vector(1024)")`を持たせる」パターンに従う(docs/db-design.md参照)。

マイグレーション: `npx prisma migrate dev --name <説明>`。pgvectorのUnsupported列を含む既存テーブルに手を入れる場合は、`prisma migrate dev`が生成する差分に既存HNSWインデックスへの意図しないDROP INDEXが混入していないか確認する(docs/db-design.mdの「Phase 4(項目1)の設計判断」に実例あり)。

## 2. 構造化出力スキーマ

参照: `src/lib/review-schema.ts`・`src/lib/evaluation-schema.ts`とその`.test.ts`。

- zodで`{ summary?: string, findings: [...] }`のような形を定義する(単純な判定なら配列を持たない形でもよい)。
- `@anthropic-ai/sdk/helpers/zod`の`zodOutputFormat()`と`anthropic.messages.parse()`の`output_config: { format: zodOutputFormat(Schema) }`を使い、自由記述テキストのパースを避ける。
- `response.parsed_output`が`null`の場合はエラーを投げる(`runAiExecution`の`call`内でthrowすればFAILED実行として記録される)。

## 3. APIルート

参照: `src/app/api/repositories/[id]/reviews/route.ts`・`src/app/api/evaluations/route.ts`・`src/lib/run-ai-execution.ts`。

処理順序(この順を崩さない):
1. `auth()`で認証チェック(401)
2. リクエストボディのバリデーション(型チェック、必須項目、400)
3. 参照先(プロンプト・リポジトリ等)の所有権チェック(自分のものか。見つからない/他人のものは400または404)
4. レート制限チェック(429) — **DB書き込みやAI呼び出しの前に行う**(無駄なAPI呼び出し・カウンタ消費を避けるため)
5. `runAiExecution()`でAI呼び出し。`call`内で入力(画像・テキスト等)を`content`配列に組み立てる
6. 成功時: `$transaction`で親レコード+子レコード(findings等)をまとめて作成し、201を返す
7. 失敗時: 親レコードをFAILEDステータスで作成し、**200を返す(201にしない)** — リクエスト自体は正常に処理され、AI呼び出しが失敗したことを表すため

画像等バイナリ入力を扱う場合、クライアント側のサイズチェックだけに依存せず、サーバー側でも上限を検証する(base64の場合、バイト数の4/3が文字数になる点に注意)。

## 4. レート制限

参照: `src/lib/rate-limit.ts`。

新しい用途ごとに`MAX_<PURPOSE>_PER_WINDOW`定数と`check<Purpose>RateLimit(userId)`関数を追加する。内部で共通の`checkRateLimit(userId, purpose, limit)`を呼ぶだけでよい(`RateLimitBucket`は`userId × windowStart(1時間固定) × purpose`の複合キーでアトミックにカウントするため、新しいpurpose文字列を追加するだけで既存カウンタと独立する)。

## 5. 統合テスト

参照: `src/app/api/evaluations/route.integration.test.ts`・`src/test/db-helpers.ts`。

`createTestUser`/`createTestPrompt`等のヘルパーを使い、実際のPostgresに対して以下を最低限カバーする:
- 未認証401
- 参照先が存在しない/他ユーザーのもの → 400または404
- レート制限上限到達 → 429
- AI呼び出し成功 → 201、期待した構造でDBに保存されている
- AI呼び出し失敗 → 200(201にしない)、ステータスがFAILEDで記録される
- (該当する場合)サーバー側の入力サイズ上限超過 → 400

`afterEach`で`cleanupTestUser(userId)`を呼び、依存順にテストデータを後始末する。

## 6. UI

参照: `src/app/(app)/evaluations/evaluation-manager.tsx`・`src/app/(app)/evaluations/[id]/page.tsx`・`src/lib/use-api-mutation.ts`・`src/components/confirm-dialog.tsx`・`src/components/toast-provider.tsx`。

- `useApiMutation()`の`pending`は`mutate()`呼び出し以降のみtrueになる。ファイル読み込み(FileReader等)のようにmutate呼び出し前に非同期処理が挟まる場合、その区間専用のbusyフラグを別途持たせて二重送信をガードする。
- 削除確認は`window.confirm`ではなく`ConfirmDialog`コンポーネントを使う。
- 成功時のフィードバックは`useToast()`の`showToast()`で統一する。
- 詳細画面は`status`の全パターン(PENDING/SUCCESS/FAILED)それぞれで本文が空白にならないようにする。

## 7. 導線・ドキュメント

- `src/components/app-header.tsx`にナビリンクを追加
- `src/app/(app)/help/page.tsx`に使い方セクションを追加
- `src/app/(app)/dashboard/page.tsx`の集計タイルに件数等を追加
- 対応する`docs/phaseN-design.md`のステータス表記・`docs/db-design.md`・`ai-dev-tool-handoff.md`・`README.md`を更新
