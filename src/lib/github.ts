import { Octokit } from "octokit";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-log";

// GitHub Appのユーザートークンは既定で8時間程度で失効する(GitHub OAuth Appとは異なる仕様)。
// refresh_tokenを使って更新しないと、ログインから数時間後にAPI呼び出しが
// 401 Bad credentialsで失敗するようになる。
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

async function refreshGitHubAccessToken(account: {
  id: string;
  refresh_token: string | null;
}): Promise<string | null> {
  if (!account.refresh_token) return null;

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
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
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? account.refresh_token,
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

  const isExpired =
    account.expires_at !== null &&
    account.expires_at <
      Math.floor(Date.now() / 1000) + TOKEN_REFRESH_BUFFER_SECONDS;

  if (!isExpired) {
    return new Octokit({ auth: account.access_token });
  }

  const refreshedToken = await refreshGitHubAccessToken(account);
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
