import { describe, expect, it } from "vitest";
import * as wav from "node-wav";
import { extractAudioFeatureSummary } from "./audio-features";

// 指定した周波数の正弦波(2秒、44100Hz、モノラル、32bit float)をbase64のWAVとして生成する。
// meydaの動作検証(スパイク)で使ったのと同じ手法。
function sineWaveWavBase64(frequencyHz: number, durationSeconds = 2, sampleRate = 44100) {
  const n = sampleRate * durationSeconds;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * 0.5;
  }
  const buffer = wav.encode([samples], { sampleRate, float: true, bitDepth: 32 });
  return buffer.toString("base64");
}

describe("extractAudioFeatureSummary", () => {
  it("440Hz(A4)の正弦波から主要な音高としてAを検出する", () => {
    const summary = extractAudioFeatureSummary(sineWaveWavBase64(440));
    expect(summary).toContain("長さ: 0分2秒");
    expect(summary).toMatch(/主要な音高\(クロマ上位3\): .*A/);
  });

  it("音量・明るさ・ノイズ感・高域の広がり・打楽器的な質感の各項目を含む", () => {
    const summary = extractAudioFeatureSummary(sineWaveWavBase64(440));
    expect(summary).toContain("音量(RMS平均)");
    expect(summary).toContain("明るさ(スペクトル重心)");
    expect(summary).toContain("ノイズ感(スペクトル平坦度)");
    expect(summary).toContain("高域の広がり(スペクトルロールオフ)");
    expect(summary).toContain("打楽器的な質感(ゼロ交差率)");
  });

  it("1秒未満の音声は例外を投げる", () => {
    expect(() => extractAudioFeatureSummary(sineWaveWavBase64(440, 0.5))).toThrow(
      "音声が短すぎます",
    );
  });

  it("WAV形式でないデータは例外を投げる", () => {
    const notWav = Buffer.from("this is not a wav file").toString("base64");
    expect(() => extractAudioFeatureSummary(notWav)).toThrow(
      "音声ファイルの読み込みに失敗しました",
    );
  });
});
