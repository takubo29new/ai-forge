import type { KeyboardEvent } from "react";

// Cmd(Mac)/Ctrl(Windows)+Enterで、フォーカスしている要素が属するformを送信する。
// textarea等、素のEnterでは改行になり送信されない入力欄向けのショートカット
// (単一行のinputは素のEnterで既にネイティブ送信されるため対象外でもよいが、
// 「Cmd+Enterで実行」という一貫したショートカットとして揃えて適用している)。
export function submitOnModEnter(
  e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

// テキスト入力中(input/textarea/select/contentEditable)かどうかを判定する。
// グローバルなキーボードショートカット(例: "/"で検索を開く)が、通常の
// 文字入力を横取りしないようにするためのガード。
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
