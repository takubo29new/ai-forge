// 音声評価(Issue #117)。クライアント(evaluation-manager.tsx/audio-downsample.ts)と
// サーバー(POST /api/evaluations)の双方で同じ上限値を使うため、ここに集約する
// (evaluation-batch-limits.tsと同じパターン)。

// ダウンサンプリング後(モノラル・8kHz・16bit)のWAVサイズの上限。8kHz・16bit・
// モノラルで約1.83MB/分、base64で約2.44MB/分。Vercelのサーバーレス関数の
// リクエスト本体上限(4.5MB、設定で変更不可)に対して安全マージンを取り、
// 約3分相当の4MBを上限とする。
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

// ダウンサンプリング前の元ファイルサイズの上限。ダウンサンプリング後のサイズとは
// 独立に、ブラウザでの デコード処理(AudioContext.decodeAudioData)が現実的な
// 時間で終わる範囲に留めるための粗いガード(数分の非圧縮WAVでも収まる想定)。
export const MAX_ORIGINAL_AUDIO_BYTES = 200 * 1024 * 1024;
