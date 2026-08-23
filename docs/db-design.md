# DB設計(Phase 1)

Phase 1(プロンプト管理ツール)に必要なテーブル構成。スキーマの実体は [`prisma/schema.prisma`](../prisma/schema.prisma)。ORMはPrisma。

## テーブル一覧

### 認証(NextAuth.js / GitHub OAuth)

NextAuthのPrisma Adapterが要求する標準スキーマ([公式ドキュメント](https://authjs.dev/getting-started/adapters/prisma))にそのまま準拠。Phase 2のGitHub連携でも同じ認証基盤を再利用する。

- `User` — ユーザー本体。プロンプト・カテゴリ・実行履歴の所有者
- `Account` — OAuthプロバイダ(GitHub)との連携情報
- `Session` — セッション管理
- `VerificationToken` — メール等の検証用トークン(将来の拡張用)

### プロンプト管理ドメイン

- `Category` — プロンプトのカテゴリ分け。ユーザーごとに名前は一意
- `Prompt` — プロンプトの器(タイトル・所属カテゴリ・所有者)。本文は持たない
- `PromptVersion` — プロンプト本文の実体。編集のたびに新しい行を追加し、既存行は上書きしない(バージョン履歴)
- `Execution` — AI API実行結果。どの`PromptVersion`で実行したかを記録し、実行時点のプロンプト内容を後から追跡できるようにする

## 設計上の判断

- **本文をPromptではなくPromptVersionに持たせた理由**: 「実行履歴・バージョン管理(過去の実行結果とプロンプトの変更履歴を保存)」という要件上、"どのバージョンで何を実行したか"を後から正確に辿れる必要があるため、Prompt本体には本文を持たせず、常にバージョン行を経由する設計にした。最新版の判定は`versionNumber`の最大値、または`createdAt`降順で取得する。
- **CategoryはPromptに対して任意(nullable)**: 未分類のプロンプトを許容するため、`categoryId`はnullable。カテゴリ削除時は`Prompt.categoryId`を`null`にする(`onDelete: SetNull`)。
- **Executionは`promptId`を持たず`promptVersionId`のみでPromptを参照する**: 当初`promptId`と`promptVersionId`を両方持たせていたが、両者が食い違う(=実行対象のバージョンと記録上のPromptが一致しない)不整合を構造上防ぐため、`promptVersionId`経由の間接参照のみに統一した。特定Promptの実行履歴一覧は`Execution.findMany({ where: { promptVersion: { promptId } } })`のようにネストしたリレーションで取得する。
- **`Execution.resultText`はnullable**: `status: FAILED`(APIエラー・タイムアウト等で出力が得られない実行)を表現できるようにするため、本文なしでも保存できるようにした。
- **`PromptVersion.versionNumber`の採番はアプリケーション側でmax+1**: 同一Promptに対する同時編集リクエストが競合した場合、`@@unique([promptId, versionNumber])`の制約により片方が失敗しうる(データ不整合ではなくリクエスト失敗)。単一ユーザーが自分のプロンプトを編集する用途では発生頻度は低いと判断し、Phase 1では許容する。将来的に問題になる場合はリトライ処理を追加する。
- **Executionの`variables`はJson型**: プロンプト内の変数(テンプレート変数)は機能ごとに形が変わるため、リレーショナルに正規化せずJSONで保持する。
- **pgvector**: Phase 3のRAG機能で同一PostgreSQL内にベクトル列を追加する想定(設計ドキュメント参照)。Phase 1時点では未使用のため、拡張の有効化やベクトル列の追加はPhase 3着手時に行う。

## 今回のスコープ

このタスクではスキーマ定義(`prisma/schema.prisma`)と`prisma generate`によるクライアント生成までを実施し、実データベースへの接続・マイグレーション実行(`prisma migrate dev`)は行っていない。DB環境構築は別タスクで対応する。
