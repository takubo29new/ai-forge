# 品質・UX改善タスク

Phase 1・Phase 2の機能実装が一段落した後、プロフェッショナルなWeb開発の観点から実施した品質・UX改善タスクの記録。DBスキーマの設計判断は [`db-design.md`](./db-design.md) を参照。

## 実施項目

1. 自動テスト整備
2. 共通ナビゲーション整備
3. 実行系APIのレート制限
4. 確認ダイアログのモーダル化
5. `useApiMutation`フックへの共通化
6. モーダルのアクセシビリティ対応
7. ダークモード手動トグル
8. エラーログ収集
9. 運用ハードニング(CI・DBインデックス・一覧上限・AI実行ロジックの共通化)

## 1. 自動テスト整備

[Vitest](https://vitest.dev)を導入し、DB・外部APIに依存しない純粋なロジックをユニットテストの対象にした。

- `{{変数名}}`の抽出・置換ロジック(`src/lib/prompt-variables.ts`)
- AIレビューの構造化出力スキーマ(`src/lib/review-schema.ts`)

当初、CRUD・実行系APIなどDBアクセスを伴う処理は、実装時に開発用DBへ手動で動作確認する運用とし、自動化されたインテグレーションテストは範囲外にしていた(単一ユーザーのポートフォリオ用途では費用対効果が見合わないと判断)。CIが無かった頃はこの判断で妥当だったが、後述の「9. 運用ハードニング」でCIを導入したことでこの前提が変わったため、認可判定・レート制限・AI実行の成否分岐など回帰しやすい箇所に限定してルートレベルの統合テスト(`*.integration.test.ts`、`npm run test:integration`)を追加した。

- 実際のPostgresに対してPrisma経由でクエリを発行し、GitHub/Anthropicへの外部呼び出しは`vi.mock`でモックする(DBは本物・外部APIは偽物、という境界で線引きしている)
- `POST /api/prompts/:id/execute`: 未認証401・他ユーザー404・不正なバージョン400・成功時201/SUCCESS・AI失敗時200/FAILED・レート制限429を検証
- `POST /api/repositories/:id/reviews`: 他ユーザー404・`{{diff}}`欠如400・成功時のReviewComment作成・diff truncate時の警告コメント追加・AI失敗時200/FAILEDを検証(いずれも「9. 運用ハードニング」で見つけた不具合の回帰テストを兼ねる)
- 全件のCRUD・全ルートを網羅する方針ではなく、「ownership漏れ・ステータスコード不整合のような、手作業では見落としやすい分岐」に絞って追加している

## 2. 共通ナビゲーション整備

認証必須ページ(`/prompts`・`/categories`・`/repositories`・`/help`・`/reviews/:id`など)を`src/app/(app)/`ルートグループへ移動し、共通レイアウト(`src/app/(app)/layout.tsx`)で認証ガードとヘッダー(`src/components/app-header.tsx`)を一元化した。従来は`/prompts`にしかなかったヘッダー・ナビゲーションが全ページで表示されるようになった。ルートグループはURLパスに影響しない。

## 3. 実行系APIのレート制限

`POST /api/prompts/:id/execute`・`POST /api/repositories/:id/reviews`・`POST /api/client-errors`を、ユーザー×用途(purpose)ごとに1時間あたりの上限で制限する。

`RateLimitBucket`モデル(`userId` + `windowStart` + `purpose`の複合主キー)に対して`upsert`の`count: { increment: 1 }`でカウントする方式にした。このupsertはPostgres側で`INSERT ... ON CONFLICT DO UPDATE`としてアトミックに実行されるため、「件数を数える→記録する」の間に別リクエストが割り込むTOCTOUレースが起きない。実際に25件の完全並行リクエストを発行し、上限どおりに許可/拒否が振り分けられることを確認した。

用途(purpose)を分けている理由は、AI呼び出し(execution)とクライアントエラー報告(client-error)を同じカウンタで管理すると、想定外エラーが連続発生しただけでプロンプト実行やAIレビューの上限まで消費してしまうため。

## 4〜6. 確認ダイアログのモーダル化・共通化・アクセシビリティ対応

`window.confirm`によるブラウザ標準の確認ダイアログと、リポジトリ接続用に自前実装していたモーダルを、共通コンポーネント(`src/components/modal.tsx`・`src/components/confirm-dialog.tsx`)に置き換えた。

- **フォーカストラップ**: モーダル内でTabキーによるフォーカス移動が循環する。`onClose`をrefで保持し、`useEffect`の依存配列を`[open]`のみにすることで、モーダル表示中の無関係な再レンダリング(`pending`の切り替え等)でフォーカスが意図せず戻る問題を回避している。
- **Escで閉じる**、`aria-modal="true"`
- **背景の`inert`化**: `Modal`は`document.body`へのポータル描画(`createPortal`)に変更し、表示中は背景コンテンツ(`#app-root`)に`inert`属性を付与する。スクリーンリーダーの仮想カーソルが背景コンテンツに到達しないようにするため。
- **非同期処理との整合性**: 呼び出し側は成功時のみダイアログを閉じるようにし、処理中は確定ボタンを無効化・「処理中...」表示、失敗時はダイアログを閉じずにエラーメッセージを表示する

各画面(`category-manager.tsx`・`edit-tab.tsx`・`repository-manager.tsx`など)で共通していた「POST/PATCH/DELETE + pending/error状態管理」のパターンは`useApiMutation`フック(`src/lib/use-api-mutation.ts`)に切り出し、6箇所の呼び出し元から利用する形にした。

## 7. ダークモード手動トグル

Tailwind CSS v4のclass-based dark mode(`@custom-variant dark (&:where(.dark, .dark *));`)に切り替え、ヘッダーにトグルボタン(`src/components/theme-toggle.tsx`)を追加した。

- 選択したテーマは`localStorage`に保存し、次回アクセス時も引き継ぐ
- 未選択時はOSの`prefers-color-scheme`に従う。タブを開いたまま OS側のテーマが変わった場合も`matchMedia`の`change`イベントで追従する
- 初回描画時のちらつき(FOUC)を避けるため、React のハイドレーション前に実行される最小限のインラインscript(`src/lib/theme-script.ts`)で`<html>`のクラスを確定させる。このscriptはモジュールをimportできない制約上、`theme-toggle.tsx`側のロジックと完全な一本化はできないため、変更時は両方を修正する必要がある
- JavaScriptが無効な環境では`prefers-color-scheme`によるCSS変数フォールバックを持たせず、常にライトテーマで一貫させる設計にした(半分だけダークになる中途半端な状態を避けるため)

## 8. エラーログ収集

外部の監視サービス(Sentry等)を使わず、既存のPostgreSQL上に`ErrorLog`テーブルを追加してアプリ内で完結させた。

- **サーバー側**: Next.jsの`instrumentation.ts`が公開する`onRequestError`フックで、Route Handler・Server Component・Server Actionの想定外エラーを横断的に捕捉する。Edge Runtimeでは動作しないPrismaを使うため、`process.env.NEXT_RUNTIME !== "nodejs"`のときは早期リターンする
- **クライアント側**: `error.tsx`・`global-error.tsx`(Reactのエラーバウンダリ)から`POST /api/client-errors`経由で送信する。認証必須・レート制限つき(1時間30回)
- ログ保存自体の失敗が本処理に影響しないよう、書き込みは常にbest-effort(失敗を握りつぶす)
- `/errors`ページで直近50件を確認できる。`ErrorLog.userId`はサーバー側エラーでは付与できないことが多い(`onRequestError`はセッション情報を直接取得できない)ため、閲覧画面では「自分の`userId`のログ」と「`userId`が未設定のログ」のみを表示し、他ユーザーのログを見せないようにしている

## 9. 運用ハードニング(CI・DBインデックス・一覧上限・AI実行ロジックの共通化)

Phase 2完了後、経験豊富なWebエンジニアの視点であらためてmainの実装をコードレベルでレビューし、見つかった指摘のうち優先度の高いものに対応した。

- **CI導入**: `.github/workflows/ci.yml`を追加。`main`・`dev`へのpush、PR作成時に`npm ci` → `prisma generate` → `lint` → `test` → `build`を自動実行する。それまでは壊れた`main`を機械的に止める仕組みが無く、ビルド・テストはローカルでの手動確認のみに依存していた
- **DBインデックス追加**: 詳細は[`db-design.md`](./db-design.md)を参照。ホットな外部キーに`@@index`を追加した
- **一覧クエリへの上限追加**: 実行履歴・レビュー履歴・バージョン履歴の`findMany`が`take`なしで全件取得しており、使い込むほど線形に重くなる作りだった。`src/lib/list-limits.ts`の`LIST_LIMIT`(100件)を導入し、フルページネーションUIを作るほどの規模ではない現段階でも劣化を防ぐ形にした
- **PR差分truncateの可視化**: `getPullRequestDiff`が50,000文字を超える差分を無言で切り詰めていた(AIへのプロンプトには"...(diff truncated...)"の注記が入るためAI自身は把握できるが、人間のユーザーには何も表示されなかった)。切り詰めが発生した場合は`ReviewComment`にWARNING severityの警告を1件追加し、レビュー結果画面で人間にも見える形にした
- **AI呼び出しロジックの共通化**: `POST /api/prompts/:id/execute`と`POST /api/repositories/:id/reviews`の両方で「Claudeを呼び出す→成否を`Execution`として記録する(成功時はresultText・トークン数、失敗時はerrorMessage)」というパターンが個別に実装されていた。`src/lib/run-ai-execution.ts`の`runAiExecution()`に共通化し、呼び出し元はAPI呼び出し本体(`call`)だけを渡す形にした。Phase 3のRAGチャットが3つ目の呼び出し元になる前に整理しておく狙い
- **HTTPステータスの修正**: 上記の共通化とあわせて、AI実行が失敗(`status: FAILED`)した場合でもHTTP 201(Created)を返していた不整合を200に修正した。UIはレスポンスボディの`status`フィールドを見て正しく分岐していたため実害はなかったが、外部消費者や監視ツールを想定するとREST的に筋が悪かった

対応を見送った指摘: GitHubアクセストークンの平文保存(NextAuth Prisma Adapterの標準仕様。実ユーザーを迎える段階でトークン暗号化を再検討) → 本番デプロイ前に対応済み(11参照)。ルートレベルの統合テストは、CI導入によりトレードオフの前提が変わったため、その後「1. 自動テスト整備」に追加した。

## 10. UI/UXデザインシステム

Phase 3完了後、ユーザーからの改善要望9項目とそれに続く追加提案3項目、さらにトレンドを踏まえたデザイン改善提案の合計十数項目を、6つのバッチに分けて対応した。

- **ナビゲーション・情報設計**: ログイン後の遷移先を`/dashboard`に統一、プロンプト系とその他機能を視覚的に区切ったヘッダー再編、一覧の表示件数選択(`src/components/page-size-select.tsx`)、ヘッダーのエラーログ・ヘルプをアイコン化して右側へ移動
- **フィードバック**: ローディング表示(`src/components/spinner.tsx`)、削除/解除ボタンの危険色統一、共通トースト通知(`src/components/toast-provider.tsx`。作成・更新・削除・接続・同期の成功時に一貫して表示。エラーは引き続きインライン表示)
- **アクセシビリティ・操作性**: 確認ダイアログのモーダル化(フォーカストラップ・`inert`・`aria-modal`)、ヘルプページの左サイドバー固定+スクロールスパイ+`scroll-mt-6`によるアンカー位置調整、チャット入力のtextarea化(Enter送信/Shift+Enter改行)
- **ブランドデザイン**: `next/font`で読み込んでいたGeist Sansが`body`のArial直書きにより未適用だったバグを修正。危険色(赤)・警告色(琥珀)と独立したアクセントカラー(インディゴ)をCSS変数として導入し、プライマリボタン・ナビのアクティブ状態・`:focus-visible`に適用。ダッシュボードのKPIタイルにホバー時の浮き上がり効果を追加

## 11. GitHubトークンの暗号化保存・自動更新

9で対応を見送っていた「GitHubアクセストークンの平文保存」と、実運用で新たに判明した「トークンが約8時間で失効する」問題への対応。

- **自動更新**: GitHub Appのユーザートークンは既定で約8時間で失効する仕様だが、`refresh_token`による自動更新の仕組みが無かった。`src/lib/github.ts`の`getGitHubClient()`に`expires_at`ベースの失効判定と、GitHubの`/login/oauth/access_token`への`refresh_token` grantによる自動更新を実装
- **暗号化保存**: `src/lib/token-crypto.ts`(AES-256-GCM、鍵は`TOKEN_ENCRYPTION_KEY`)を新設。初回ログイン連携時(`src/auth.ts`でPrismaAdapterの`linkAccount`をラップ)とトークン自動更新時の2箇所で暗号化してから保存する。暗号化前の平文データは読み取り時に検知して暗号化し直し、専用の移行スクリプトなしに自然移行させる設計
- あわせて、GitHub API呼び出し失敗時に握りつぶされていた4箇所のcatchに`logError`を追加し、同種の問題を再現なしにErrorLogから調査できるようにした

## 12. 本番デプロイ・運用

v1.0.0としてVercelへ本番デプロイし、実際の運用で判明した問題に対応した。

- **ビルド設定**: `vercel.json`で`buildCommand`を`prisma migrate deploy && next build`に設定し、デプロイのたびにマイグレーション(pgvector拡張の有効化含む)を自動適用。`ignoreCommand`で`main`以外のブランチへのpushではビルド自体をスキップ(Previewデプロイを作らない)
- **トランザクションタイムアウト**: 「設計書を同期」がファイル数分のDB往復を1つのインタラクティブトランザクションで行っており、本番DBとの通信距離次第でPrismaの既定5秒タイムアウトを超過することがあった。`timeout: 30000`を指定し、あわせてVercel Function自体の実行時間上限(`maxDuration`)も引き上げた
- **リージョン最適化**: DBのリージョン(東京・`ap-northeast-1`)とVercel Functionの実行リージョン(既定は米国東部・`iad1`)が一致しておらず、すべてのDBアクセスが地球規模の往復になっていた。`vercel.json`の`regions`をDBと同じ東京(`hnd1`)に設定して解消
- デプロイ手順・環境変数一覧・つまずきやすいポイント(Sensitive環境変数はビルド時に渡されない、`@prisma/adapter-pg`利用のため直接接続文字列が必須、等)は[README](../README.md#本番デプロイvercel)にまとめた

## 関連PR

コードレビュー(`/code-review`)による指摘とその対応も含め、実装の詳細はGitHub上のPR履歴・[`WORKLOG.md`](../WORKLOG.md)を参照。
