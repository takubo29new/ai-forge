---
name: investigate-error-log
description: This skill should be used when the user reports that a feature in this app failed or errored (e.g. "○○で失敗しました", "予期しないエラーになる", "動かない") without a clear stack trace already in hand, or asks to "ErrorLogを調査して" / "原因を調べて". Guides root-causing via the app's own ErrorLog table (Prisma model) instead of guessing from source code alone.
---

# ErrorLogを使った障害調査

このアプリは想定外エラーをすべて`ErrorLog`テーブルに記録している(サーバー側は`instrumentation.ts`の`onRequestError`、クライアント側は`POST /api/client-errors`経由、`src/lib/error-log.ts`の`logError()`)。ユーザーから「○○で失敗した」と報告されたら、**推測でコードを読む前に、まずこのテーブルの実際のレコードを見る。** これまでの調査(GitHubトークン失効、Voyage AIレート制限、Prismaトランザクションタイムアウト等)はすべてこの手順で原因を一度で特定できている。

## 手順

1. **報告内容から絞り込み条件を作る**: いつ頃発生したか(直近か)、どの画面/操作か(pathの手がかりになる)。
2. **ErrorLogを直接クエリする**: `prisma`クライアント経由(`import { prisma } from "@/lib/prisma"`)で`findMany`し、`orderBy: { createdAt: "desc" }`・`take: 10`程度で直近を見る。`path`や`message`で絞り込めるならwhere条件に入れる。ワンショットのNode/tsxスクリプトを書いて実行するか、`npx prisma studio`で直接ブラウズしてもよい。接続先は`.env`の`DATABASE_URL`(通常ローカルのPostgres。ユーザーが起動している開発サーバーと同じDBを見ているため、ユーザーの操作で発生したエラーがそのまま記録されている)。
3. **`message`・`stack`・`digest`・`path`を読む**: 推測せず、実際に記録された例外メッセージとスタックトレースから原因箇所を特定する。
4. **該当箇所に一致するレコードが無い場合**: そのエラーはcatchブロックで握りつぶされている可能性が高い(過去に複数回発生している)。該当箇所を探して`logError()`呼び出しを追加し、ユーザーに再現操作を依頼してから改めてErrorLogを確認する。この対応自体を先に行う価値がある(以後の同種インシデントで再現なしに調査できるようになる)。
5. **外部APIが原因の場合は実際に叩いて確認する**: 「トークン失効」「レート制限」等が疑われる場合、推測で終わらせず、実際の認証情報(DBに保存されたaccess_token、`.env`のAPIキー等)を使って対象の外部API(GitHub API、Voyage AI等)に直接リクエストを送り、レスポンスのステータスコード・エラー内容で裏付けを取る。
6. **原因が分かったら、根本原因を直す**: キャッシュ起因(Turbopackの`.next`、古いPrismaクライアント)であれば再起動/キャッシュ削除で解消するか確認する。コード起因であれば修正し、同種のcatchが他の箇所にも複製されていないか横展開する(過去に「4箇所で握りつぶされていたcatchすべてにlogErrorを追加」という対応をしたことがある)。
7. **原因調査を終えたら回帰テストを検討する**: 該当エラーメッセージ・分岐(例: 429時の案内メッセージ)を検証する統合テストを追加する。

## 注意

- **ErrorLogやAccountテーブルの内容(トークン、接続文字列、パスワード等)をチャットにそのまま貼らない/長々と引用しない。** 実際に過去、ユーザーが本番DBの接続文字列(パスワード含む)を誤ってチャットに貼り付けてしまい、漏洩したものとしてローテーションを推奨した事例がある。調査に使う値は自分でDBから取得して直接リクエストに使い、平文の値そのものを会話に出力しない。
- ユーザーの環境でしか再現しない問題(ローカルサーバーのキャッシュ状態など)もあるため、「コード上は問題ない」と分かった場合は、キャッシュ・再起動起因の可能性をまず案内する。
