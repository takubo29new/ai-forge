---
name: release-presentation
description: This skill should be used when a new version tag (vX.Y.Z) has just been created and pushed to `main` in this repository (ai-forge), or when the user asks to "プレゼン資料を作って", "バージョンの資料を作って", "リリース資料を作って". Builds a new, version-scoped portfolio presentation Artifact covering what shipped since the previous tag. Always publishes as a brand-new Artifact — never overwrites the existing "ai-forge Build Log" or any prior version's presentation, since each version keeps its own resource.
---

# バージョンごとのプレゼン資料作成

`main`にバージョンタグを打つたびに、その版で何が新しくなったかをまとめたポートフォリオ用プレゼン資料(Artifact)を新規発行する。既存の「ai-forge Build Log」(v1.0.0時点の資料)を含め、過去の版の資料は上書きしない。バージョンごとに1つ、シリーズとして積み上げていくイメージ。

タグ付け自体(バージョン番号の判断、dev→mainのマージ)はこのスキルの対象外。既にタグが打たれ`main`にpush済みであることが前提。

## 手順

1. **対象バージョンの特定**
   - `git tag --sort=-v:refname -n1`で全タグとメッセージを確認し、最新タグ(今回の対象)とその1つ前のタグ(比較対象)を特定する。前のタグが無ければ初回(v1.0.0)として全期間を対象にする。

2. **差分データの収集**(前タグ〜今回タグの期間に絞る。全期間の再集計はしない)
   - `git log <prev>..<new> --oneline`でコミット数。
   - `gh pr list --state merged --search "merged:<prev_date>..<new_date>"`でマージ済みPR数。
   - WORKLOG.mdのうち、前タグの日付〜今回タグの日付に該当する行だけを合計して実働時間を算出する([[project_worklog_tracking]]と同じ表を使うが、集計範囲は今回分のみ)。
   - `git diff <prev>..<new> -- ai-dev-tool-handoff.md`で「進捗」に追記された段落を見て、今回追加された機能のサマリを拾う。
   - 可能なら新規Prismaモデル数・コード行数の増分も算出する。

3. **前バージョンの資料を参照する**
   - `Artifact action:"list"`で過去の資料(README「リリース履歴」表にも一覧がある)のURLを確認する。
   - 直前バージョンの資料を`action:"read"`で読み、配色・フォント・favicon・トーンを引き継ぐ(シリーズとしての一貫性を持たせるため)。初回は「ai-forge Build Log」をベースにする。

4. **スクリーンショット・図解**
   - UIに大きな変化があった画面はユーザーに新しいスクリーンショットを依頼する。変化が無い画面は前回資料の説明を流用してよい(ユーザーに毎回撮り直しを強制しない)。

5. **資料を書く**
   - 必ず`artifact-design`スキルを読み込んでから書く(Artifactツールの必須事項)。
   - **今回のバージョンで何が新しくなったかを主役にする**。前回資料の内容をまるごと繰り返さない。累計実績(総実働時間・総PR数など)は末尾に小さくまとめる程度に留め、「今回の差分」に紙面の大半を割く。
   - 配色・フォントは前バージョンの資料と同じトーン(インディゴ系アクセント+ember差し色、IBM Plex Mono+IBM Plex Sans JP)を踏襲する。

6. **公開する**
   - スクラッチパッドに`release-vX.Y.Z.html`のようなファイル名で保存する。
   - **新規Artifactとして公開する(既存Artifactの`url`を指定して上書きしない)**。タイトルは`ai-forge vX.Y.Z`のようにバージョンごとに一意にする。
   - faviconは前バージョンの資料と同じ絵文字を使い、シリーズであることが分かるようにする。
   - 公開後はデフォルトで**非公開のまま**にする(過去にユーザーの意向で非公開運用としてきた実績があるため、公開設定を変えたい場合はユーザーに確認してから)。

7. **記録を残す**
   - READMEの「リリース履歴」表に、バージョン・日付・発行したArtifact URLの行を1行追記する。
   - `worklog`スキルの手順に従い、この資料作成作業自体のWORKLOG.md行も追記する。

## 注意

- 前バージョンとの差分を主役にし、全期間の累計は補助情報にとどめる。資料が「毎回同じ内容の使い回し」にならないようにする。
- タグ付けの要否・バージョン番号の判断はこのスキルの対象外。判断が必要な場合はユーザーに確認する。
- 既存の「ai-forge Build Log」はv1.0.0時点の資料としてそのまま残し、上書きしない。
