// 音声評価(Issue #117)。Vercelのサーバーレス関数はリクエスト本体が4.5MB固定
// (設定で変更不可)で、非圧縮WAVでは楽曲一曲分を送れない。そのためアップロード前に
// ブラウザ側(Web Audio API、追加ライブラリ不要)でモノラル・低いサンプルレートに
// ダウンサンプリングしてから送信する。ジャンル/ムード判定に必要な音響特徴
// (音量・明るさ・音高分布等)は8kHzでも十分捉えられる前提(高域の繊細な質感は失われる)。
const TARGET_SAMPLE_RATE = 8000;

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2; // 16bit PCM
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, text: string) {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmtチャンクサイズ
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // モノラル
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // バイトレート
  view.setUint16(32, bytesPerSample, true); // ブロックアライン
  view.setUint16(34, 16, true); // ビット深度
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return buffer;
}

import { blobToBase64 } from "@/lib/blob-to-base64";

// ファイルをモノラル・8kHz・16bit PCMのWAVにダウンサンプリングし、base64化して返す。
// maxBytesを超えた場合は例外を投げる(冒頭だけを黙って評価すると誤解を招くため、
// 一部だけの評価は行わず明示的にエラーにする)。
export async function downsampleAudioToWavBase64(
  file: File,
  maxBytes: number,
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  let decoded: AudioBuffer;
  let audioContext: AudioContext | undefined;
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioContext = new AudioContextCtor();
    decoded = await audioContext.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error("音声ファイルの読み込みに失敗しました");
  } finally {
    await audioContext?.close();
  }

  // サーバー側(audio-features.ts)の1秒未満エラーと同じ基準。ここで弾いて
  // おかないと、次のOfflineAudioContextの生成が長さ0で呼ばれて例外になる
  // (仕様上、長さ0のOfflineAudioContextは作成できない)。
  if (decoded.duration < 1) {
    throw new Error("音声が短すぎます(1秒以上にしてください)");
  }

  const targetLength = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offlineContext = new OfflineAudioContext(
    1,
    targetLength,
    TARGET_SAMPLE_RATE,
  );
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start(0);
  const rendered = await offlineContext.startRendering();

  const wavBuffer = encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
  if (wavBuffer.byteLength > maxBytes) {
    throw new Error(
      `音声が長すぎます(ダウンサンプリング後も${(maxBytes / 1024 / 1024).toFixed(1)}MBを超えました。短いファイルにしてください)`,
    );
  }

  return blobToBase64(new Blob([wavBuffer], { type: "audio/wav" }));
}
