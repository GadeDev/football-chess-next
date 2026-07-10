/* ランキング（プレミアム限定）用の純粋計算ロジック。
   - Cloudflare依存なし（`node --test` で直接テストできるようにaccounts.tsから分離）。
   - レートはElo方式の簡略版: 初期1000 / K=32 / 下限0。
   - 相手がゲスト（アカウントなし）の場合は相手レート=1000とみなして計算する。 */

export const RANKING_INITIAL_RATING = 1000;
export const RANKING_K_FACTOR = 32;
export const RANKING_MIN_RATING = 0;

export type MatchOutcome = "win" | "loss" | "draw";

export function outcomeScore(outcome: MatchOutcome): number {
  return outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;
}

/* Elo期待勝率 */
export function expectedScore(myRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
}

/* 試合結果を反映した新しいレートを返す（四捨五入・下限0） */
export function nextRating(
  myRating: number,
  opponentRating: number,
  outcome: MatchOutcome,
): number {
  const updated =
    myRating + RANKING_K_FACTOR * (outcomeScore(outcome) - expectedScore(myRating, opponentRating));
  return Math.max(RANKING_MIN_RATING, Math.round(updated));
}

/* 勝者表記（'b'/'r'/'draw'）から各席のoutcomeを得る */
export function outcomeForSeat(seat: "b" | "r", winner: "b" | "r" | "draw"): MatchOutcome {
  if (winner === "draw") return "draw";
  return winner === seat ? "win" : "loss";
}
