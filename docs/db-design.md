# DB設計

Phase 1(プロンプト管理ツール)・Phase 2(AIコードレビューツール)・Phase 3(RAG検索チャットボット、ドキュメント取り込みまで)・Phase 4項目1(RAG検索対象の拡張)・Phase 5(汎用AI評価ツール、画像評価プロトタイプ)に必要なテーブル構成。スキーマの実体は [`prisma/schema.prisma`](../prisma/schema.prisma)。ORMはPrisma。詳細は[`phase3-design.md`](./phase3-design.md)・[`phase4-design.md`](./phase4-design.md)・[`phase5-design.md`](./phase5-design.md)を参照。

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
- `ErrorLog` — 想定外エラーの収集ログ(サーバー側は`instrumentation.ts`、クライアント側は`error.tsx`/`global-error.tsx`経由)

いずれも品質・UX改善タスクで追加したテーブル。実装の詳細は [`quality-improvements.md`](./quality-improvements.md) を参照。

### AIコードレビュードメイン(Phase 2)

GitHub OAuthのアクセストークンは、Phase 1の認証ですでに`Account.access_token`に保存されているものを再利用する(Phase 2専用のトークン保存は行わない)。GitHub Appのユーザートークンは約8時間で失効する仕様のため、`getGitHubClient()`(`src/lib/github.ts`)が`expires_at`を見て`refresh_token`から自動更新する。`access_token`/`refresh_token`はDBカラム上はいずれも平文の`String? @db.Text`のままだが、アプリケーション層(`src/lib/token-crypto.ts`、AES-256-GCM、鍵は`TOKEN_ENCRYPTION_KEY`)で暗号化してから保存する。書き込み経路は初回ログイン連携時(`src/auth.ts`でPrismaAdapterの`linkAccount`をラップ)とトークン自動更新時の2箇所のみ。暗号化導入前に保存された平文データは、`getGitHubClient()`が読み取った際に検知して暗号化し直すことで、専用の移行スクリプトなしに自然に移行する。

- `Repository` — ユーザーがai-forgeに接続したGitHubリポジトリ。`githubRepoId`(GitHub側の数値ID)で一意に識別する
- `Review` — PRに対するAIレビューの実行単位。どのリポジトリ・PR・`PromptVersion`(レビュー用プロンプト)・`Execution`(実際のAI呼び出し)に対応するかを記録する
- `ReviewComment` — AIレビューが指摘した個別の指摘事項(ファイルパス・行・重要度・本文)。`Review`に対して複数持つ

### RAG検索チャットボットドメイン(Phase 3)

pgvector拡張(`vector`、0.8.6)をここで初めて有効化した。詳細は[`phase3-design.md`](./phase3-design.md)を参照。

- `Document` — 取り込んだドキュメント本体(手動貼り付け、またはリポジトリファイル同期)
- `DocumentChunk` — `Document`を見出し単位で分割した1チャンク。埋め込みベクトル(`vector(1024)`)を持つ
- `ReviewCommentEmbedding` — `ReviewComment`に対する埋め込みを1:1で追加する別テーブル

### RAG検索対象の拡張(Phase 4項目1)

`Document`・`ReviewComment`に続き、Phase 1の資産(`PromptVersion`・`Execution`)もRAG検索チャット(`/chat`)の検索対象にする。詳細は[`phase4-design.md`](./phase4-design.md)を参照。

### プロジェクト単位のドキュメント管理(Phase 4項目2)

`Document`に`repositoryId String?`(FK、`onDelete: Cascade`)を追加し、接続済み`Repository`ごとにドキュメントを紐付けられるようにした。ユニーク制約も`[userId, sourcePath]`から`[userId, repositoryId, sourcePath]`に変更している(リポジトリをまたいだ同名ファイルを区別するため)。ただしPostgresのユニークインデックスは複合キー中のNULLを区別可能として扱うため、この制約だけではrepositoryId IS NULL(ai-forge自身の同期)同士の重複を防げない。そのため`(userId, sourcePath) WHERE repositoryId IS NULL`の部分ユニークインデックスを追加のマイグレーションで補っている(`schema.prisma`の`@@unique`では部分インデックスを表現できないため、`DocumentChunk`等のHNSWインデックスと同じく手動追加)。詳細は[`phase4-design.md`](./phase4-design.md)を参照。

