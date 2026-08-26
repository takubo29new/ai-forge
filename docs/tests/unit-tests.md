# テスト仕様書 — 単体テスト一覧

| 項目 | 内容 |
| --- | --- |
| 文書名 | ai-forge テスト仕様書(単体テスト一覧) |
| 対象システム | ai-forge(統合AI開発支援プラットフォーム) |
| 版数 | 1.0.0 |
| 対応バージョン | v1.1.0 |
| 作成日 | 2026-08-27 |

[テスト仕様書](../test-specification.md)「3. 単体テスト一覧」の詳細。テスト種別(単体/結合の実行方法)・テスト観点の定義は[テスト仕様書](../test-specification.md)を参照。対象は`src/**/*.test.ts`(DBアクセスなし、Vitest、`npm test`で実行)。全11ファイル・51テストケース。

---

## 1. `src/lib/prompt-variables.test.ts`

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | `{{name}}`形式のプレースホルダーから変数名を抽出する | 正常系 |
| 2 | 同じ変数が繰り返される場合は重複を除去する | 正常系 |
| 3 | 変数が無い場合は空配列を返す | 正常系(境界値) |
| 4 | 不正な形式のプレースホルダー(`{{}}`・`{{ }}`・`{word}`)は無視する | 異常系(入力の頑健性) |
| 5 | 指定した変数で本文を置換する | 正常系 |
| 6 | 値が指定されていない変数はプレースホルダーのまま残す | 異常系(部分欠落) |
| 7 | プレースホルダーが無い本文はそのまま返す | 正常系(境界値) |
| 8 | 空文字列も有効な変数値として置換を許可する | 境界値 |

## 2. `src/lib/review-schema.test.ts`(`ReviewOutputSchema`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | 正しい形式のfindings配列を受理する | 正常系 |
| 2 | 指摘が0件のfindings配列を受理する(指摘なしのケース) | 正常系(境界値) |
| 3 | 不正な`severity`値を拒否する | 異常系(バリデーション) |
| 4 | `filePath`欠落を拒否する | 異常系(バリデーション) |
| 5 | `line`が整数でない場合を拒否する | 異常系(バリデーション) |

## 3. `src/lib/document-chunks.test.ts`(`chunkMarkdown`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | `##`見出しごとにチャンクを分割する | 正常系 |
| 2 | `###`見出しでも分割する | 正常系 |
| 3 | 見出しが無い場合は1チャンクにまとめる | 正常系(境界値) |
| 4 | 空行だけの内容は空配列を返す | 異常系(境界値) |
| 5 | 1セクションが長すぎる場合は段落単位でさらに分割し、内容を欠落させない | 境界値 |

## 4. `src/lib/token-crypto.test.ts`(`encryptToken`/`decryptToken`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | 平文トークンを暗号化・復号してラウンドトリップできる | 正常系 |
| 2 | 同じ入力でも呼び出すたびに異なる暗号文になる(ランダムIV) | セキュリティ |
| 3 | プレフィックス無しの旧形式(平文)は後方互換として扱う | 異常系(後方互換) |
| 4 | `TOKEN_ENCRYPTION_KEY`未設定時は例外を投げる | 異常系 |

## 5. `src/lib/chat-context.test.ts`

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | `buildChatContext`: 距離(distance)が小さい=類似度が高い順に並べ替える | 正常系 |
| 2 | `buildChatContext`: `limit`件数で打ち切る | 境界値 |
| 3 | `buildChatContext`: `document_chunk`は`documentTitle`をラベルにする | 正常系 |
| 4 | `buildChatContext`: `review_comment`はPR番号・タイトル・ファイルパスをラベルにする | 正常系 |
| 5 | `buildChatContext`: `prompt_version`は`promptTitle`をラベルにする | 正常系 |
| 6 | `buildChatContext`: `execution`は「プロンプト名の実行結果」をラベルにする | 正常系 |
| 7 | `renderContextForPrompt`: 出典番号(`[出典N:...]`)付きでテキストを連結する | 正常系 |

## 6. `src/lib/evaluation-schema.test.ts`(`EvaluationOutputSchema`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | summary付きの正しい形式のfindings配列を受理する | 正常系 |
| 2 | 指摘が0件のfindings配列を受理する | 正常系(境界値) |
| 3 | 不正な`tone`値を拒否する | 異常系(バリデーション) |
| 4 | `label`欠落を拒否する | 異常系(バリデーション) |
| 5 | `score`が0〜100の範囲外を拒否する | 異常系(境界値) |
| 6 | `summary`欠落を拒否する | 異常系(バリデーション) |

## 7. `src/lib/evaluation-summary.test.ts`(`resolveEvaluationSummary`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | `Evaluation.summary`があれば復号して返す | 正常系(セキュリティ) |
| 2 | `summary`が無い場合、旧仕様の`Execution.resultText`(JSON)から再構築する | 異常系(後方互換) |
| 3 | `summary`も旧`resultText`も無ければ`null`を返す | 異常系(境界値) |
| 4 | `resultText`が想定外の形式(プレースホルダー等)でもエラーにならず`null`を返す | 異常系(頑健性) |

## 8. `src/lib/keyboard-shortcuts.test.ts`(`submitOnModEnter`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | Cmd(meta)+Enterでフォームをsubmitする | 正常系 |
| 2 | Ctrl+Enterでもフォームをsubmitする | 正常系 |
| 3 | 修飾キー無しのEnterでは何もしない | 異常系(誤操作防止) |
| 4 | Cmd/Ctrlを押していてもEnter以外のキーでは何もしない | 異常系(誤操作防止) |

## 9. `src/lib/prompt-templates.test.ts`(`PROMPT_TEMPLATES`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | idが重複しない | データ整合性 |
| 2 | タイトル・本文が空でない | データ整合性 |
| 3 | TEXT用テンプレートは`{{変数名}}`を含む | データ整合性 |
| 4 | IMAGE・TEXT・PDFそれぞれ1件以上ある | データ整合性(網羅性) |

## 10. `src/lib/schedule-background.test.ts`(`scheduleBackground`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | Nextのリクエストスコープ外(テスト実行時)ではtaskの完了を待ってから返す(`after()`非対応環境へのフォールバック) | 正常系(環境依存フォールバック) |
| 2 | taskが例外を投げた場合、フォールバック時はそのまま伝播する | 異常系 |

## 11. `src/lib/share-token.test.ts`(`generateShareToken`)

| No. | テストケース | 観点 |
| --- | --- | --- |
| 1 | URLセーフな文字のみで構成される | セキュリティ |
| 2 | 呼び出すたびに異なる値を返す | セキュリティ(一意性) |

---

[← テスト仕様書に戻る](../test-specification.md) / [結合テスト一覧](./integration-tests.md)
