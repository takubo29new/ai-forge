import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert prose-pre:border prose-pre:border-zinc-200 prose-pre:bg-zinc-100 prose-pre:text-zinc-800 dark:prose-pre:border-zinc-700 dark:prose-pre:bg-zinc-900 dark:prose-pre:text-zinc-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
