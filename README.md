# ai-forge

[![CI](https://github.com/takubo29new/ai-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/takubo29new/ai-forge/actions/workflows/ci.yml)

統合AI開発支援ツール — プロンプト管理・AIコードレビュー・RAGドキュメント検索チャットボットを段階的に統合するポートフォリオ向けプラットフォーム。v1.0.0としてVercelに本番デプロイ済み。

プロダクトコンセプトや技術スタック、開発ロードマップの詳細は [`ai-dev-tool-handoff.md`](./ai-dev-tool-handoff.md) を参照。開発の記録(実働時間・従来開発との比較・スクリーンショット)は[ポートフォリオ資料](https://claude.ai/code/artifact/e576878d-7b47-4222-b507-0cdd8a970fe6)にまとめている。

## 現在の状態

### Phase 1: プロンプト管理ツール

AIに投げるプロンプトを「コードのように」管理・改善するためのツール。GitHubアカウントでログインし、プロンプトをカテゴリ分けして登録・編集(バージョン履歴つき)、Claudeに実行して結果と実行履歴を確認できる。

- GitHub OAuthログイン(NextAuth.js)
- カテゴリCRUD
- プロンプトCRUD・バージョン履歴(編集のたびに新しいバージョンを追加)
- Claude実行(モデル選択、`{{変数名}}`のテンプレート変数、実行履歴の記録。結果はMarkdownで表示)

設計の詳細は [`docs/phases/phase1-design.md`](./docs/phases/phase1-design.md)(全体設計)、[`docs/db-design.md`](./docs/db-design.md)(DB設計)、[`docs/phases/phase1-ui-design.md`](./docs/phases/phase1-ui-design.md)(画面遷移・UI設計)を参照。

### Phase 2: AIコードレビューツール

GitHubリポジトリを接続し、PRの差分をPhase 1のプロンプト資産でAIレビューできるツール。

- GitHubリポジトリの接続・オープンなPR一覧の取得(`repo`スコープ)
- AIレビュー実行(PRのdiffを`{{diff}}`変数に展開し、Claudeの構造化出力で指摘事項を取得)
- レビュー結果の保存・重要度別(CRITICAL / WARNING / INFO)の一覧表示
- レビュー結果の蓄積・可視化(リポジトリ単位の累計指摘件数・直近レビューの推移・指摘の多いファイル)
- レビュー結果の共有リンク(成功したレビューを、ログイン不要の読み取り専用URLで公開できる。作成前に非公開情報が含まれていないかの確認ダイアログを挟む)

設計の詳細は [`docs/phases/phase2-design.md`](./docs/phases/phase2-design.md)(画面遷移・UI設計・API設計)を参照。

### 品質・運用面の取り組み

- 自動テスト([Vitest](https://vitest.dev)。詳細は[テスト](#テスト)を参照)
- 実行系API(プロンプト実行・AIレビュー)のレート制限(ユーザー×用途ごとに1時間あたりの上限を設定。アトミックなカウンタで実装しTOCTOUレースを回避)
- 確認ダイアログのアクセシビリティ対応(フォーカストラップ・Escで閉じる・背景コンテンツの`inert`化)
- ダークモード手動トグル(OS設定に加え、ユーザーごとの手動切り替えとブラウザへの保存)
- エラーログ収集(サーバー側は`instrumentation.ts`の`onRequestError`、クライアント側はエラーバウンダリ経由でDBに記録し、`/errors`ページで確認可能)
- UI/UXデザインシステム(共通トースト通知・ブランドアクセントカラー・ヘッダーナビのアクティブ表示など)
- GitHubアクセストークンの暗号化保存(AES-256-GCM)・`refresh_token`による自動更新

設計判断の詳細は [`docs/quality-improvements.md`](./docs/quality-improvements.md) を参照。

### Phase 3: RAG検索チャットボット

設計書やAIレビューの指摘をベクトル検索の対象とし、自然文の質問にClaudeが出典付きで回答するチャットボット。埋め込みは[Voyage AI](https://www.voyageai.com/)の`voyage-3`を使用する。

- pgvector拡張を有効化し、`Document`/`DocumentChunk`/`ReviewCommentEmbedding`のスキーマを追加(HNSWインデックスでのコサイン類似検索)
- ドキュメント取り込み(`/documents`。タイトル+本文を見出し単位でチャンク分割し、埋め込みを生成)
- ai-forge自身の設計書の自動同期(`docs/*.md`・`README.md`・`ai-dev-tool-handoff.md`を自動取り込み。再同期で最新内容に作り直す)。接続済みのGitHubリポジトリごとの同期はPhase 4で対応(下記)
- 既存レビュー指摘の埋め込みバックフィル(新規レビューは自動、既存分は`/documents`の「既存のレビュー指摘を取り込む」ボタンから)
- RAG検索チャット(`/chat`。ドキュメント・レビュー指摘を横断検索し、Claudeが出典付きで回答)
- 統合ダッシュボード(`/dashboard`。プロンプト数・接続リポジトリ数・累計レビュー指摘件数・登録ドキュメント数の横断サマリ)

画面遷移・DB設計・実装状況は [`docs/phases/phase3-design.md`](./docs/phases/phase3-design.md) を参照。

### Phase 4: 統合基盤の強化

Phase 1〜3を「別々の機能」から「データを掛け合わせて初めて作れる機能」へ発展させる4項目をすべて実装済み。

- **RAG検索対象の拡張**: `PromptVersion`(プロンプト本文)・`Execution`(レビュー・AI評価由来を除くプロンプト実行結果)を`PromptVersionEmbedding`/`ExecutionEmbedding`として埋め込み、`/chat`の検索対象に追加。既存データの一括埋め込み(バックフィル)API・`/documents`ページのボタンも実装
- **プロジェクト単位のドキュメント管理**: `Document`に`repositoryId`(任意)を追加し、「リポジトリ」ページで接続したGitHubリポジトリごとにdocs/配下・README.mdをGitHub API経由で同期(`/documents`の「接続済みリポジトリの設計書を同期」)。`/chat`にも対象リポジトリの絞り込みセレクトを追加
- **レビュー指摘蓄積からのプロンプト改善提案**: プロンプト詳細画面(`/prompts/:id`)から、過去のAIレビュー指摘を分析してプロンプトの改善案をClaudeに構造化出力で生成させるボタンを追加(永続化はせず、押すたびに生成し直す)
- **チャットからの直接アクション実行**: `/chat`でユーザーの発話をClaudeのtool useで解析し、「保存済みプロンプトでのAIレビュー実行」の意図・パラメータを検出した場合のみ実行内容の確認ダイアログを表示。ユーザーが確認した場合のみ既存の`POST /api/repositories/:id/reviews`を呼び出す(それ以外の操作はチャットから実行不可)

設計・実装状況は [`docs/phases/phase4-design.md`](./docs/phases/phase4-design.md) を参照。

### Phase 5: 汎用AI評価ツール(画像・テキスト・PDF評価、バックグラウンド処理)

コードレビューに限らず、画像・テキスト・PDFなど他の入力形式を評価する汎用AI評価ツールへの拡張。

- `Evaluation`/`EvaluationFinding`をReviewとは独立したモデルとして追加(コード専用のReviewを無理に汎用化しない設計判断)
- `/evaluations`から画像+プロンプトを送信し、Claude Visionで評価・観点別コメント(トーン・スコア)を取得。画像・PDFはDB/ストレージに永続化せず、リクエスト内でClaudeに渡すのみ
- テキスト評価は既存のプロンプト実行と同じ`{{変数名}}`展開を再利用(歌詞・楽譜のテキスト化した楽曲・文章などを評価対象にできる)
- PDF評価はClaudeのドキュメント入力(`type: "document"`)にBase64で渡す。画像評価と同じcontentブロック方式のため、`Evaluation`/バックグラウンド実行の仕組みをそのまま共用(履歴書・契約書・論文などのレビュー用途、20MBまで)
- Claude呼び出しはNext.jsの`after()`でレスポンス送出後にバックグラウンド実行(新規ワーカー・キューは追加せず)。`(app)`レイアウトに常駐するプロバイダがポーリングし、完了を画面をまたいでトースト通知
- 評価結果の共有リンク(成功した評価をログイン不要の読み取り専用URLで公開。レビューの共有リンクと同じ仕組み)
- 通知センター(ヘッダーのベルアイコン)。トーストは見逃しやすいため、評価の完了をサーバー側で`Notification`として残し、未読件数のバッジ表示・既読管理ができる
- プロンプトテンプレート集(`/prompts/new`の「テンプレートから始める」。画像・テキスト・PDFそれぞれの評価用の叩き台プロンプト計10種を選ぶとタイトル・本文が自動入力される)
- 評価結果(総評・観点別コメント)はAES-256-GCMで暗号化して保存(GitHubトークンと同じ仕組み。履歴書・契約書などPDF評価が個人情報を含みうるようになったための対応)

「画像の永続化」(アップロード画像を結果画面に表示する案)は個人情報リスクを理由に見送り済み。設計・実装状況は [`docs/phases/phase5-design.md`](./docs/phases/phase5-design.md) を参照。

## 技術スタック

| 領域 | 技術 |
| --- | --- |
| フロントエンド / バックエンド | Next.js(App Router)+ TypeScript + Tailwind CSS |
| DB | PostgreSQL + pgvector + Prisma(ローカルはDocker) |
| 認証 | NextAuth.js(GitHub OAuth)+ Prisma Adapter |
| AI(実行・レビュー) | Anthropic API(`@anthropic-ai/sdk`) |
| AI(埋め込み) | [Voyage AI](https://www.voyageai.com/)(`voyage-3`) |
| デプロイ | Vercel |

## セットアップ

### 前提

- Node.js
- Docker(ローカルPostgres用)
- GitHub OAuth App(下記手順で作成)
- Anthropic APIキー(下記手順で発行)

### 1. 依存関係のインストール

```bash
npm install
```

### 2. ローカルDBの起動

```bash
docker compose up -d
```

`docker-compose.yml`で`pgvector/pgvector:pg16`イメージのPostgresが`localhost:5432`に起動する(pgvector拡張の有効化自体はPhase 3で行う)。

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env`に以下を設定する。

| 変数 | 内容 |
| --- | --- |
| `DATABASE_URL` | `.env.example`の値のままでdocker composeのPostgresに接続できる |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | [GitHub OAuth App](https://github.com/settings/applications/new)を作成して取得。Authorization callback URLは `http://localhost:3000/api/auth/callback/github` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` 等で生成したランダムな文字列 |
| `NEXTAUTH_URL` | ローカルでは `http://localhost:3000` |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) の「API Keys」で発行(要クレジット残高) |
| `VOYAGE_API_KEY` | [dashboard.voyageai.com](https://dashboard.voyageai.com) で発行(Phase 3のドキュメント埋め込みに使用) |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` 等で生成したランダムな文字列(GitHubのaccess_token/refresh_token、AI評価結果をDBに暗号化して保存するための鍵。既存の`.env`にこの変数が無い状態でアップデートした場合、GitHub連携機能・AI評価機能を使う前に必ず設定すること) |

### 4. DBマイグレーション

```bash
npx prisma migrate dev
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。未ログインの場合は`/login`にリダイレクトされ、GitHubでログインすると`/prompts`(プロンプト一覧)に遷移する。

## テスト

```bash
npm test              # ユニットテスト(DB不要)
npm run test:integration  # ルートレベルの統合テスト(DATABASE_URLへの接続が必要)
```

[Vitest](https://vitest.dev)によるテスト。

- `npm test`: DB・外部APIに依存しない純粋なロジック(`{{変数名}}`の抽出・置換、AIレビューの構造化出力スキーマ)を対象としたユニットテスト
- `npm run test:integration`: `POST /api/prompts/:id/execute`・`POST /api/repositories/:id/reviews`などのRoute Handlerを、実際のPostgresに対して直接呼び出す統合テスト(`*.integration.test.ts`)。GitHub/Anthropicへの外部呼び出しはモックし、認可判定・レート制限・レコード作成などDB込みの挙動を検証する

CIでは両方とも実行される。詳細は[`docs/quality-improvements.md`](./docs/quality-improvements.md)を参照。

## 本番デプロイ(Vercel)

Vercelへのデプロイを想定した構成になっている(実際にv1.0.0をVercelにデプロイして動作確認済み)。

1. **Postgres(pgvector対応)を用意する**: Vercelの「Storage」タブに専用のPostgresが無い場合は、「Integrations」(Marketplace)タブで「Prisma Postgres」または「Neon」を探して接続する。いずれもpgvector拡張に対応している
   - このプロジェクトは`@prisma/adapter-pg`(直接TCP接続のドライバーアダプタ)を使っているため、`DATABASE_URL`には**直接接続の文字列**(`postgres://...`)が必要。Accelerateやプーリング用の`prisma+postgres://`・`prisma://`形式は使えない
   - **DBを作成するリージョンを控えておくこと**。Vercel Functionのデフォルト実行リージョンは`iad1`(米国東部)だが、DBを日本(`ap-northeast-1`)などの別リージョンに作成すると、すべてのDBアクセスがWAN越しになり体感速度の低下・トランザクションタイムアウトの原因になる。`vercel.json`の`regions`をDBと同じリージョンに合わせること(例: 東京なら`hnd1`。[リージョン一覧](https://vercel.com/docs/regions)参照)
2. **本番用GitHub OAuth Appを用意する**: [GitHub OAuth App](https://github.com/settings/applications/new)を新規作成(ローカル開発用とは別に用意する)。Authorization callback URLはVercelのデプロイURL(例: `https://your-app.vercel.app/api/auth/callback/github`)を指定する
3. **VercelでGitHubリポジトリをインポート**し、以下の環境変数を設定する(`.env.example`参照。値はすべて本番用に新規発行し、ローカルの`.env`とは分ける):
   `DATABASE_URL` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL`(本番ドメイン) / `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` / `TOKEN_ENCRYPTION_KEY`
   - **`DATABASE_URL`は「Sensitive」にしないこと**。Sensitiveな環境変数はFunctionの実行時にしか渡されず、ビルド時に実行される`prisma migrate deploy`から見えなくなり`Connection url is empty`エラーになる。他の変数(ビルド時に使わないもの)はSensitiveのままで問題ない
4. デプロイを実行する。ビルドコマンドは[`vercel.json`](./vercel.json)で`prisma migrate deploy && next build`に設定済みのため、デプロイのたびにDBマイグレーションが自動適用される(初回はpgvector拡張の有効化・HNSWインデックス作成を含む)。`ignoreCommand`により、`main`以外のブランチへのpushではビルド自体をスキップする(Previewデプロイを作らない)設定にしている

## ブランチ運用

| ブランチ | 用途 | 分岐元 | マージ先 |
| --- | --- | --- | --- |
| `main` | 本番相当・保護対象 | - | - |
| `dev` | 統合検証用 | `main` | `main` |
| `feature/xxx` | 機能単位の開発 | `dev` | `dev` |
| `bugfix/xxx` | バグ修正 | `dev` | `dev` |
| `hotfix/xxx` | 本番障害対応 | `main` | `main` と `dev` の両方 |

基本フロー: `feature/xxx` / `bugfix/xxx` を `dev` から切って作業し、`dev` にマージ。検証後、`dev` を `main` にマージしてリリースする。緊急の本番障害対応のみ `hotfix/xxx` を `main` から直接切り、修正後に `main` と `dev` の両方へマージする。

## リリース履歴

バージョンタグ(`vX.Y.Z`)を作成するたびに、その版で何が新しくなったかをまとめたポートフォリオ用プレゼン資料(Artifact)を新規発行している。過去の版の資料は上書きせず残す。

| バージョン | 日付 | 資料 |
| --- | --- | --- |
| v1.0.0 | 2026-08-24 | [ai-forge Build Log](https://claude.ai/code/artifact/e576878d-7b47-4222-b507-0cdd8a970fe6) |
| v1.1.0 | 2026-08-26 | [ai-forge v1.1.0](https://claude.ai/code/artifact/7379d812-9d19-4b52-b36c-126b2980d501) |

## 参考リンク

- [Next.js Documentation](https://nextjs.org/docs)
- [Auth.js (NextAuth.js) Documentation](https://authjs.dev)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Anthropic API Documentation](https://docs.anthropic.com)
