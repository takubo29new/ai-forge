import Link from "next/link";
import { requireUserId } from "@/lib/session";

const SECTIONS = [
  { id: "login", label: "ログイン" },
  { id: "categories", label: "カテゴリ" },
  { id: "prompts", label: "プロンプトの作成・編集" },
  { id: "versions", label: "バージョン履歴" },
  { id: "execute", label: "実行" },
  { id: "history", label: "実行履歴" },
  { id: "repositories", label: "リポジトリ連携" },
  { id: "review", label: "AIレビュー" },
  { id: "trends", label: "レビュー履歴・傾向" },
  { id: "appearance", label: "表示設定・エラーログ" },
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
        ai-forgeは、AIに投げるプロンプトを「コードのように」管理・改善するためのツールです。プロンプトをカテゴリ分けして登録し、Claudeに実行して結果を確認しながら、変更履歴を保ったまま改善していけます。管理したプロンプトは、GitHubリポジトリのPRに対するAIコードレビューにもそのまま使い回せます。
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

        <section id="repositories">
          <h2 className="mb-2 text-lg font-semibold">リポジトリ連携</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「リポジトリ」ページから、自分のGitHubリポジトリを接続できます。「+ リポジトリを接続」を押すとGitHub上のリポジトリ一覧がモーダルで表示されるので、選んで接続します。プライベートリポジトリも接続できます(初回のみGitHub側で追加の権限承認が必要になる場合があります)。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            「解除」を押すと接続を解除できます。解除すると、そのリポジトリに紐づくレビュー結果もすべて削除されるため、確認ダイアログに件数が表示されます。
          </p>
        </section>

        <section id="review">
          <h2 className="mb-2 text-lg font-semibold">AIレビュー</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            接続したリポジトリの詳細画面の「オープンなPR」タブから、レビューしたいPRを選び、使用するプロンプトを選んで「レビューを実行」を押すと、PRの差分をClaudeが解析して指摘事項を返します。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            レビューに使うプロンプトの本文には、必ず
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">{"{{diff}}"}</code>
            を含めてください。実行時にPRの差分がこの部分に展開されます。含まれていないプロンプトは実行前に警告が表示され、実行できません。
          </p>
        </section>

        <section id="trends">
          <h2 className="mb-2 text-lg font-semibold">レビュー履歴・傾向</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            リポジトリ詳細画面の「レビュー履歴」タブで、過去に実行したレビューを新しい順に確認できます。各行を開くと、ファイルごとの指摘事項と重要度(CRITICAL / WARNING / INFO)を確認できます。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            「傾向」タブでは、そのリポジトリでの累計指摘件数(重要度別)、直近10件のレビューの重要度の内訳、指摘が多いファイルの上位を確認できます。レビューを重ねるほど、どのファイル・観点に問題が集中しているか把握しやすくなります。
          </p>
        </section>

        <section id="appearance">
          <h2 className="mb-2 text-lg font-semibold">表示設定・エラーログ</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            ヘッダー右側の太陽・月アイコンで、ライトモード/ダークモードを手動で切り替えられます。何も操作しなければお使いの端末の設定(OSのライト/ダークモード)に従います。選択内容はこの端末のブラウザに保存され、次回アクセス時も引き継がれます。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            「エラーログ」ページでは、アプリ内で発生した想定外のエラーを直近50件まで確認できます。実行結果画面に出るエラー(APIエラーなど)とは別に、画面の表示中に起きた不具合の調査用です。
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
            <div>
              <p className="text-sm font-medium">
                Q. レビューを実行しようとすると警告が出て実行できません。
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                A. 選んだプロンプトの本文に
                <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">{"{{diff}}"}</code>
                が含まれていないと実行できません。プロンプトの編集タブで追記してください。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