- `PromptVersionEmbedding` — `PromptVersion.content`に対する埋め込みを1:1で追加する別テーブル(`ReviewCommentEmbedding`と同じパターン)。新しいバージョンが保存されるたびに生成し、過去バージョンは差し替えない
- `ExecutionEmbedding` — `Execution.resultText`に対する埋め込みを1:1で追加する別テーブル。`reviewId`が無い(Phase 2のレビュー実行ではない)`SUCCESS`な実行のみを対象とする。レビュー由来の`resultText`は既に`ReviewComment`として個別に埋め込み済みのため、重複を避けてあえて対象外にしている

### チャットからの直接アクション実行(Phase 4項目4)

`Review`に`triggeredVia ReviewTrigger`(`UI` | `CHAT`、デフォルト`UI`)を追加した。UIの「オープンなPR」タブからの実行とチャットからの実行はいずれも同じ`POST /api/repositories/:id/reviews`・同じ`Review`テーブルを使うため、履歴上でどちらから実行したかを区別する目的だけの列。既存データは移行なしにUI扱いのままで問題ない。詳細は[`phase4-design.md`](./phase4-design.md)を参照。

### 汎用AI評価ドメイン(Phase 5)

コードレビュー(`Review`)とは意図的に分離した並行の概念。詳細は[`phase5-design.md`](./phase5-design.md)を参照。

- `Evaluation` — 1回のAI評価の実行単位。`Review`と同じ構造(`promptVersionId`は`onDelete: Restrict`、`executionId`は`onDelete: SetNull`)で、どのプロンプト・入力形式に対するものかを記録する
- `EvaluationFinding` — AI評価が返した観点別コメント(ラベル・トーン・スコア・本文)。`ReviewComment`のコード非依存版

## 設計上の判断

- **本文をPromptではなくPromptVersionに持たせた理由**: 「実行履歴・バージョン管理(過去の実行結果とプロンプトの変更履歴を保存)」という要件上、"どのバージョンで何を実行したか"を後から正確に辿れる必要があるため、Prompt本体には本文を持たせず、常にバージョン行を経由する設計にした。最新版の判定は`versionNumber`の最大値、または`createdAt`降順で取得する。
- **CategoryはPromptに対して任意(nullable)**: 未分類のプロンプトを許容するため、`categoryId`はnullable。カテゴリ削除時は`Prompt.categoryId`を`null`にする(`onDelete: SetNull`)。
- **Executionは`promptId`を持たず`promptVersionId`のみでPromptを参照する**: 当初`promptId`と`promptVersionId`を両方持たせていたが、両者が食い違う(=実行対象のバージョンと記録上のPromptが一致しない)不整合を構造上防ぐため、`promptVersionId`経由の間接参照のみに統一した。特定Promptの実行履歴一覧は`Execution.findMany({ where: { promptVersion: { promptId } } })`のようにネストしたリレーションで取得する。
- **`Execution.resultText`はnullable**: `status: FAILED`(APIエラー・タイムアウト等で出力が得られない実行)を表現できるようにするため、本文なしでも保存できるようにした。
- **`PromptVersion.versionNumber`の採番はアプリケーション側でmax+1**: 同一Promptに対する同時編集リクエストが競合した場合、`@@unique([promptId, versionNumber])`の制約により片方が失敗しうる(データ不整合ではなくリクエスト失敗)。単一ユーザーが自分のプロンプトを編集する用途では発生頻度は低いと判断し、Phase 1では許容する。将来的に問題になる場合はリトライ処理を追加する。
- **Executionの`variables`はJson型**: プロンプト内の変数(テンプレート変数)は機能ごとに形が変わるため、リレーショナルに正規化せずJSONで保持する。
- **pgvector**: Phase 3のRAG機能で同一PostgreSQL内にベクトル列を追加する想定(設計ドキュメント参照)だった。Phase 1時点では未使用としていたが、Phase 3のドキュメント取り込み実装時に`CREATE EXTENSION vector`で有効化した。
- **RateLimitBucketは`Execution`の件数をSELECTするのではなく専用カウンタで実装**: 当初は直近1時間の`Execution`件数を数える方式だったが、「件数を数える→実行を記録する」の間に別リクエストが割り込めるTOCTOUレースがあり、同時リクエストで上限を超えて呼び出せてしまう問題があった。`@@id([userId, windowStart])`の複合主キーに対する`upsert`(`count: { increment: 1 }`)はPostgres側で`INSERT ... ON CONFLICT DO UPDATE`としてアトミックに実行されるため、このレースが起きない。あわせて、成長し続ける`Execution`テーブルを都度COUNTする(インデックスが無ければフルスキャンになる)コストも避けられる。

