import Link from "next/link";
import { requireUserId } from "@/lib/session";

const SECTIONS = [
  { id: "login", label: "ログイン" },
  { id: "categories", label: "カテゴリ" },
  { id: "prompts", label: "プロンプトの作成・編集" },
  { id: "versions", label: "バージョン履歴" },
  { id: "execute", label: "実行" },
  { id: "history", label: "実行履歴" },
  { id: "faq", label: "よくある質問" },
];

export default async function HelpPage() {
  await requireUserId();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/prompts"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 一覧へ戻る
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">ヘルプ</h1>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        ai-forgeは、AIに投げるプロンプトを「コードのように」管理・改善するためのツールです。プロンプトをカテゴリ分けして登録し、Claudeに実行して結果を確認しながら、変更履歴を保ったまま改善していけます。
      </p>

      <nav className="mb-10 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-xs font-medium text-zinc-500">目次</p>
        <ul className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-zinc-700 hover:underline dark:text-zinc-300"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-10">
        <section id="login">
          <h2 className="mb-2 text-lg font-semibold">ログイン</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            GitHubアカウントでログインします。トップページにアクセスすると未ログイン時は自動的にログイン画面に移動するので、「GitHubでログイン」を押してGitHub側で許可すれば、プロンプト一覧画面に入れます。ログアウトはヘッダー右側のボタンから行えます。
          </p>
        </section>

        <section id="categories">
          <h2 className="mb-2 text-lg font-semibold">カテゴリ</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            プロンプトを分類するためのラベルです。プロンプト一覧の「カテゴリ管理」から作成・編集・削除できます。カテゴリを削除しても、そこに属していたプロンプトは削除されず「未分類」になります(確認ダイアログで対象件数が表示されます)。カテゴリ名は自分のアカウント内で一意である必要があります。
          </p>
        </section>

        <section id="prompts">
          <h2 className="mb-2 text-lg font-semibold">プロンプトの作成・編集</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            プロンプト一覧の「+ 新規作成」からタイトル・カテゴリ・本文を入力して作成します。作成後はプロンプト詳細画面の「編集」タブでいつでも本文を書き換えられます。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <strong>保存すると、既存の内容を上書きするのではなく新しいバージョンとして追加されます。</strong>
            過去の内容は消えないので、安心して書き換えを試せます。更新メモを添えておくと、あとで見返すときに何を変えたか分かりやすくなります。
          </p>
        </section>

        <section id="versions">
          <h2 className="mb-2 text-lg font-semibold">バージョン履歴</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            プロンプト詳細画面の「バージョン履歴」タブで、過去に保存したすべてのバージョンを新しい順に確認できます。各行をクリックすると、その時点の本文を読み取り専用で表示できます(そこから直接編集はできません。編集は常に最新バージョンに対して行います)。
          </p>
        </section>

        <section id="execute">
          <h2 className="mb-2 text-lg font-semibold">実行</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「実行」タブで、実行するバージョンとモデル(Claude Opus 5 / Sonnet 5 / Haiku 4.5)を選び、Claudeにプロンプトを送信できます。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            本文の中に <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">{"{{変数名}}"}</code>{" "}
            と書いておくと、実行タブに自動で入力欄が表示されます。例えば本文が次のようになっていた場合:
          </p>
          <pre className="mb-2 whitespace-pre-wrap rounded-lg border border-zinc-200 px-4 py-3 font-mono text-xs dark:border-zinc-800">
{"{{topic}}について、初心者向けに3行で説明してください。"}
          </pre>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            実行タブに「topic」という入力欄が現れるので、そこに値(例:
            「TypeScript」)を入れて実行すると、変数部分が置き換えられた本文がClaudeに送信されます。値を入力しなかった変数は
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">{"{{topic}}"}</code>
            のまま送信されます。
          </p>
        </section>

        <section id="history">
          <h2 className="mb-2 text-lg font-semibold">実行履歴</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            「実行履歴」タブで、これまでの実行結果を新しい順に確認できます。各行を開くと、結果本文(失敗した場合はエラー内容)、使用したバージョン、トークン数、実行時間が表示されます。
          </p>
        </section>

        <section id="faq">
          <h2 className="mb-4 text-lg font-semibold">よくある質問</h2>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium">Q. 実行が失敗しました。</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                A. 実行履歴にエラー内容が記録されます。「クレジット残高が不足しています」といったメッセージが表示される場合は、Anthropicアカウントの請求設定を確認してください。
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Q. バージョンを削除できますか?</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                A. 個別のバージョンは削除できません。プロンプトの変更履歴として意図的にすべて保持する設計です。プロンプトごと削除することは編集タブから可能です(この場合、紐づくすべてのバージョン・実行履歴も削除されます)。
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">
                Q. どのモデルを選べばいいですか?
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                A. 迷ったらデフォルトのClaude Opus 5を選んでください。より速い応答が欲しい場合はSonnet 5やHaiku
                4.5も選べます。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
