// (app)配下の全ページで共有するローディング表示。Server Componentのデータ
// 取得(prisma問い合わせ)が完了するまで画面が真っ白になっていた問題への対応
// (UI/UXブラッシュアップ候補「ローディング表現の統一」)。個別ページの内容に
// 合わせた専用スケルトンではなく、どの画面でも違和感の少ない汎用形にしている。
export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse px-6 py-8">
      <div className="mb-6 h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-8 h-7 w-56 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
    </div>
  );
}
