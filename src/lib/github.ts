import { Octokit } from "octokit";
import { prisma } from "@/lib/prisma";

export async function getGitHubAccessToken(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
  });
  return account?.access_token ?? null;
}

export async function getGitHubClient(userId: string) {
  const token = await getGitHubAccessToken(userId);
  if (!token) return null;
  return new Octokit({ auth: token });
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