- **ErrorLogの`userId`はnullable**: サーバー側の`onRequestError`(`instrumentation.ts`)はNext.jsのリクエストコンテキストからセッション情報を直接取得できないため、多くのサーバーエラーは`userId: null`(ユーザー非紐付け)で記録される。クライアント側の報告(`POST /api/client-errors`)は認証必須のため`userId`が入る。閲覧画面(`/errors`)では、他ユーザーの個人情報漏えいを避けるため「自分の`userId`のログ」と「`userId`がnullの(=システム全体の)ログ」のみを表示し、他ユーザーの`userId`付きログは見せない。
- **ログ保存はbest-effort**: `logError()`は内部で例外を握りつぶす(`prisma.errorLog.create`が失敗してもthrowしない)。エラーログの保存に失敗したことが原因で本来のリクエスト処理やエラーハンドリング自体が失敗する事態を避けるため。
- **主要な外部キーにインデックスを追加**: 当初は`ErrorLog.createdAt`以外に明示的な`@@index`が無く、`Account.userId`(GitHubトークン取得のたびに引かれる)・`Prompt.userId`・`Execution.promptVersionId`/`userId`・`Review.repositoryId`/`userId`・`ReviewComment.reviewId`はいずれもフルスキャンになりうる状態だった。データ量が少ないポートフォリオ運用では体感できる差ではないが、増える前に追加しておくほうが安いと判断し、これらすべてに`@@index`を追加した(`20260823175120_add_hot_path_indexes`)。

### Phase 2の設計判断

- **Reviewは実際のAI呼び出しをExecutionに委譲する**: 「Phase 1・2・3で使うAI呼び出しの仕組みを一元化する」という狙い([`ai-dev-tool-handoff.md`](../ai-dev-tool-handoff.md))に沿い、レビューもプロンプト実行の一種として扱う。`Review.executionId`は任意(実行前は`null`)かつ一意で、1レビュー=1実行に対応する。トークン数・実行時間・成功/失敗といった実行そのものの情報はExecution側に持たせ、Reviewはリポジトリ・PRという文脈情報のみを持つ。
- **`Review.promptVersionId`は`onDelete: Restrict`(Executionは`Cascade`)**: Executionは「その場の実行ログ」として、参照先のPromptVersionが消えれば一緒に消えてよいと判断した(Phase 1の設計判断)。一方Reviewは「指摘内容をDBに保存し、傾向を可視化する」蓄積データであり、後から参照するプロンプト資産(PromptVersion)を誤って削除してレビュー履歴が失われることを防ぐため、あえて挙動を変えてRestrictにした。レビューで使ったプロンプトのバージョンを消したい場合は、先にそのバージョンを使ったReviewを削除する必要がある。
- **`Repository.githubRepoId`は`BigInt`**: GitHubのリポジトリIDはPostgresの`Int`(32bit)の範囲を超える可能性があるため、`BigInt`で保持する。リポジトリ名(`owner`/`name`)は変更され得るため、識別子としては使わずGitHub側のIDを正とする。
- **ReviewCommentはReview経由のみでPromptVersionを参照しない**: 個別の指摘はレビュー単位に従属する情報であり、どのプロンプトで生成されたかは親のReviewを辿れば分かるため、冗長な外部キーは持たせない(Execution/PromptVersion/Promptの関係と同様の考え方)。

