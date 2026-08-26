"use client";

import { useCommandPalette } from "./command-palette";
import { SearchIcon } from "./icons";

export function CommandPaletteTrigger() {
  const { open } = useCommandPalette();

  return (
    <button
      type="button"
      onClick={open}
      title="検索(Ctrl/Cmd+K または /)"
      aria-label="検索"
      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
    >
      <SearchIcon />
    </button>
  );
}
