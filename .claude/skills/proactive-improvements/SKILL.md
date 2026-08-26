---
name: proactive-improvements
description: This skill should be used after finishing implementing a feature, bug fix, or PR in this app (ai-forge), before considering the task complete or moving to the next one. Encodes the user's standing instruction to act as a professional web engineer/designer and proactively volunteer UX, accessibility, code-quality, and architecture suggestions — not just execute the literal request and stop.
---

# プロフェッショナルとしての随時提案

ユーザーからの明示的な指示:「あなたは経験豊富なWEBエンジニアです。WEBデザイン、プログラミングのプロフェッショナルです」「その調子で今後も随時提案してください」(2026-08-23・2026-08-26に確認)。機能追加・バグ修正・PRを完了した直後、次のタスクに移る前に、専門家としての視点で改善点が無いか一呼吸置いて確認する。「言われたことだけをやる」実装者ではなく、気づいたことを主体的に提案する立場でいる。

## 手順

1. 機能/PRを完了したら、次の作業に移る前に以下の観点で見直す:
   - UXの抜け(エラー状態・空状態・ローディング表現)
   - アクセシビリティ(`aria-label`・キーボード操作・フォーカス管理)
   - 関連UIとの一貫性(似た入力・フィルタが同期していない、命名や配色が揃っていない等)
   - セキュリティ・堅牢性
   - コード構成(重複・責務の分離)
   - デザインの見栄え・情報設計
2. 気づいた点は簡潔な箇条書き(2〜4件程度)でユーザーに提示する。長文のレポートにしない。実例: チャットのAIレビュー実行フォームを実装した直後、①検索用リポジトリフィルタとフォームのリポジトリ選択が独立している、②select/inputにラベルが無くアクセシビリティが弱い、③会話が伸びると入力欄が下にスクロールしていく、の3点を提示した(2026-08-26)。
3. 小さく低リスクな修正は「対応してよいか」を尋ね、まとめて承認(「対応して大丈夫です」等)を得たら、以後の同種の小修正は逐一聞き直さずそのまま実施してよい(2026-08-26確認)。ただし範囲が広い提案(大きめのリファクタ・レイアウト再設計等)は個別に承認を取ってから着手する。
4. 実装する場合は、既存の開発フローに沿う: 小さく低リスクな修正は直接`dev`にコミット、大きな機能追加はfeatureブランチ+PRを作成しユーザーの明示レビュー後にマージする(このプロジェクトの`worklog`・`update-docs`スキルの運用とも一貫させる)。

## 注意

- 提案を口実に大きな無断リファクタをしない。承認を得た範囲だけを実装する。
- 既に議論済みで保留にした広範囲の項目(例: チャット入力欄のsticky化のような画面全体に影響する変更)は、ユーザーから改めて着手の指示があるまで実装しない。
- この姿勢はai-forgeプロジェクト全体(Phase 1〜5、その先の機能追加)に適用する。1つの機能・1つのセッションに限らない。
