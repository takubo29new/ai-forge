import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  async function signInWithGitHub() {
    "use server";
    await signIn("github", { redirectTo: "/dashboard" });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">ai-forge</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          プロンプトをコードのように管理する
        </p>
      </div>
      <form action={signInWithGitHub}>
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          GitHubでログイン
        </button>
      </form>
    </div>
  );
}
