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

Phase 4(統合基盤の強化)は4項目すべて実装完了。項目1「RAG検索対象の拡張」では`PromptVersion`(プロンプト本文)・`Execution`(レビュー由来を除くプロンプト実行結果)を`PromptVersionEmbedding`/`ExecutionEmbedding`として埋め込み、`/chat`の検索対象が`Document`・`ReviewComment`に加えてこの2つにも広がった(既存データのバックフィルAPI・`/documents`ページのボタンも実装済み)。項目2「プロジェクト単位のドキュメント管理」では`Document`に`repositoryId`(任意)を追加し、「リポジトリ」ページで接続したGitHubリポジトリごとにdocs/配下・README.mdをGitHub API経由で同期できるようになった(`/documents`の「接続済みリポジトリの設計書を同期」)。`/chat`にも対象リポジトリの絞り込みセレクトを追加し、指定時は`Document`・`ReviewComment`をそのリポジトリに限定する(`PromptVersion`・`Execution`はリポジトリに紐づかないため常に横断検索)。項目3「レビュー指摘蓄積からのプロンプト改善提案」では、プロンプト詳細画面(`/prompts/:id`)にボタンを追加し、過去の`ReviewComment`を分析してプロンプトの改善案をClaudeに構造化出力で生成させる。専用テーブルは持たず、押すたびに生成し直す(永続化しない)設計。項目4「チャットからの直接アクション実行」では、`/chat`でユーザーの発話をClaudeのtool use(低コストな`claude-haiku-4-5`を使用)で解析し、「保存済みプロンプトでのAIレビュー実行」の意図とパラメータ(リポジトリ・PR番号・プロンプト)を検出した場合のみ`ConfirmDialog`で確認内容を表示、ユーザーが確認した場合のみ既存の`POST /api/repositories/:id/reviews`を呼び出す(新規の実行用エンドポイントは追加していない)。詳細は[`docs/phase4-design.md`](./docs/phase4-design.md)を参照。

Phase 5(汎用AI評価ツール)は画像評価(`inputType: IMAGE`)・テキスト評価(`inputType: TEXT`)・バックグラウンド処理を実装完了。`Evaluation`/`EvaluationFinding`をReviewとは独立したモデルとして追加し、`/evaluations`から画像またはテキスト+プロンプトを送るとClaudeが評価し観点別コメントを取得できる。画像評価はClaude Visionへ画像をBase64で渡し、DBに永続化しない設計。テキスト評価は既存のプロンプト実行と同じ`{{変数名}}`展開(`renderTemplate()`)を再利用し、選んだプロンプトの変数ごとに`<textarea>`を表示する。バックグラウンド処理では、`POST /api/evaluations`がバリデーション後すぐ`PENDING`な`Evaluation`を`202`で返し、実際のAI呼び出しはNext.jsの`after()`でレスポンス送出後に継続する(新規の常駐ワーカー・キューは追加していない)。`(app)/layout.tsx`に常駐する`PendingEvaluationsProvider`がポーリングし、完了をトースト通知する(離れた画面からでも通知される)。画像の永続化・共有リンクは未着手。詳細は[`docs/phase5-design.md`](./docs/phase5-design.md)を参照。

## 次のステップ候補

2026-08-25時点でユーザーと検討した今後の方向性をまとめる。優先順は上から。

### Phase 4: 統合基盤の強化 — 完了

4項目すべて実装完了(上記「進捗」参照)。詳細は[`docs/phase4-design.md`](./docs/phase4-design.md)を参照。

### Phase 5: 汎用AI評価ツール(残りスコープ)

画像評価・テキスト評価・バックグラウンド処理は実装完了(上記「進捗」参照)。残りは設計のみで未着手(詳細は[`docs/phase5-design.md`](./docs/phase5-design.md)を参照)。

- **画像の永続化**: 現状はリクエスト内でClaudeに渡すのみでDB/ストレージに保存しない。将来Vercel Blob等の導入を再検討
- **プロンプトテンプレート集**: Phase 5を試しやすくするための叩き台プロンプト

### 追加機能アイデア

横断検索(Cmd/Ctrl+K)は実装完了。`Ctrl`/`⌘`+`K`またはヘッダーの検索アイコンでコマンドパレットを開き、プロンプト・カテゴリ・リポジトリ・ドキュメント・評価・レビュー(PRタイトル)を横断して名前の部分一致(大文字小文字を区別しない)で検索できる。`GET /api/search`(グループごとに最大5件)、`src/components/command-palette.tsx`(状態管理・キーボード操作)、既存の`Modal`コンポーネントを再利用した実装で、新規UIライブラリは導入していない。矢印キーでの候補選択・Enterでの遷移に対応。

実行結果の比較機能も実装完了。`/prompts/:id`の「実行履歴」タブ・`/repositories/:id`の「レビュー履歴」タブそれぞれにチェックボックスを追加し、2件選ぶと`/prompts/:id/compare`・`/repositories/:id/compare`へのリンクが表示され、左右2カラムで結果を並べて比較できる(プロンプトの異なるバージョン間の実行結果、同じPRへの複数回のレビュー結果のどちらも比較可能)。3件以上の同時比較はUIが複雑になるためスコープ外とし、常に直近選んだ2件に絞る設計にした。

