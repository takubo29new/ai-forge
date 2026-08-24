import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-crypto";

const prismaAdapter = PrismaAdapter(prisma);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: {
    ...prismaAdapter,
    // 初回ログイン連携時にAccountが作成される唯一の経路。access_token/
    // refresh_tokenをDBに平文で残さないよう、ここで暗号化してから永続化する
    // (以降のトークン更新はsrc/lib/github.tsのgetGitHubClient/
    // refreshGitHubAccessTokenが担い、同様に暗号化して保存する)。
    linkAccount: (account) =>
      prismaAdapter.linkAccount!({
        ...account,
        access_token: account.access_token
          ? encryptToken(account.access_token)
          : account.access_token,
        refresh_token: account.refresh_token
          ? encryptToken(account.refresh_token)
          : account.refresh_token,
      }),
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      // Phase 2のリポジトリ連携・PR取得のため repo スコープを追加する
      authorization: { params: { scope: "read:user user:email repo" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "database" },
});
