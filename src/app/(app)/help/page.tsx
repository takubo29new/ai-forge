import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { HelpToc } from "./help-toc";

const SECTIONS = [
  { id: "login", label: "ログイン" },
  { id: "search", label: "横断検索" },
  { id: "categories", label: "カテゴリ" },
  { id: "prompts", label: "プロンプトの作成・編集" },
  { id: "versions", label: "バージョン履歴" },
  { id: "execute", label: "実行" },
  { id: "history", label: "実行履歴" },
  { id: "repositories", label: "リポジトリ連携" },
  { id: "review", label: "AIレビュー" },
  { id: "trends", label: "レビュー履歴・傾向" },
  { id: "documents", label: "ドキュメント" },
  { id: "chat", label: "RAG検索チャット" },
  { id: "evaluations", label: "AI評価" },
  { id: "dashboard", label: "ダッシュボード" },
  { id: "appearance", label: "表示設定・エラーログ" },
  { id: "faq", label: "よくある質問" },
];

export default async function HelpPage() {
  await requireUserId();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← ダッシュボードへ
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">ヘルプ</h1>
      <p className="mb-8 max-w-3xl text-zinc-600 dark:text-zinc-400">
        ai-forgeは、AIに投げるプロンプトを「コードのように」管理・改善するためのツールです。プロンプトをカテゴリ分けして登録し、Claudeに実行して結果を確認しながら、変更履歴を保ったまま改善していけます。管理したプロンプトは、GitHubリポジトリのPRに対するAIコードレビューにもそのまま使い回せます。
      </p>

      <div className="flex flex-col gap-8 md:grid md:grid-cols-[180px_minmax(0,1fr)] md:items-start md:gap-10">
        <HelpToc sections={SECTIONS} />

        <div className="flex max-w-3xl flex-col gap-10">
        <section id="login" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">ログイン</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            GitHubアカウントでログインします。トップページにアクセスすると未ログイン時は自動的にログイン画面に移動するので、「GitHubでログイン」を押してGitHub側で許可すれば、プロンプト一覧画面に入れます。ログアウトはヘッダー右側のボタンから行えます。
          </p>
        </section>

        <section id="search" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">横断検索</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            ヘッダー右側の虫眼鏡アイコン、または
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">Ctrl</code>
            /
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">⌘</code>
            +
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">K</code>
            でどの画面からでもコマンドパレットを開けます。プロンプト・カテゴリ・リポジトリ・ドキュメント・評価・レビュー(PRタイトル)を横断して名前の部分一致で検索し、選ぶとその画面に移動します。矢印キーで候補を選び、Enterで移動できます。
          </p>
        </section>

        <section id="categories" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">カテゴリ</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            プロンプトを分類するためのラベルです。プロンプト一覧の「カテゴリ管理」から作成・編集・削除できます。カテゴリを削除しても、そこに属していたプロンプトは削除されず「未分類」になります(確認ダイアログで対象件数が表示されます)。カテゴリ名は自分のアカウント内で一意である必要があります。
          </p>
        </section>

        <section id="prompts" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">プロンプトの作成・編集</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            プロンプト一覧の「+ 新規作成」からタイトル・カテゴリ・本文を入力して作成します。作成後はプロンプト詳細画面の「編集」タブでいつでも本文を書き換えられます。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            <strong>保存すると、既存の内容を上書きするのではなく新しいバージョンとして追加されます。</strong>
            過去の内容は消えないので、安心して書き換えを試せます。更新メモを添えておくと、あとで見返すときに何を変えたか分かりやすくなります。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            AIレビューで一度でも使ったプロンプトには、「編集」タブの下に「レビュー指摘からの改善提案」が表示されます。過去の指摘の中から繰り返し発生しているパターンをAIが分析し、プロンプト本文の改善案を提案します(結果は保存されず、押すたびに生成し直します)。
          </p>
        </section>

        <section id="versions" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">バージョン履歴</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            プロンプト詳細画面の「バージョン履歴」タブで、過去に保存したすべてのバージョンを新しい順に確認できます。各行をクリックすると、その時点の本文を読み取り専用で表示できます(そこから直接編集はできません。編集は常に最新バージョンに対して行います)。
          </p>
        </section>

        <section id="execute" className="scroll-mt-6">
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

        <section id="history" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">実行履歴</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「実行履歴」タブで、これまでの実行結果を新しい順に確認できます。各行を開くと、結果本文(失敗した場合はエラー内容)、使用したバージョン、トークン数、実行時間が表示されます。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            各行のチェックボックスから2件選ぶと「比較する」ボタンが表示され、2つの実行結果を左右に並べて比較できます。プロンプトの異なるバージョン間で結果がどう変わったか確認したいときに使います。
          </p>
        </section>

        <section id="repositories" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">リポジトリ連携</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「リポジトリ」ページから、自分のGitHubリポジトリを接続できます。「+ リポジトリを接続」を押すとGitHub上のリポジトリ一覧がモーダルで表示されるので、選んで接続します。プライベートリポジトリも接続できます(初回のみGitHub側で追加の権限承認が必要になる場合があります)。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            「解除」を押すと接続を解除できます。解除すると、そのリポジトリに紐づくレビュー結果もすべて削除されるため、確認ダイアログに件数が表示されます。
          </p>
        </section>

        <section id="review" className="scroll-mt-6">
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

        <section id="trends" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">レビュー履歴・傾向</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            リポジトリ詳細画面の「レビュー履歴」タブで、過去に実行したレビューを新しい順に確認できます。各行を開くと、ファイルごとの指摘事項と重要度(CRITICAL / WARNING / INFO)を確認できます。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「傾向」タブでは、そのリポジトリでの累計指摘件数(重要度別)、直近10件のレビューの重要度の内訳、指摘が多いファイルの上位を確認できます。レビューを重ねるほど、どのファイル・観点に問題が集中しているか把握しやすくなります。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            「レビュー履歴」の各行のチェックボックスから2件選ぶと「比較する」ボタンが表示され、2つのレビュー結果を左右に並べて比較できます。同じPRに複数回レビューを実行したとき、指摘内容の違いを確認したい場合に使います。
          </p>
        </section>

        <section id="documents" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">ドキュメント</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「ドキュメント」ページから、設計書やメモをタイトル・本文で登録できます。本文はMarkdownの見出し(<code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">##</code>や<code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">###</code>)単位で自動的にチャンク分割され、それぞれに検索用の埋め込みベクトルが生成されます。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「設計書を同期」を押すと、ai-forgeプロジェクト自身の設計書(docs/配下のMarkdownファイル・README.md・ai-dev-tool-handoff.md)をまとめて取り込めます(「リポジトリ連携」で接続した他のGitHubリポジトリではなく、今動いているこのアプリ自身のファイルが対象です)。再度押すと最新の内容で作り直されるため、設計書を更新した後は同期し直してください。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「接続済みリポジトリの設計書を同期」からは、「リポジトリ連携」で接続したGitHubリポジトリを選んで、そのリポジトリのdocs/配下・README.mdをGitHub API経由で取り込めます。プロジェクトごとに検索対象を分けたい場合に使います。接続を解除すると、そのリポジトリから取り込んだドキュメントも一緒に削除されます。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            過去に実行したAIレビューの指摘は自動では検索対象になっていないため、「既存のレビュー指摘を取り込む」ボタンで一括して埋め込みを生成できます(新しく実行したレビューは自動で対象になります)。
          </p>
        </section>

        <section id="chat" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">RAG検索チャット</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「チャット」ページから、登録したドキュメントや過去のAIレビュー指摘について自然文で質問できます。質問に関連する内容をベクトル検索で探し、Claudeがその内容だけを根拠に回答します(文脈に無いことは推測で答えません)。回答の下に表示される出典から、元のレビュー詳細画面に遷移できます。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            接続済みリポジトリがある場合、入力欄の上の「対象リポジトリ」から特定のリポジトリに絞り込んで質問できます(未選択時はすべてのドキュメント・レビュー指摘を横断して検索します)。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            接続済みリポジトリと保存済みプロンプトの両方がある場合、入力欄の上に「AIレビュー実行」の選択フォーム(リポジトリ・PR番号・プロンプトをそれぞれ選択)が表示されます。選んで「確認画面を表示」を押すと実行内容の確認画面が表示されます。「
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">owner/repoのPR #12を「プロンプト名」でレビューして</code>
            」のように、リポジトリ名・PR番号・プロンプト名を含めて自然文で依頼しても同じ確認画面が表示されます(リポジトリ名など特定できない情報がある依頼は実行の提案自体が行われません)。内容を確認して「実行」を押すと、そのままAIレビューが実行され、結果画面へのリンクが表示されます(「キャンセル」を押すか内容が違っていれば取り消せます)。それ以外の操作(リポジトリの接続解除やプロンプトの削除など)はチャットからは実行できません。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            会話履歴はブラウザ上にのみ保持され、ページを離れると失われます。関連するドキュメント・レビュー指摘が見つからない場合は、その旨がそのまま返されます。
          </p>
        </section>

        <section id="evaluations" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">AI評価</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「評価」ページから、画像(料理の写真・自作の絵など)またはテキスト(歌詞・文章など)とプロンプトを選んで「評価を実行」を押すと、Claudeが観点別のコメント(良い点・提案・気になる点)と総評を返します。コードレビューと同じ「プロンプトを選んでClaudeに実行させる」仕組みを画像・テキスト入力向けに広げたものです。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            「テキスト」を選ぶと、選んだプロンプトの本文に含まれる
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">{"{{変数名}}"}</code>
            ごとに入力欄が表示されるので、評価したい内容を入力してください(プロンプト実行の変数展開と同じ仕組みです)。変数が含まれていないプロンプトはテキスト評価には使えません。
          </p>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            アップロードした画像自体はサーバーに保存されません。Claudeへのリクエストで使われるだけで、評価結果(テキスト)のみが記録されます。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            評価の実行を押すと、Claudeの応答を待たずにすぐ「処理中」の状態で結果画面に移動します(裏側でバックグラウンド実行中)。完了すると、開いたままの結果画面は自動的に更新され、他の画面に移動していても画面下部に完了の通知が表示されます。
          </p>
        </section>

        <section id="dashboard" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">ダッシュボード</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            「ダッシュボード」ページで、プロンプト数・接続リポジトリ数・累計レビュー指摘件数(重要度別)・登録ドキュメント数をまとめて確認できます。「チャットで質問する」「ドキュメントを管理」から各画面にすぐ移動できます。
          </p>
        </section>

        <section id="appearance" className="scroll-mt-6">
          <h2 className="mb-2 text-lg font-semibold">表示設定・エラーログ</h2>
          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
            ヘッダー右側の太陽・月アイコンで、ライトモード/ダークモードを手動で切り替えられます。何も操作しなければお使いの端末の設定(OSのライト/ダークモード)に従います。選択内容はこの端末のブラウザに保存され、次回アクセス時も引き継がれます。
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            「エラーログ」ページでは、アプリ内で発生した想定外のエラーを直近50件まで確認できます。実行結果画面に出るエラー(APIエラーなど)とは別に、画面の表示中に起きた不具合の調査用です。
          </p>
        </section>

        <section id="faq" className="scroll-mt-6">
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
    </div>
  );
}
