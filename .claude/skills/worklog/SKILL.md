---
name: worklog
description: This skill should be used when the user asks to "作業ログを記録して", "worklogに記録して", "作業時間を記録", "WORKLOG.mdを更新して", or at the natural end of a work session in this repository (a merge completed, a feature shipped, a round of fixes landed) when a session summary has not yet been logged. Records one row in this project's WORKLOG.md following its exact table format and rules.
---

# 作業ログ記録(WORKLOG.md)

WORKLOG.mdは、このプロジェクトでの開発時間・作業内容の記録(ポートフォリオ用途)。1行 = 1セッション(Claude Codeとの対話1回分)。

## 手順

1. **終了時刻を取得する**: Bashで`date "+%Y-%m-%d %H:%M"`を実行する。ユーザーに時刻を尋ねない(過去にこの方針で合意済み)。
2. **開始時刻を決める**: 会話の中で最初にツールを使った時点、または直前のWORKLOG末尾エントリの終了時刻の続きから合理的に見積もる。不明な場合はユーザーに尋ねず、作業量から妥当な時間幅を見積もる。
3. **現在のWORKLOG.mdの末尾を確認する**: 追記前に必ずファイル末尾(最後の数行)をReadで確認する。`git pull`等でリモート側に新しいエントリが追加されている場合があり、古いコンテキストのまま編集すると挿入位置がずれて時系列が崩れる(実際に一度発生した事故)。
4. **表の最終行の直後に1行追記する**: フォーマットは`| YYYY-MM-DD | HH:MM | HH:MM | 所要時間 | 内容 |`。既存行を参考に、以下を守る:
   - 所要時間は`21m`や`1h05m`のように分・時間分の形式
   - 内容は日本語、簡潔だが具体的に: 何をきっかけに(ユーザーの依頼/報告/前セッションからの継続)・何をしたか(ファイル名や機能名を含める)・どう検証したか(lint/build/テスト件数)を1〜3文で
   - 既存の文体(体言止めを避けた説明的な文、「〜を修正」「〜を追加」「〜を確認」)に合わせる
5. **コミットする**: `docs: ○○を作業ログに反映`のような日本語コミットメッセージで、WORKLOG.md単体をコミットする(このプロジェクトはコミットメッセージを日本語で書く方針)。他の変更と混ぜない。
6. **pushするかはユーザーの直前の指示に従う**: 明示的にpushを頼まれていない一括作業の一部なら、他の変更と合わせてpushしてよい。単発の依頼なら、pushしてよいか確認するか、直前までの操作方針(既にpushし続けている流れ)に合わせる。

## 注意

- WORKLOG.mdの更新作業自体について、新たなWORKLOG行を作らない(自己言及的な記録の増殖を避ける)。この更新は直前の本体作業のログ行に含める。
- 1セッションで複数の話題(例: レビュー対応→マージ)を扱った場合、ユーザーの指示の区切りごとに行を分けるのがこれまでの慣習(1行に詰め込みすぎない)。
