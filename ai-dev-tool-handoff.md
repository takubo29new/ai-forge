# 統合AI開発支援ツール - プロジェクト設計ドキュメント

## プロダクトコンセプト
AI駆動開発を支援する統合プラットフォーム。以下3つの機能を段階的に統合する。

1. **プロンプト管理ツール** — AIに投げるプロンプトをコードのように管理・改善する
2. **AIコードレビュー/リファクタリング提案ツール** — GitHubリポジトリのコードをAIが解析・指摘する
3. **RAG構成のドキュメント検索チャットボット** — 設計書やレビュー履歴をベクトル検索し、自然文で質問応答できる

最終的には3つを1つのプラットフォームとして統合し、プロンプト資産をレビュー機能で使い回し、レビュー結果やドキュメントをRAGで横断検索できるようにする。

ポートフォリオ用途を想定。実務でのAI駆動型開発(設計フェーズからの参画)経験と結びつけたストーリー性のある構成にする。

---

## 技術スタック(想定)
- フロントエンド: Next.js + TypeScript + Tailwind CSS
- バックエンド: Next.js API Routes(必要に応じて別サービスに分離)
- DB: PostgreSQL(+ pgvector拡張でベクトル検索を同一DBに統合)
- AI: Anthropic API(Claude)
- 認証: NextAuth.js(GitHub OAuth)
- デプロイ: Vercel

pgvectorを使うことで、通常のリレーショナルデータとベクトルデータを別DBに分けずに1つのPostgreSQLで完結させる想定。

---

## 開発ロードマップ

### Phase 1: プロンプト管理ツール(土台)
- プロンプトCRUD機能(登録・編集・削除、カテゴリ分け)
- AI API実行機能(登録したプロンプトをAnthropic APIに投げて結果表示)
- 実行履歴・バージョン管理(過去の実行結果とプロンプトの変更履歴を保存)

**狙い:** Phase 2・3で使うAI呼び出しの仕組みを一元化する。プロンプトをハードコードせず、DBから取得する設計にしておく。

### Phase 2: AIコードレビューツール
- GitHub連携(OAuthでリポジトリ接続、PR/差分を取得)
- AIレビュー機能(Phase 1のプロンプト資産を使ってコードを解析・指摘)
- レビュー結果の蓄積(指摘内容をDBに保存し、傾向を可視化)

**狙い:** OAuth認証・外部API連携という実務寄りの技術要素を追加する。

