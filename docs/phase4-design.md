# Phase 4 基本設計書(統合基盤の強化)

対象: Phase 1〜3を「別々の機能」から「データを掛け合わせて初めて作れる機能」へ発展させる。アーキテクチャ・認証は [`phase1-design.md`](./phase1-design.md) を、DB設計の全体像は [`db-design.md`](./db-design.md) を参照。**項目1(RAG検索対象の拡張)・項目2(プロジェクト単位のドキュメント管理)・項目3(レビュー指摘蓄積からのプロンプト改善提案)は実装済み。項目4は設計のみで実装は未着手。**

## 概要

現状、RAG検索チャット(`/chat`)が横断しているのは`Document`(Phase 3)と`ReviewComment`(Phase 2)のみで、Phase 1の資産(`Prompt`・`Execution`)はまだ検索対象になっていない。Phase 4では以下の4項目に取り組む。優先順は依存関係の順。

1. RAG検索対象の拡張(`Prompt`・`Execution`の埋め込み) — 他の3項目の土台
2. プロジェクト単位のドキュメント管理
3. レビュー指摘蓄積からのプロンプト改善提案(1に依存)
4. チャットからの直接アクション実行(1に依存)

## 1. RAG検索対象の拡張

### DB設計(案)

既存の`ReviewCommentEmbedding`(`ReviewComment`に1:1で埋め込みを追加する別テーブル)と同じパターンを踏襲する。

```mermaid
erDiagram
    PROMPTVERSION ||--|| PROMPT_VERSION_EMBEDDING : has
    EXECUTION ||--o| EXECUTION_EMBEDDING : has

    PROMPT_VERSION_EMBEDDING {
        string promptVersionId PK_FK
        vector embedding "vector(1024), Unsupported"
    }
    EXECUTION_EMBEDDING {
        string executionId PK_FK
        vector embedding "vector(1024), Unsupported"
    }
```

- **`PromptVersionEmbedding`** — `PromptVersion.content`をそのまま1つの埋め込みにする(`DocumentChunk`のような見出し単位の分割はしない。プロンプト本文はドキュメントほど長くならない想定のため)。新しいバージョンが保存されるたびに、そのバージョンの分だけ生成する(過去バージョンは差し替えない。バージョンごとに検索できた方が「このバージョンの頃はこう書いていた」を追える)
- **`ExecutionEmbedding`** — `Execution.resultText`の埋め込み。**`Execution.reviewId`が無い(＝Phase 2のレビュー実行ではない、Phase 1のプロンプト実行由来の)`SUCCESS`な実行のみを対象とする**。レビュー由来のExecutionは、その中身が`ReviewComment`として既に個別に埋め込み済みであり、resultText全体(JSON形式の構造化出力)をそのまま埋め込むと内容が重複するため

### 検索・埋め込み生成

`src/lib/chat-context.ts`の`SearchHit`共用体に`"prompt_version"` / `"execution"`を追加し、`src/lib/embeddings.ts`に`searchPromptVersions()` / `searchExecutions()`を追加する(既存の`searchDocumentChunks()` / `searchReviewComments()`と同じ形: `$queryRaw`でコサイン距離検索)。`ChatSource`にも出典として`/prompts/:id`(バージョン履歴タブ)・`/prompts/:id`(実行履歴タブ)へのリンクを追加する。

埋め込み生成は既存の3ルート(`/api/documents`・`/api/documents/sync`・レビュー作成時)と同じ「ベストエフォート」方針にする(失敗してもプロンプト保存・実行自体は失敗させず、`ErrorLog`に記録するのみ)。

- `PromptVersion`の埋め込み: `PATCH /api/prompts/:id`で新バージョンを作成した直後に生成
- `Execution`の埋め込み: `runAiExecution()`の呼び出し元(`POST /api/prompts/:id/execute`)で、reviewを伴わない`SUCCESS`実行の場合のみ生成

### 既存データのバックフィル

既存の`POST /api/review-comments/backfill-embeddings`と同じ形で、`POST /api/prompt-versions/backfill-embeddings`・`POST /api/executions/backfill-embeddings`を追加する(1回`LIST_LIMIT`件まで処理し`remaining`で継続可否を返す)。`/documents`ページの「検索対象の取り込み」セクションに、未処理件数の表示とあわせて追加する。

## 2. プロジェクト単位のドキュメント管理(実装済み)

`docs/phase3-design.md`の「今後の拡張候補」で既に構想済みの内容を、Phase 4として実装した。

