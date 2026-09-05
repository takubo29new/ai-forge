import * as wav from "node-wav";
import MeydaImport from "meyda";

// meydaはpackage.jsonの"types"がweb向けESMビルド(dist/esm/main.d.ts)を指しており、
// Node向けCJSビルド(dist/node/main.js、実際にimportされる方)の型と厳密には一致しない
// (既知の型定義の食い違い)。実際に使う範囲だけをここで最小限に型付けし直す。
interface MeydaModule {
  bufferSize: number;
  sampleRate: number;
  extract(
    features: string[],
    signal: Float32Array,
  ): Record<string, number | number[]>;
}
const Meyda = MeydaImport as unknown as MeydaModule;

const BUFFER_SIZE = 1024;
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const FEATURES = [
  "rms",
  "spectralCentroid",
  "spectralFlatness",
  "spectralRolloff",
  "chroma",
  "zcr",
] as const;

// 音声評価(Issue #117)。Claude Messages APIには音声content blockが無いため、
// 音声そのものをClaudeに渡すことはできない。代わりにmeydaでフレームごとの
// 音響特徴(音量・明るさ・ノイズ感・音高分布等)を抽出し、平均・集計した上で
// 日本語の説明文に変換する。この説明文をTEXT分岐と同じ「contentは文字列」の
// 形でプロンプト本文に付け加えてClaudeに渡す(route.ts参照)。
//
// テンポ/BPM検出はmeydaに機能が無く、自前の簡易ビート検出は精度リスクが高いため
// 見送っている(v1スコープ外)。
export function extractAudioFeatureSummary(wavBase64: string): string {
  const buffer = Buffer.from(wavBase64, "base64");
  let decoded: ReturnType<typeof wav.decode>;
  try {
    decoded = wav.decode(buffer);
  } catch {
    throw new Error("音声ファイルの読み込みに失敗しました(WAV形式のみ対応しています)");
  }

  const signal = decoded.channelData[0];
  const sampleRate = decoded.sampleRate;
  const durationSeconds = signal.length / sampleRate;

  if (durationSeconds < 1) {
    throw new Error("音声が短すぎます(1秒以上にしてください)");
  }

  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;

  let rmsSum = 0;
  let centroidSum = 0;
  let flatnessSum = 0;
  let rolloffSum = 0;
  let zcrSum = 0;
  const chromaSum = new Array(12).fill(0);
  let frameCount = 0;

  for (let offset = 0; offset + BUFFER_SIZE <= signal.length; offset += BUFFER_SIZE) {
    const frame = signal.subarray(offset, offset + BUFFER_SIZE);
    const features = Meyda.extract([...FEATURES], frame);
    if (!features) continue;

    rmsSum += features.rms as number;
    centroidSum += features.spectralCentroid as number;
    flatnessSum += features.spectralFlatness as number;
    rolloffSum += features.spectralRolloff as number;
    zcrSum += features.zcr as number;
    const chroma = features.chroma as number[];
    for (let i = 0; i < 12; i++) chromaSum[i] += chroma[i];
    frameCount++;
  }

  if (frameCount === 0) {
    throw new Error("音声から特徴を抽出できませんでした");
  }

  const rms = rmsSum / frameCount;
  // spectralCentroidはナイキスト周波数(sampleRate/2)を上限とする周波数値。
  // 「明るさ」の目安として0〜1に正規化してから3段階の形容詞に変換する。
  const centroidNormalized = centroidSum / frameCount / (sampleRate / 2);
  const flatness = flatnessSum / frameCount;
  const rolloffNormalized = rolloffSum / frameCount / (sampleRate / 2);
  const zcr = zcrSum / frameCount / BUFFER_SIZE;

  const topChromaIndexes = chromaSum
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((entry) => entry.index);
  const topNotes = topChromaIndexes.map((i) => NOTE_NAMES[i]).join("、");

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);

  return [
    `長さ: ${minutes}分${seconds}秒`,
    `音量(RMS平均): ${describeLevel(rms, 0.02, 0.1)}`,
    `明るさ(スペクトル重心): ${describeLevel(centroidNormalized, 0.1, 0.25)}`,
    `ノイズ感(スペクトル平坦度): ${describeLevel(flatness, 0.05, 0.2)}`,
    `高域の広がり(スペクトルロールオフ): ${describeLevel(rolloffNormalized, 0.15, 0.35)}`,
    `打楽器的な質感(ゼロ交差率): ${describeLevel(zcr, 0.05, 0.15)}`,
    `主要な音高(クロマ上位3): ${topNotes}`,
  ].join("\n");
}

// 正規化済みの値をしきい値で3段階の形容詞に変換する。しきい値はmeydaの
// 一般的な値域を目安にしたラフな区分であり、将来的な調整を見込んでこの関数に
// 閉じ込めている。
function describeLevel(value: number, low: number, high: number): string {
  if (value < low) return "低い";
  if (value < high) return "中程度";
  return "高い";
}