### Phase 3: RAG検索チャットボット
- ドキュメント取り込み(設計書やレビュー結果をベクトルDBに格納。埋め込みは[Voyage AI](https://www.voyageai.com/)の`voyage-3`を使用)
- RAG検索チャット(「このエラー、前に指摘されてた?」等を自然文で検索)
- 統合ダッシュボード(プロンプト・レビュー・ナレッジを横断表示)

**狙い:** 自社(自分)で蓄積したレビュー履歴や設計書を検索できる、実務文脈に沿ったRAGにする。単なる汎用チャットボットとの差別化ポイント。

---

## 進捗

Phase 1(プロンプト管理ツール)は実装完了し、`main`にマージ済み。詳細は [`docs/phase1-design.md`](./docs/phase1-design.md)(全体設計・実装状況)、[`docs/db-design.md`](./docs/db-design.md)(DB設計)、[`docs/phase1-ui-design.md`](./docs/phase1-ui-design.md)(画面遷移・UI設計)を参照。セットアップ手順は[README](./README.md)。

Phase 2(AIコードレビューツール)はDB設計(`Repository` / `Review` / `ReviewComment`)・画面遷移/UI設計・GitHub連携の実装まで完了。実際のAI呼び出しはPhase 1の`Execution`に委譲する設計とし、Phase 1・2・3でAI呼び出しの仕組みを一元化する狙いを踏襲した。レビュー結果はClaudeの構造化出力で`{ findings: [...] }`形式のJSONとして取得し、`ReviewComment`に直接マッピングする方針。詳細は [`docs/db-design.md`](./docs/db-design.md)(DB設計)、[`docs/phase2-design.md`](./docs/phase2-design.md)(画面遷移・UI設計・API設計)を参照。

GitHub OAuthのスコープに`repo`を追加し、`octokit`(GitHub公式SDK)経由でリポジトリ一覧取得・接続・オープンなPR一覧取得を実装済み。既存ログインユーザーは`Account`のスコープが更新されないAuth.jsの仕様により再ログインが必要になる場合がある(その場合は該当`Account`行を削除して作り直す必要がある。詳細はPR参照)。

AIレビュー機能も実装完了。`{{diff}}`変数にPRのunified diffを展開したプロンプトをClaudeに投げ、`client.messages.parse` + Zodスキーマ(`output_config.format`)で`{ findings: [...] }`形式の構造化出力を強制することで、自由記述テキストのパースを避けて`ReviewComment`へ直接マッピングしている。`/repositories/:id`の「レビューを実行」ボタンからプロンプトを選んで実行でき、`/reviews/:id`で指摘一覧・重要度別件数を確認できる。

品質・UX改善タスク(自動テスト整備、共通ナビゲーション、実行系APIのレート制限、確認ダイアログのアクセシビリティ対応、ダークモード手動トグル、エラーログ収集)も一通り完了。設計判断の詳細は [`docs/quality-improvements.md`](./docs/quality-improvements.md) を参照。

レビュー結果の蓄積・可視化(リポジトリ単位)も実装完了。`/repositories/:id`の「傾向」タブで、累計指摘件数(重要度別)・直近10件のレビューの重要度内訳・指摘の多いファイルTOP8を確認できる。これでPhase 2の主要機能(GitHub連携・AIレビュー・レビュー結果の蓄積可視化)は実装完了。

Phase 2完了後、経験豊富なWebエンジニアの視点でmainの実装をあらためてレビューし、CI導入・DBインデックス追加・一覧クエリの上限化・AI呼び出しロジックの共通化などの運用ハードニングも実施した。詳細は [`docs/quality-improvements.md`](./docs/quality-improvements.md) を参照。

ルートレベルのAPI統合テスト(`npm run test:integration`)もCI導入後に追加した。GitHub Actions上のPostgresサービスコンテナに対し、認可判定・レート制限・AI実行の成否分岐など回帰しやすい箇所を検証している。詳細は[`docs/quality-improvements.md`](./docs/quality-improvements.md)を参照。

Phase 3(RAG検索チャットボット)は実装完了。埋め込みモデルはAnthropicがRAG用途で公式に推奨する[Voyage AI](https://www.voyageai.com/)の`voyage-3`を採用。pgvector拡張(0.8.6)を有効化し`Document`/`DocumentChunk`/`ReviewCommentEmbedding`のスキーマを追加、`/documents`でのドキュメント手動登録・設計書の自動同期(`docs/*.md`・`README.md`・`ai-dev-tool-handoff.md`。今のところai-forge自身のリポジトリのみが対象)・既存レビュー指摘の埋め込みバックフィルに続けて、RAG検索チャット(`/chat`)・統合ダッシュボード(`/dashboard`)を実装した。質問文を埋め込み、ドキュメント・レビュー指摘の両方からコサイン類似検索で関連箇所を取得し、Claudeに文脈として渡して出典付きの回答を生成する。詳細は[`docs/phase3-design.md`](./docs/phase3-design.md)を参照。

これで統合AI開発支援ツールとして計画していたPhase 1〜3の主要機能はすべて実装完了。

Phase 3完了後、ユーザーからの要望を受けてUI/UX改善(ナビゲーション再編・共通トースト通知・アクセシブルなモーダル・ブランドアクセントカラーの導入など十数項目)、セキュリティ対応(GitHubアクセストークンの暗号化保存とrefresh_tokenによる自動更新)を実施し、v1.0.0としてVercelに本番デプロイした。デプロイ後は実運用で判明した問題(DBトランザクションのタイムアウト、DBとVercel Functionのリージョン不一致による速度低下など)にも対応済み。詳細は[`docs/quality-improvements.md`](./docs/quality-improvements.md)の10〜12を参照。本番URLでの動作確認・GitHubログイン・AIレビュー・RAG検索チャットまで一通り確認できている。

開発の記録(実働時間・従来開発との比較・スクリーンショット)はポートフォリオ用資料としてまとめている。

## 次のステップ候補
- Phase 3: 複数リポジトリの同期・プロジェクト単位のRAG検索チャット(Phase 2で接続済みのGitHubリポジトリごとにドキュメントを同期し、`/chat`で対象リポジトリを絞り込めるようにする。詳細は[`docs/phase3-design.md`](./docs/phase3-design.md)の「今後の拡張候補」参照)
- ルートレベルの統合テストが薄い箇所(categories/promptsのCRUD等)の拡充