- **DB**: `Document`に`repositoryId String?`(FK、`onDelete: Cascade`)を追加。既存の`Repository`解除時に紐づく`Review`が全削除される設計([`db-design.md`](./db-design.md)参照)と同じ考え方を踏襲し、リポジトリ接続を解除したら同期済みドキュメントも一緒に消える。ユニーク制約は`[userId, sourcePath]`から`[userId, repositoryId, sourcePath]`に変更(リポジトリをまたいで同じファイル名(例: `README.md`)が存在しうるため)
- **同期方式の違い**: ai-forge自身の同期(`POST /api/documents/sync`)はローカルの`fs`から直接読むが、接続済みリポジトリの同期(`POST /api/repositories/:id/documents/sync`)はGitHub API経由(`octokit`の`repos.getContent`)で取得する。対象範囲は両者で揃え、ルートの`README.md`・`docs/`配下のMarkdownファイルのみとした(ai-forge自身の`ai-dev-tool-handoff.md`のような追加のルートファイルは他リポジトリでは前提にできないため対象外)。共通する「チャンク分割→埋め込み生成→Documentを作り直す」処理は`src/lib/document-sync.ts`の`syncMarkdownDocuments()`に切り出し、取得方法の違い(fs vs GitHub API)だけを呼び出し元で吸収している
- **画面**: `/documents`に「接続済みリポジトリの設計書を同期」カードを追加(ai-forge自身の同期カードとは別立て。対象リポジトリをセレクトボックスで選ぶ)。`/chat`にも対象リポジトリの絞り込みセレクトを追加(未指定時は全件横断のまま)
- **`/chat`の絞り込み範囲**: `Document`(このリポジトリに同期されたもの)に加えて、`ReviewComment`も`Review.repositoryId`で同じリポジトリに絞り込む(Reviewはリポジトリに紐づく概念のため)。一方`PromptVersion`・`Execution`はどのリポジトリにも紐づかない(プロンプトは複数リポジトリで使い回される)ため、絞り込み時も対象外にせず常に横断検索する

## 3. レビュー指摘蓄積からのプロンプト改善提案(実装済み)

### 方針: 独自のパターン検出ロジックは作らない

「同じ種類の指摘が繰り返されているか」を判定する専用のクラスタリングロジックを自前で作るのではなく、**Claude自身に過去のレビュー指摘一覧を渡して分析させる**。Phase 2で確立した「構造化出力で判断させる」というこのプロジェクトの一貫したやり方に合わせる。

- 対象プロンプトの過去`Review`(`promptVersionId`経由)から`ReviewComment`を新しい順に一定件数取得
- 元のプロンプト本文+指摘一覧をメタプロンプトとしてClaudeに渡し、「繰り返し発生している指摘パターン」「プロンプトの改善案」を構造化出力で受け取る
- **永続化しない**: 生成のたびにClaudeを呼び直す設計にする(専用テーブルを増やさず、まずは「プロンプト詳細画面に改善案を見るボタンを置く」程度のシンプルな実装に留める。反応が良ければ提案履歴の保存を検討)
- **`runAiExecution()`は使わない**: Review/Evaluationと異なり`Execution`レコードを作らずAnthropic APIを直接呼び出す。理由は2つ。(1)`Execution`は`/prompts/:id`の「実行履歴」タブに表示されるため、プロンプト本文を実行したわけではないメタ分析結果が混ざると紛らわしい。(2)`POST /api/executions/backfill-embeddings`は`review: null`のSUCCESS Executionを無差別に埋め込み対象にする(`evaluation: null`は見ていない)ため、Execution化するとメタ分析結果がRAG検索の対象として紛れ込んでしまう

### 画面

プロンプト詳細画面(`/prompts/:id`)の編集タブの下に「レビュー指摘からの改善提案」ボタンを追加(`src/app/(app)/prompts/[id]/improvement-suggestions.tsx`)。過去に一度もレビューで使われていないプロンプト(過去の`SUCCESS`な`ReviewComment`が0件)では非表示。API: `POST /api/prompts/:id/improvement-suggestions`(レート制限は専用purpose `improvement-suggestion`、1時間10回)。

## 4. チャットからの直接アクション実行

4項目の中で最もリスクが高い(検索して答えるだけだった`/chat`が、実際に副作用のある操作を行うようになる)。以下の制約を設ける。

### スコープを絞る

Phase 4では**「保存済みプロンプトでのAIレビュー実行」1種類のみ**に対応する。それ以外(リポジトリの接続解除、プロンプトの削除など破壊的な操作)はチャットからは一切実行できないようにする。既存の`POST /api/repositories/:id/reviews`をそのまま呼び出す形にし、認可チェック・レート制限は新たに実装せず既存のものをそのまま通す。

### 実現方式: Claudeのtool use + 確認ステップ

自然文から「レビューを実行したい」という意図とパラメータ(リポジトリ・PR番号・使うプロンプト)を抽出するために、Anthropic APIのtool use(function calling)を使う。ただし**曖昧な発話から即座に実行はしない**。

1. ユーザーの発話をtool useで解析し、実行したい操作とパラメータの候補を抽出
2. 「次の操作を実行します: リポジトリ`owner/repo`のPR #123を、プロンプト『コードレビュー用』でレビュー」という確認内容を、既存の`ConfirmDialog`コンポーネントで表示
3. ユーザーが確認した場合のみ実際にAPIを呼び出す

人間の確認を挟むことで、AIが誤読したパラメータのまま実行される事故を防ぐ(このプロジェクト自体の開発でも、AIに任せきりにせず人間が最終確認する場面が重要だったのと同じ考え方)。

## まとめ: 実装順序

1. `PromptVersionEmbedding` / `ExecutionEmbedding`の追加、検索・バックフィルの実装(1)
2. プロジェクト単位のドキュメント管理(2。1と並行で着手可能)
3. プロンプト改善提案(3。1に依存)
4. チャットからのアクション実行(4。1に依存。最もリスクが高いため最後)

## 今後の拡張候補

- プロンプト改善提案の永続化・提案履歴の管理
- チャットから実行できるアクションの種類を増やす(スコープを絞ってきた前提をどこまで緩めるかは、実際の利用状況を見てから判断する)