### Phase 3の設計判断

- **埋め込みベクトル列はPrismaの`Unsupported("vector(1024)")`として宣言する**: pgvectorの`vector`型はPrismaが標準サポートしていない。`Unsupported`型のフィールドはPrisma Clientの通常のSELECT/INSERTに含められないという制約があるため、埋め込みの読み書き・コサイン類似検索は`$queryRaw`/`$executeRaw`で行う(`src/lib/embeddings.ts`の`setDocumentChunkEmbedding()`)。`DocumentChunk`は先にPrisma経由でembeddingなしの行を作り、直後に`$executeRaw`でembedding列をUPDATEする2段階の書き込みになる
- **`ReviewComment`への埋め込みは別テーブル(`ReviewCommentEmbedding`)に分離する**: `ReviewComment`本体に埋め込み列を追加することもできたが、「AIレビューの指摘」という既存の単一責務・既存クエリへの影響を避けるため、1:1の別テーブルにした
- **埋め込みモデルはVoyage AI(`voyage-3`)**: AnthropicがRAG用途で公式に推奨しているため。詳細・DB設計の全体像は[`phase3-design.md`](./phase3-design.md)を参照
- **Voyage AI呼び出し失敗時はDocument自体を削除する**: `POST /api/documents`で埋め込み生成(`embedDocuments()`)が失敗した場合、chunkだけ作ってembeddingが無いDocumentを残すと「検索対象に見えるが実際はヒットしない」という気づきにくい不整合になる。Reviewの`status: FAILED`のように失敗を記録として残す設計とは異なり、ここでは作り直せる状態(そもそも存在しない)に戻すことを優先した(Phase 1のExecution・Phase 2のReviewとは意図的に異なる判断)
- **pgvectorの類似検索インデックスはHNSW**: `ivfflat`は事前にある程度のデータ件数が無いとクラスタリングの精度が出ない(トレーニングデータ依存)のに対し、HNSWはデータが増えるたびに逐次構築されるため、件数が少ない状態から始まるポートフォリオ運用に向いている
- **`ReviewComment`の埋め込み生成は失敗してもReview自体をロールバックしない**: `Document`とは逆に、`POST /api/repositories/:id/reviews`ではReviewCommentの埋め込み生成(Voyage AI呼び出し)が失敗しても、既に作成済みのReview・ReviewCommentは残す。理由は、AIレビューという主目的の処理は既に成功しており、埋め込みはRAG検索チャットの検索対象を増やすための副次的な処理に過ぎないため。失敗はErrorLogに記録し、埋め込みが無い指摘は`POST /api/review-comments/backfill-embeddings`で後から埋められる
- **RAG検索チャット(`/chat`)のAI呼び出しはExecutionを経由しない**: Phase 1・2のAI呼び出しは`Execution`(`promptVersionId`必須)を通すが、チャットの質問はユーザーが管理する`PromptVersion`ではなくシステム側が組み立てるプロンプトのため、この枠組みには馴染まない。無理に`Execution`へ合わせず、`src/app/api/chat/route.ts`で直接Claudeを呼び出す設計にした
- **リポジトリファイル同期はユーザー入力のパスを受け付けない**: `POST /api/documents/sync`は`docs/*.md`・`README.md`・`ai-dev-tool-handoff.md`という固定の対象一覧のみを読み込む。任意のファイルパスをリクエストで受け取る設計にするとパストラバーサルの懸念があるため、あえて動的な指定を許可していない
- **リポジトリファイル同期は差分検出をせず全置き換え**: 再同期のたびに、同じ`sourcePath`の`Document`を削除してから作り直す。差分(変更されたファイルだけを更新)を検出する実装は複雑さの割にメリットが薄いと判断した(単一ユーザーのポートフォリオ用途では、対象ファイルの総チャンク数がVoyage AIの1回のバッチ呼び出しに収まる規模のため)

