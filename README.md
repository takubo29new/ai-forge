# ai-forge

統合AI開発支援ツール — プロンプト管理・AIコードレビュー・RAGドキュメント検索チャットボットを段階的に統合するポートフォリオ向けプラットフォーム。

プロダクトコンセプトや技術スタック、開発ロードマップの詳細は [`ai-dev-tool-handoff.md`](./ai-dev-tool-handoff.md) を参照。

## ブランチ運用

| ブランチ | 用途 | 分岐元 | マージ先 |
| --- | --- | --- | --- |
| `main` | 本番相当・保護対象 | - | - |
| `dev` | 統合検証用 | `main` | `main` |
| `feature/xxx` | 機能単位の開発 | `dev` | `dev` |
| `bugfix/xxx` | バグ修正 | `dev` | `dev` |
| `hotfix/xxx` | 本番障害対応 | `main` | `main` と `dev` の両方 |

基本フロー: `feature/xxx` / `bugfix/xxx` を `dev` から切って作業し、`dev` にマージ。検証後、`dev` を `main` にマージしてリリースする。緊急の本番障害対応のみ `hotfix/xxx` を `main` から直接切り、修正後に `main` と `dev` の両方へマージする。

## 開発環境

Next.js (App Router) + TypeScript + Tailwind CSS。[`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) でセットアップ。

### Getting Started

開発サーバーを起動:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。`src/app/page.tsx` を編集すると自動的に反映される。

### 参考リンク

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
