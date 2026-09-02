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
      // このアプリの認証プロバイダはGitHubのみのため、「別プロバイダでメール
      // アドレスを詐称してアカウントを乗っ取る」というこのオプションが本来
      // 警戒する攻撃は構造的に成立しない。TOKEN_ENCRYPTION_KEYローテーション後、
      // Accountだけ削除してUserを残した状態(データ本体を保持するため)で再連携
      // する際、Auth.jsが既定でOAuthAccountNotLinkedを返し再ログインをブロック
      // するのを防ぐために必要(2026-09-02)。
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "database" },
});
