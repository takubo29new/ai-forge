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
