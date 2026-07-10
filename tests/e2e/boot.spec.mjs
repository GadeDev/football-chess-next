// 起動回帰E2E（Issue #1 P0）: ホーム表示 → 対戦（モード選択）→ COM対戦 → 盤面と操作可能なTURN END。
// 起動時の未捕捉例外はテスト失敗にする。
import { test, expect } from "@playwright/test";
import {
  trackPageErrors,
  assertNoPageErrors,
  gotoHome,
  openModeOverlay,
} from "./helpers.mjs";

test("ホームメニューが表示され、未捕捉例外なく起動する", async ({ page }) => {
  const errors = trackPageErrors(page);
  await gotoHome(page);
  await expect(page.locator("#ogMatchBtn")).toBeVisible();
  await expect(page.locator("#ogDeckGrid")).toBeVisible(); // ホーム=編成画面
  // 旧・個別ボタンが復活していないこと（単一「対戦」ボタン仕様）
  await expect(page.locator("#ogKickoffBtn")).toHaveCount(0);
  await expect(page.locator("#ogOnlineBtn")).toHaveCount(0);
  assertNoPageErrors(errors);
});

test("「対戦」→モード選択にオンライン/COM/フレンドの3択が出る", async ({ page }) => {
  const errors = trackPageErrors(page);
  await gotoHome(page);
  await openModeOverlay(page);
  await expect(page.locator("#modeOnlineBtn")).toBeVisible();
  await expect(page.locator("#modeComBtn")).toBeVisible();
  await expect(page.locator("#modeFriendBtn")).toBeVisible();
  // 閉じる×で戻れる
  await page.locator("#modeCloseBtn").click();
  await expect(page.locator("#modeOverlay")).toBeHidden();
  assertNoPageErrors(errors);
});

test("COM対戦を開始すると盤面と操作可能なTURN ENDが表示される", async ({ page }) => {
  const errors = trackPageErrors(page);
  await gotoHome(page);
  await openModeOverlay(page);
  await page.locator("#modeComBtn").click();
  await expect(page.locator("#ogHome")).toBeHidden();
  await expect(page.locator("#board")).toBeVisible();
  expect(await page.locator("#board .cell").count()).toBeGreaterThan(0);
  const endTurn = page.locator("#endTurnBtn");
  await expect(endTurn).toBeVisible();
  await expect(endTurn).toBeEnabled();
  await expect(page.locator("#turnInfo")).toContainText("1");
  assertNoPageErrors(errors);
});

test("初回起動時だけチュートリアル案内が出て、以後は「遊び方」から再視聴できる", async ({ page }) => {
  const errors = trackPageErrors(page);
  // 初回（localStorageなし）: 案内が表示される
  await page.goto("/");
  await expect(page.locator("#tutorialPrompt")).toBeVisible();
  // 「あとで見る」で閉じ、案内済みが保存される
  await page.locator("#tpLaterBtn").click();
  await expect(page.locator("#tutorialPrompt")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("fc.tutorial.prompted"))).toBe("1");
  // 2回目以降: 案内は出ない
  await page.reload();
  await expect(page.locator("#ogHome")).toBeVisible();
  await expect(page.locator("#tutorialPrompt")).toBeHidden();
  // ホームの「遊び方」からいつでも再視聴でき、視聴済みが保存される
  await page.locator("#ogTutorialBtn").click();
  await expect(page.locator("#tutorialOverlay")).toBeVisible();
  await expect(page.locator("#tutorialCaption")).not.toHaveText("");
  expect(await page.evaluate(() => localStorage.getItem("fc.tutorial.seen"))).toBe("1");
  await page.locator("#tutorialCloseBtn").click();
  await expect(page.locator("#tutorialOverlay")).toBeHidden();
  assertNoPageErrors(errors);
});

test("「見る」を選ぶと初回案内からチュートリアルが開く", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/");
  await expect(page.locator("#tutorialPrompt")).toBeVisible();
  await page.locator("#tpWatchBtn").click();
  await expect(page.locator("#tutorialOverlay")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("fc.tutorial.seen"))).toBe("1");
  assertNoPageErrors(errors);
});

test("オンライン対戦は15秒でマッチングしなければCOM対戦へ自動フォールバックする", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackPageErrors(page);
  await gotoHome(page);
  await openModeOverlay(page);
  await page.locator("#modeOnlineBtn").click();
  await expect(page.locator("#matchingOverlay")).toBeVisible();
  // 相手がいないため15秒後にオーバーレイが閉じ、COM対戦（盤面）が始まる
  await expect(page.locator("#matchingOverlay")).toBeHidden({ timeout: 20_000 });
  await expect(page.locator("#board")).toBeVisible();
  await expect(page.locator("#endTurnBtn")).toBeEnabled();
  assertNoPageErrors(errors);
});

test("マッチング待機はキャンセルでホームに留まる", async ({ page }) => {
  const errors = trackPageErrors(page);
  await gotoHome(page);
  await openModeOverlay(page);
  await page.locator("#modeOnlineBtn").click();
  await expect(page.locator("#matchingOverlay")).toBeVisible();
  await page.locator("#mmCancelBtn").click();
  await expect(page.locator("#matchingOverlay")).toBeHidden();
  await expect(page.locator("#ogHome")).toBeVisible();
  // キャンセル後15秒経ってもCOM対戦へフォールバックしない
  await page.waitForTimeout(16_000);
  await expect(page.locator("#ogHome")).toBeVisible();
  assertNoPageErrors(errors);
});
