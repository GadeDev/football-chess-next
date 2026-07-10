// オンライン実通信E2E（Issue #1 P0）: wrangler dev のDurable Objectに対して
// 実ブラウザ2クライアント＋実WebSocketで、部屋作成/参加/両席入力/ターン解決/
// 再接続/投了/再戦/視点（青席・赤席）を確認する。
import { test, expect } from "@playwright/test";
import {
  trackPageErrors,
  assertNoPageErrors,
  gotoHome,
  openModeOverlay,
  currentTurn,
} from "./helpers.mjs";

async function openFriendOverlay(page) {
  await openModeOverlay(page);
  await page.locator("#modeFriendBtn").click();
  await page.locator("#friendOverlay").waitFor({ state: "visible" });
}

/* 両者のリプレイ完了（指定ターンの入力受付）を待つ */
async function waitForTurn(page, turn, timeout = 60_000) {
  await page.waitForFunction(
    (expected) => {
      const info = document.getElementById("turnInfo")?.textContent ?? "";
      const replaying = document.body.classList.contains("replaying");
      const m = /(\d+)/.exec(info);
      return !replaying && m && Number(m[1]) === expected;
    },
    turn,
    { timeout },
  );
}

test("フレンド対戦: 部屋作成→参加→両席入力→ターン解決→再接続→投了→再戦", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const errorsA = trackPageErrors(pageA);
  const errorsB = trackPageErrors(pageB);

  // --- A: 部屋を作る（ホストは青席） ---
  await gotoHome(pageA);
  await openFriendOverlay(pageA);
  await pageA.locator("#frCreateBtn").click();
  await expect(pageA.locator("#frRoomCode")).not.toHaveText("FC-XXXX-XXXX", { timeout: 20_000 });
  const roomCode = (await pageA.locator("#frRoomCode").textContent())?.trim() ?? "";
  expect(roomCode).toMatch(/^FC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  // --- B: 部屋に入る（後着は赤席） ---
  await gotoHome(pageB);
  await openFriendOverlay(pageB);
  await pageB.locator("#frJoinModeBtn").click();
  await pageB.locator("#frJoinInput").fill(roomCode);
  await pageB.locator("#frJoinBtn").click();

  // --- 両席が埋まるとホストの待機オーバーレイが自動で閉じ、両者とも盤面へ ---
  await expect(pageA.locator("#friendOverlay")).toBeHidden({ timeout: 30_000 });
  await expect(pageA.locator("#board")).toBeVisible();
  await expect(pageB.locator("#board")).toBeVisible();
  await waitForTurn(pageA, 1);
  await waitForTurn(pageB, 1);

  // 席割り: 先着=青 / 後着=赤（赤席は「自分=青見え」の視点変換の対象）
  expect(await pageA.evaluate(() => localPlayerTeam())).toBe("b");
  expect(await pageB.evaluate(() => localPlayerTeam())).toBe("r");

  // --- ターン1: 両席入力→サーバー解決→両者ターン2へ ---
  await pageA.locator("#endTurnBtn").click();
  await expect(pageA.locator("#endTurnBtn")).toContainText("送信済み");
  await pageB.locator("#endTurnBtn").click();
  await waitForTurn(pageA, 2);
  await waitForTurn(pageB, 2);

  // --- 再接続: Bをリロード → ?room= URLで自動参加し、同じ赤席・現在ターンへ復帰 ---
  expect(pageB.url()).toContain(`room=${roomCode}`);
  await pageB.reload();
  await expect(pageB.locator("#board")).toBeVisible();
  await waitForTurn(pageB, 2, 30_000);
  expect(await pageB.evaluate(() => localPlayerTeam())).toBe("r");

  // --- ターン2をもう1回解決（再接続後も入力→解決が通る） ---
  await pageB.locator("#endTurnBtn").click();
  await pageA.locator("#endTurnBtn").click();
  await waitForTurn(pageA, 3);
  await waitForTurn(pageB, 3);

  // --- 投了: Bが投了 → 両者に敗戦/勝利が通知される ---
  pageB.on("dialog", (dialog) => dialog.accept()); // 投了確認のconfirm()を承認
  await pageB.evaluate(() => resignOnlineMatch());
  await expect(pageA.locator('#log [data-i18n-log="resigned"]').first()).toBeAttached({ timeout: 20_000 });
  await expect(pageB.locator('#log [data-i18n-log="resigned"]').first()).toBeAttached({ timeout: 20_000 });

  // --- 再戦: 両者が希望すると同じROOMでターン1から再開 ---
  await pageA.evaluate(() => requestOnlineRematch());
  await pageB.evaluate(() => requestOnlineRematch());
  await waitForTurn(pageA, 1, 30_000);
  await waitForTurn(pageB, 1, 30_000);
  await expect(pageA.locator('#log [data-i18n-log="rematchStarted"]').first()).toBeAttached();

  // --- 退出: Aが明示退出 → オフラインへ ---
  await pageA.evaluate(() => leaveOnlineRoom());
  await expect(pageA.locator('#log [data-i18n-log="leftRoom"]').first()).toBeAttached({ timeout: 20_000 });

  assertNoPageErrors(errorsA);
  assertNoPageErrors(errorsB);
  await ctxA.close();
  await ctxB.close();
});

test("自動マッチング: 2クライアントが15秒以内にペア成立して対戦画面へ入る", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const errorsA = trackPageErrors(pageA);
  const errorsB = trackPageErrors(pageB);

  await gotoHome(pageA);
  await gotoHome(pageB);
  await openModeOverlay(pageA);
  await pageA.locator("#modeOnlineBtn").click();
  await expect(pageA.locator("#matchingOverlay")).toBeVisible();
  await openModeOverlay(pageB);
  await pageB.locator("#modeOnlineBtn").click();

  // 2秒ポーリングで先着ペア成立 → 双方が同じROOMへ接続する（15秒フォールバック前に成立する）。
  // 注意: #board はホームの背後に常時存在するため可視判定では接続を確認できない。
  // ホームが閉じ、席（online.role）が実際に割り当たるまで待つ。
  const seated = (page) =>
    page.waitForFunction(() => ["b", "r"].includes(onlineReconnectRole("")), null, { timeout: 20_000 });
  await expect(pageA.locator("#matchingOverlay")).toBeHidden({ timeout: 20_000 });
  await expect(pageB.locator("#matchingOverlay")).toBeHidden({ timeout: 20_000 });
  await expect(pageA.locator("#ogHome")).toBeHidden();
  await expect(pageB.locator("#ogHome")).toBeHidden();
  await seated(pageA);
  await seated(pageB);
  await waitForTurn(pageA, 1, 30_000);
  await waitForTurn(pageB, 1, 30_000);
  // 同じROOMに、片方が青・もう片方が赤で着席している
  expect(pageA.url()).toContain("room=");
  const roomOf = (url) => new URL(url).searchParams.get("room");
  expect(roomOf(pageA.url())).toBe(roomOf(pageB.url()));
  const teams = [
    await pageA.evaluate(() => localPlayerTeam()),
    await pageB.evaluate(() => localPlayerTeam()),
  ].sort();
  expect(teams).toEqual(["b", "r"]);

  assertNoPageErrors(errorsA);
  assertNoPageErrors(errorsB);
  await ctxA.close();
  await ctxB.close();
});
