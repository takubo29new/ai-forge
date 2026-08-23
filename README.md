# ai-forge

統合AI開発支援ツール — プロンプト管理・AIコードレビュー・RAGドキュメント検索チャットボットを段階的に統合するポートフォリオ向けプラットフォーム。

プロダクトコンセプトや技術スタック、開発ロードマップの詳細は [`ai-dev-tool-handoff.md`](./ai-dev-tool-handoff.md) を参照。

## 現在の状態: Phase 1(プロンプト管理ツール)

AIに投げるプロンプトを「コードのように」管理・改善するためのツール。GitHubアカウントでログインし、プロンプトをカテゴリ分けして登録・編集(バージョン履歴つき)、Claudeに実行して結果と実行履歴を確認できる。

- GitHub OAuthログイン(NextAuth.js)
- カテゴリCRUD
- プロンプトCRUD・バージョン履歴(編集のたびに新しいバージョンを追加)
- Claude実行(モデル選択、`{{変数名}}`のテンプレート変数、実行履歴の記録)

設計の詳細は [`docs/phase1-design.md`](./docs/phase1-design.md)(全体設計)、[`docs/db-design.md`](./docs/db-design.md)(DB設計)、[`docs/phase1-ui-design.md`](./docs/phase1-ui-design.md)(画面遷移・UI設計)を参照。

## 技術スタック

| 領域 | 技術 |
| --- | --- |
| フロントエンド / バックエンド | Next.js(App Router)+ TypeScript + Tailwind CSS |
| DB | PostgreSQL + Prisma(ローカルはDocker) |
| 認証 | NextAuth.js(GitHub OAuth)+ Prisma Adapter |
| AI | Anthropic API(`@anthropic-ai/sdk`) |

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

### 4. DBマイグレーション

```bash
npx prisma migrate dev
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。未ログインの場合は`/login`にリダイレクトされ、GitHubでログインすると`/prompts`(プロンプト一覧)に遷移する。

## ブランチ運用

| ブランチ | 用途 | 分岐元 | マージ先 |
| --- | --- | --- | --- |
| `main` | 本番相当・保護対象 | - | - |
| `dev` | 統合検証用 | `main` | `main` |
| `feature/xxx` | 機能単位の開発 | `dev` | `dev` |
| `bugfix/xxx` | バグ修正 | `dev` | `dev` |
| `hotfix/xxx` | 本番障害対応 | `main` | `main` と `dev` の両方 |

基本フロー: `feature/xxx` / `bugfix/xxx` を `dev` から切って作業し、`dev` にマージ。検証後、`dev` を `main` にマージしてリリースする。緊急の本番障害対応のみ `hotfix/xxx` を `main` から直接切り、修正後に `main` と `dev` の両方へマージする。

## 参考リンク

- [Next.js Documentation](https://nextjs.org/docs)
- [Auth.js (NextAuth.js) Documentation](https://authjs.dev)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Anthropic API Documentation](https://docs.anthropic.com)
