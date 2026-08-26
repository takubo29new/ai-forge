"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./modal";
import { Spinner } from "./spinner";
import { SearchIcon } from "./icons";
import { isEditableTarget } from "@/lib/keyboard-shortcuts";

type ResultRow = { id: string; label: string };
type SearchResults = {
  prompts: ResultRow[];
  categories: ResultRow[];
  repositories: ResultRow[];
  documents: ResultRow[];
  evaluations: ResultRow[];
  reviews: ResultRow[];
};

const GROUPS: (keyof SearchResults)[] = [
  "prompts",
  "categories",
  "repositories",
  "documents",
  "evaluations",
  "reviews",
];

const GROUP_LABELS: Record<keyof SearchResults, string> = {
  prompts: "プロンプト",
  categories: "カテゴリ",
  repositories: "リポジトリ",
  documents: "ドキュメント",
  evaluations: "評価",
  reviews: "レビュー",
};

// ドキュメントには個別の詳細画面が無いため、一覧ページへのリンクにする。
function hrefFor(group: keyof SearchResults, id: string): string {
  switch (group) {
    case "prompts":
      return `/prompts/${id}`;
    case "categories":
      return `/prompts?categoryId=${id}`;
    case "repositories":
      return `/repositories/${id}`;
    case "documents":
      return "/documents";
    case "evaluations":
      return `/evaluations/${id}`;
    case "reviews":
      return `/reviews/${id}`;
  }
}

const DEBOUNCE_MS = 200;

type CommandPaletteContextValue = { open: () => void };
const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

// Cmd/Ctrl+Kで開く軽量なコマンドパレット(横断検索)。プロンプト・カテゴリ・
// リポジトリ・ドキュメント・評価・レビューを対象に、名前・タイトルの部分一致で
// すぐ探せるようにする。専用の検索UIライブラリは導入せず、既存のModalコンポー
// ネントを流用した手作りの実装にしている。
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => setIsOpen(true), []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults(null);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }
      // "/"は他の一般的なWebサービス(GitHub等)と同じ、検索フォーカス用の
      // 補助ショートカット。通常のテキスト入力中に横取りしないよう、入力欄に
      // フォーカスが無い場合のみ反応する。
      if (e.key === "/" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setIsOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // Modal自体はダイアログのコンテナへフォーカスするため、ここで検索入力欄へ
    // 上書きする(ティックをずらして実行順を後ろにする)。
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [isOpen]);

  // 検索欄の変更イベント側でクリアする(空になった時点で即座に古い結果を消す)。
  // 「クエリが空ならsetState」というeffect側での同期はreact-hooksのルールに
  // 反する(派生状態の計算はイベントハンドラかレンダー中に行うべきという指針、
  // https://react.dev/learn/you-might-not-need-an-effect)ため、こちらで行う。
  function handleQueryChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setResults(null);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!isOpen || !query.trim()) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          setResults(await res.json());
          setActiveIndex(0);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const flatResults = useMemo(() => {
    if (!results) return [];
    return GROUPS.flatMap((group) =>
      results[group].map((row) => ({ group, ...row, href: hrefFor(group, row.id) })),
    );
  }, [results]);

  const navigateTo = useCallback(
    (href: string) => {
      closePalette();
      router.push(href);
    },
    [closePalette, router],
  );

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatResults[activeIndex];
      if (target) navigateTo(target.href);
    }
  }

  return (
    <CommandPaletteContext.Provider value={{ open: openPalette }}>
      {children}
      <Modal open={isOpen} onClose={closePalette} labelledBy="command-palette-title">
        <h2 id="command-palette-title" className="sr-only">
          横断検索
        </h2>
        <div className="flex items-center gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <SearchIcon className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="プロンプト・リポジトリ・ドキュメント等を検索..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          {loading && <Spinner className="h-4 w-4 shrink-0 text-zinc-400" />}
        </div>

        <div className="mt-3 max-h-96 overflow-y-auto">
          {!query.trim() && (
            <p className="px-1 py-6 text-center text-sm text-zinc-500">
              入力して検索してください
            </p>
          )}
          {query.trim() && results && flatResults.length === 0 && !loading && (
            <p className="px-1 py-6 text-center text-sm text-zinc-500">
              一致する結果がありません
            </p>
          )}
          {GROUPS.map((group) => {
            if (!results || results[group].length === 0) return null;
            return (
              <div key={group} className="mb-2">
                <p className="px-1 py-1 text-xs font-medium text-zinc-500">
                  {GROUP_LABELS[group]}
                </p>
                <ul>
                  {results[group].map((row) => {
                    const flatIndex = flatResults.findIndex(
                      (r) => r.group === group && r.id === row.id,
                    );
                    const active = flatIndex === activeIndex;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={() => navigateTo(hrefFor(group, row.id))}
                          className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm ${
                            active
                              ? "bg-accent text-white"
                              : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {row.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Modal>
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider");
  }
  return ctx;
}