キーボードショートカットも実装完了。`src/lib/keyboard-shortcuts.ts`に`submitOnModEnter`(Cmd/Ctrl+Enterでフォーム送信。単一行inputは素のEnterで既にネイティブ送信されるが、textarea等の複数行入力向けに統一して適用)・`isEditableTarget`(テキスト入力中かどうかの判定)を切り出し、プロンプト編集(保存)・プロンプト実行・AI評価のテキスト入力に適用した。コマンドパレット(`Ctrl`/`⌘`+`K`)には、入力欄にフォーカスしていない場合のみ反応する`/`を検索フォーカス用の補助ショートカットとして追加した(GitHub等と同じパターン)。

利用状況ダッシュボードも実装完了(`/usage`)。ただし「コスト」の金額換算は行っていない — モデルごとの正確な現行料金をこの場で確認できず、不確かな数値を事実として表示するリスクがあると判断し、ユーザーに相談のうえ「トークン数のみ表示」を選んだ経緯がある。Claude(Anthropic)は`Execution.promptTokens`/`completionTokens`(既存データ、プロンプト実行・AIレビュー・AI評価のみが対象。RAG検索チャットの回答生成・チャットのtool use解析・プロンプト改善提案は`Execution`を作らないため含まれない)を合計・モデル別・直近14日の日別で集計。Voyage AIはトークン数を記録していないため、`DocumentChunk`/`ReviewCommentEmbedding`/`PromptVersionEmbedding`/`ExecutionEmbedding`の件数のみを表示する。

評価結果の共有リンクも実装完了。成功したAIレビュー(`Review`)・AI評価(`Evaluation`)を、ログイン不要の読み取り専用URL(`/share/reviews/:token`・`/share/evaluations/:token`)で共有できる。トークンは`crypto.randomBytes`で発行し(IDそのものは使わない)、共有解除で無効化・再共有で新しい値になる設計。作成前には「非公開情報が含まれていないか確認してください」という`ConfirmDialog`を挟み、意図しない情報公開を防ぐ。詳細は[`docs/phase5-design.md`](./docs/phase5-design.md)の「共有リンク」を参照。

通知の強化も実装完了。トースト(`ToastProvider`)はその場でアプリを見ている間しか気づけず4秒で消えるため見逃しやすいという課題に対し、`Notification`モデルとヘッダー常駐の通知センター(ベルアイコン)を追加した。AI評価のバックグラウンド処理が完了した時点でサーバー側で`Notification`を作成し(埋め込み生成と同じベストエフォート方針)、ヘッダーが20秒間隔でポーリングして未読件数をバッジ表示する。クライアント側の監視状態(トースト用の`registerPending`)には依存しないため、他のタブ・別セッションで作成した評価の完了も拾える。詳細は[`docs/phase5-design.md`](./docs/phase5-design.md)の「通知センター」を参照。

- プロンプトテンプレート集(Phase 5を試しやすくするための叩き台プロンプト)

### UI/UX・デザインのブラッシュアップ — 完了

以下5項目すべて対応済み。

- **セカンダリボタンのホバー状態**: `border-zinc-300`系の枠線ボタン(キャンセル・編集・各種同期/バックフィルボタン等15箇所)に`hover:bg-zinc-100 dark:hover:bg-zinc-900`を、`border-red-300`系の削除ボタン(6箇所)に`hover:bg-red-50 dark:hover:bg-red-950/40`を追加し、`disabled:hover:bg-transparent`でdisabled時にホバー色が出ないようにした
- **空状態(Empty State)の改善**: `/prompts`(フィルタ有無で「絞り込みを解除する」リンクと「+ 最初のプロンプトを作成」ボタンを出し分け)・`/documents`(取り込み手段への案内文を追加)を改善。他の一覧(カテゴリ・リポジトリ・評価等)は直上に作成フォーム/ボタンが常設されているため対応不要と判断
- **レビュー「傾向」タブのグラフ強化**: 累計指摘件数に全体比率の積み上げバーを追加、「指摘の多いファイル」の各行に最大値比の背景バー(`bg-accent/10`)を追加。新規のチャートライブラリは導入せず、既存の積み上げバーと同じ手作りCSSのスタイルに揃えた
- **モバイル対応**: `AppHeader`(ブランド・ナビ・アイコン・ユーザー名・ログアウトが一列で折り返し不可だった)に`flex-wrap`を追加し、区切り線とユーザー名を`sm:`未満で非表示に。`pull-request-list.tsx`のPRタイトル行に`min-w-0`+`truncate`を追加し、長いタイトルでボタンが画面外に押し出されないようにした
- **ローディング表現の統一**: `src/app/(app)/loading.tsx`を新設。従来`(app)`配下のどのページにも`loading.tsx`が無く、Server Componentのデータ取得中は画面が白いままだったため、汎用スケルトン(`animate-pulse`)を追加した

### 積み残しの小さな改善

- ~~ルートレベルの統合テストが薄い箇所(categories/promptsのCRUD等)の拡充~~ → 対応済み。`/api/categories`・`/api/categories/:id`・`/api/prompts`・`/api/prompts/:id`(GET/DELETE。PATCHは既存)・`/api/prompts/:id/versions`・`/api/prompts/:id/executions`に統合テストを追加(認可404・バリデーション400・一意制約409・カスケード/SetNullの実DB確認を含む計36件)。ルートレベルの統合テストは全体で124件
