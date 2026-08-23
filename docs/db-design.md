# DB設計

Phase 1(プロンプト管理ツール)・Phase 2(AIコードレビューツール)に必要なテーブル構成。スキーマの実体は [`prisma/schema.prisma`](../prisma/schema.prisma)。ORMはPrisma。

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
- `RateLimitBucket` — プロンプト実行・AIレビュー実行の共通レート制限カウンタ(ユーザー×固定ウィンドウ単位)

### AIコードレビュードメイン(Phase 2)

GitHub OAuthのアクセストークンは、Phase 1の認証ですでに`Account.access_token`に保存されているものを再利用する(Phase 2専用のトークン保存は行わない)。

- `Repository` — ユーザーがai-forgeに接続したGitHubリポジトリ。`githubRepoId`(GitHub側の数値ID)で一意に識別する
- `Review` — PRに対するAIレビューの実行単位。どのリポジトリ・PR・`PromptVersion`(レビュー用プロンプト)・`Execution`(実際のAI呼び出し)に対応するかを記録する
- `ReviewComment` — AIレビューが指摘した個別の指摘事項(ファイルパス・行・重要度・本文)。`Review`に対して複数持つ

## 設計上の判断

- **本文をPromptではなくPromptVersionに持たせた理由**: 「実行履歴・バージョン管理(過去の実行結果とプロンプトの変更履歴を保存)」という要件上、"どのバージョンで何を実行したか"を後から正確に辿れる必要があるため、Prompt本体には本文を持たせず、常にバージョン行を経由する設計にした。最新版の判定は`versionNumber`の最大値、または`createdAt`降順で取得する。
- **CategoryはPromptに対して任意(nullable)**: 未分類のプロンプトを許容するため、`categoryId`はnullable。カテゴリ削除時は`Prompt.categoryId`を`null`にする(`onDelete: SetNull`)。
- **Executionは`promptId`を持たず`promptVersionId`のみでPromptを参照する**: 当初`promptId`と`promptVersionId`を両方持たせていたが、両者が食い違う(=実行対象のバージョンと記録上のPromptが一致しない)不整合を構造上防ぐため、`promptVersionId`経由の間接参照のみに統一した。特定Promptの実行履歴一覧は`Execution.findMany({ where: { promptVersion: { promptId } } })`のようにネストしたリレーションで取得する。
- **`Execution.resultText`はnullable**: `status: FAILED`(APIエラー・タイムアウト等で出力が得られない実行)を表現できるようにするため、本文なしでも保存できるようにした。
- **`PromptVersion.versionNumber`の採番はアプリケーション側でmax+1**: 同一Promptに対する同時編集リクエストが競合した場合、`@@unique([promptId, versionNumber])`の制約により片方が失敗しうる(データ不整合ではなくリクエスト失敗)。単一ユーザーが自分のプロンプトを編集する用途では発生頻度は低いと判断し、Phase 1では許容する。将来的に問題になる場合はリトライ処理を追加する。
- **Executionの`variables`はJson型**: プロンプト内の変数(テンプレート変数)は機能ごとに形が変わるため、リレーショナルに正規化せずJSONで保持する。
- **pgvector**: Phase 3のRAG機能で同一PostgreSQL内にベクトル列を追加する想定(設計ドキュメント参照)。Phase 1時点では未使用のため、拡張の有効化やベクトル列の追加はPhase 3着手時に行う。
- **RateLimitBucketは`Execution`の件数をSELECTするのではなく専用カウンタで実装**: 当初は直近1時間の`Execution`件数を数える方式だったが、「件数を数える→実行を記録する」の間に別リクエストが割り込めるTOCTOUレースがあり、同時リクエストで上限を超えて呼び出せてしまう問題があった。`@@id([userId, windowStart])`の複合主キーに対する`upsert`(`count: { increment: 1 }`)はPostgres側で`INSERT ... ON CONFLICT DO UPDATE`としてアトミックに実行されるため、このレースが起きない。あわせて、成長し続ける`Execution`テーブルを都度COUNTする(インデックスが無ければフルスキャンになる)コストも避けられる。

### Phase 2の設計判断

- **Reviewは実際のAI呼び出しをExecutionに委譲する**: 「Phase 1・2・3で使うAI呼び出しの仕組みを一元化する」という狙い([`ai-dev-tool-handoff.md`](../ai-dev-tool-handoff.md))に沿い、レビューもプロンプト実行の一種として扱う。`Review.executionId`は任意(実行前は`null`)かつ一意で、1レビュー=1実行に対応する。トークン数・実行時間・成功/失敗といった実行そのものの情報はExecution側に持たせ、Reviewはリポジトリ・PRという文脈情報のみを持つ。
- **`Review.promptVersionId`は`onDelete: Restrict`(Executionは`Cascade`)**: Executionは「その場の実行ログ」として、参照先のPromptVersionが消えれば一緒に消えてよいと判断した(Phase 1の設計判断)。一方Reviewは「指摘内容をDBに保存し、傾向を可視化する」蓄積データであり、後から参照するプロンプト資産(PromptVersion)を誤って削除してレビュー履歴が失われることを防ぐため、あえて挙動を変えてRestrictにした。レビューで使ったプロンプトのバージョンを消したい場合は、先にそのバージョンを使ったReviewを削除する必要がある。
- **`Repository.githubRepoId`は`BigInt`**: GitHubのリポジトリIDはPostgresの`Int`(32bit)の範囲を超える可能性があるため、`BigInt`で保持する。リポジトリ名(`owner`/`name`)は変更され得るため、識別子としては使わずGitHub側のIDを正とする。
- **ReviewCommentはReview経由のみでPromptVersionを参照しない**: 個別の指摘はレビュー単位に従属する情報であり、どのプロンプトで生成されたかは親のReviewを辿れば分かるため、冗長な外部キーは持たせない(Execution/PromptVersion/Promptの関係と同様の考え方)。

## DB環境構築

`docker-compose.yml`でpgvector/pgvector:pg16イメージのPostgresをローカルに起動し、`prisma migrate dev`で初期マイグレーション(`prisma/migrations/20260823044341_init`)を適用済み。セットアップ手順は[README](../README.md)を参照。
