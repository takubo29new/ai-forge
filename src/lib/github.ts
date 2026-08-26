import { Octokit } from "octokit";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-log";
import { decryptToken, encryptToken, isEncryptedToken } from "@/lib/token-crypto";

// GitHub Appのユーザートークンは既定で8時間程度で失効する(GitHub OAuth Appとは異なる仕様)。
// refresh_tokenを使って更新しないと、ログインから数時間後にAPI呼び出しが
// 401 Bad credentialsで失敗するようになる。
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

async function refreshGitHubAccessToken(account: {
  id: string;
  refreshToken: string | null;
}): Promise<string | null> {
  if (!account.refreshToken) return null;

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
    }),
  });
  const data = await res.json();

  if (!res.ok || !data.access_token) {
    await logError({
      source: "SERVER",
      message: `GitHubアクセストークンの更新に失敗しました: ${data.error ?? res.status}`,
    });
    return null;
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: encryptToken(data.access_token),
      refresh_token: encryptToken(data.refresh_token ?? account.refreshToken),
      expires_at:
        typeof data.expires_in === "number"
          ? Math.floor(Date.now() / 1000) + data.expires_in
          : null,
      token_type: data.token_type ?? undefined,
      scope: data.scope ?? undefined,
    },
  });

  return data.access_token as string;
}

export async function getGitHubClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
  });
  if (!account?.access_token) return null;

  // 暗号化導入前に平文で保存された既存データは、読み取った際に暗号化して
  // 書き戻すことで自然に移行させる(専用の移行スクリプトを設けない)。
  const needsMigration =
    !isEncryptedToken(account.access_token) ||
    (account.refresh_token !== null && !isEncryptedToken(account.refresh_token));

  const accessToken = decryptToken(account.access_token);
  const refreshToken = account.refresh_token
    ? decryptToken(account.refresh_token)
    : null;

  if (needsMigration) {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: encryptToken(accessToken),
        refresh_token: refreshToken ? encryptToken(refreshToken) : account.refresh_token,
      },
    });
  }

  const isExpired =
    account.expires_at !== null &&
    account.expires_at <
      Math.floor(Date.now() / 1000) + TOKEN_REFRESH_BUFFER_SECONDS;

  if (!isExpired) {
    return new Octokit({ auth: accessToken });
  }

  const refreshedToken = await refreshGitHubAccessToken({
    id: account.id,
    refreshToken,
  });
  if (!refreshedToken) return null;
  return new Octokit({ auth: refreshedToken });
}

export async function listOpenPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
) {
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: 30,
  });

  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    author: pr.user?.login ?? null,
    headSha: pr.head.sha,
    updatedAt: pr.updated_at,
  }));
}

export async function getPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  return {
    number: data.number,
    title: data.title,
    url: data.html_url,
    headSha: data.head.sha,
  };
}

const MAX_DIFF_LENGTH = 50_000;

export async function getPullRequestDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  // mediaType: { format: "diff" } を指定すると data はunified diff形式の
  // 文字列になる(Octokitの型定義上はPullRequestオブジェクトのままなので
  // 実行時の型にあわせてキャストする)
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: { format: "diff" },
  });
  const diff = data as unknown as string;

  if (diff.length > MAX_DIFF_LENGTH) {
    return {
      diff: `${diff.slice(0, MAX_DIFF_LENGTH)}\n\n...(diff truncated at ${MAX_DIFF_LENGTH} characters)`,
      truncated: true,
    };
  }
  return { diff, truncated: false };
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  );
}

async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  try {
    // mediaType: { format: "raw" } を指定するとdataはファイルの生テキストになる
    // (Octokitの型定義上は通常のcontentオブジェクトのままなので実行時の型に
    // あわせてキャストする。getPullRequestDiff()と同じパターン)。デフォルトの
    // JSON形式(content: base64)は1MB超のファイルでcontentが空文字列になり
    // 中身を取得できないため、raw形式を使うことでその制限を避ける
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
      mediaType: { format: "raw" },
    });
    return data as unknown as string;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function listMarkdownFilePaths(
  octokit: Octokit,
  owner: string,
  repo: string,
  dirPath: string,
  ref?: string,
): Promise<string[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: dirPath,
      ref,
    });
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
      .map((entry) => entry.path);
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
}

// ai-forge自身のdocs同期(/api/documents/sync)がローカルfsから直接読むのに対し、
// 接続済みの他リポジトリはGitHub API経由でしかファイルを取得できない
// (docs/phases/phase4-design.md「2. プロジェクト単位のドキュメント管理」参照)。
// 対象はai-forge自身の同期と同じ範囲(ルートのREADME.md・docs/配下のMarkdown)に
// 揃える。存在しないファイル・ディレクトリは404として無視する
export async function fetchRepositoryMarkdownFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref?: string,
): Promise<{ sourcePath: string; content: string }[]> {
  const files: { sourcePath: string; content: string }[] = [];

  const readmeContent = await fetchFileContent(octokit, owner, repo, "README.md", ref);
  if (readmeContent !== null) {
    files.push({ sourcePath: "README.md", content: readmeContent });
  }

  const docsPaths = await listMarkdownFilePaths(octokit, owner, repo, "docs", ref);
  for (const sourcePath of docsPaths) {
    const content = await fetchFileContent(octokit, owner, repo, sourcePath, ref);
    if (content !== null) {
      files.push({ sourcePath, content });
    }
  }

  return files;
}
