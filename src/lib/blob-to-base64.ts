// FileはBlobのサブタイプのため、画像/PDF/音声いずれのアップロードもこの
// 1つの実装で共通化できる(evaluation-manager.tsx・audio-downsample.tsで共有)。
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("ファイルの読み込みに失敗しました"));
        return;
      }
      // data:image/png;base64,xxxx... のうちbase64本体だけを取り出す
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
}
