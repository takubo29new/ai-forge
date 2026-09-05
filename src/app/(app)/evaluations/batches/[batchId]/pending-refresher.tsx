"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;
// バッチは最大MAX_BATCH_SIZE件ぶん未完了になりうる(単一評価より取り残される
// 可能性が高い)ため、単一評価側のPendingRefresherと違い上限を設ける。
// 10分(4秒×150回)経っても終わらない場合はポーリングを止め、タブを開きっぱなしに
// しても際限なくServer Componentの再取得(findingsの復号込み)が走り続けない
// ようにする。通知(まとめ通知)自体はサーバー側で完了時に作られるため、
// ポーリングが止まっても見逃しにはならない。
const MAX_POLLS = 150;

// バッチAI評価(Issue #108)。バッチ内のいずれかがまだPENDINGの間、Server
// Componentを再取得してステータスの変化を反映する
// (evaluations/[id]/pending-refresher.tsxと同じパターン)。
export function BatchPendingRefresher() {
  const router = useRouter();

  useEffect(() => {
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      if (count > MAX_POLLS) {
        clearInterval(interval);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