### Phase 4(項目1)の設計判断

- **`PromptVersionEmbedding`/`ExecutionEmbedding`も`ReviewCommentEmbedding`と同じ1:1別テーブルパターンを踏襲**: 埋め込み対象が増えるたびに本体テーブルへ埋め込み列を追加していくのではなく、既存パターンを繰り返すことで「埋め込みは`Unsupported`型の別テーブル、読み書きは`$queryRaw`/`$executeRaw`」という設計を一貫させている
- **`prisma migrate dev`で生成した差分をそのまま使わず手で修正した**: `Unsupported`型の列に手動追加したHNSWインデックス(`DocumentChunk`・`ReviewCommentEmbedding`)は`schema.prisma`上で宣言されていないため、Prismaのスキーマ差分検出はこれらを「消えたもの」と誤認識し、生成された`migration.sql`には既存インデックスへの`DROP INDEX`が含まれていた。これをそのまま適用すると本番の類似検索インデックスを消してしまうため、`DROP INDEX`を取り除き、新規2テーブル分の`CREATE INDEX ... USING hnsw`を`20260823224800_add_phase3_rag_schema`と同じ形で手動追加した。`Unsupported`型の列を含むテーブルに対して`prisma migrate dev`を実行するときは、生成された差分に想定外の`DROP INDEX`が無いか必ず確認する必要がある

### Phase 5の設計判断

- **`Evaluation`/`EvaluationFinding`は`Review`/`ReviewComment`を汎用化せず新設した**: `Review`はコード固有のフィールド(`filePath`・`line`)を持ち、既存のリポジトリ「傾向」タブ・RAG出典表示と深く統合されている。無理に汎用化して両方の呼び出し元を分岐だらけにするより、同じFKパターン(`promptVersionId`は`Restrict`、`executionId`は`SetNull`)を踏襲した並行モデルとして新設するほうが、既存機能への影響もレビューの負担も小さいと判断した。理由の詳細は[`phase5-design.md`](./phase5-design.md)を参照
- **`Evaluation`に画像・PDFそのものを保持する列は無い**: いずれもリクエスト内でClaudeに渡すのみでDB/ストレージに永続化しない設計のため(理由は[`phase5-design.md`](./phase5-design.md)「画像の扱い: 保存しない方針」を参照)。結果のテキスト(`Evaluation.summary`・`EvaluationFinding.body`)のみを保存する
- **評価結果(`Evaluation.summary`・`EvaluationFinding.body`)はAES-256-GCMで暗号化して保存する**: 評価対象がPDF(履歴書・契約書等)や写真など個人情報を含みうる入力に広がったため、GitHubトークンと同じ仕組み(`src/lib/token-crypto.ts`)を`src/lib/field-crypto.ts`経由で再利用した。`Execution.resultText`は複数の実行系で共有される列で暗号化が及ばないため、AI評価分はここに実際の内容を書かず固定のプレースホルダー文字列に留めている(実行履歴タブ・RAG埋め込みバックフィルなど、AI評価を想定していない箇所からの平文漏えいを防ぐため)。詳細は[`phase5-design.md`](./phase5-design.md)「評価結果の暗号化」を参照

## DB環境構築

`docker-compose.yml`でpgvector/pgvector:pg16イメージのPostgresをローカルに起動し、`prisma migrate dev`で初期マイグレーション(`prisma/migrations/20260823044341_init`)を適用済み。セットアップ手順は[README](../README.md)を参照。
