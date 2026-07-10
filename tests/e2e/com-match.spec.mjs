// COM戦フルタイムE2E（Issue #1 P0）: 開始→前半→ハーフタイム→後半→フルタイム→リザルト→ホーム復帰。
// 各ターンはリプレイ完了を待ってTURN ENDを押す（押し損ねても20秒タイマーで進むため停滞しない）。
import { test, expect } from "@playwright/test";
import {
  trackPageErrors,
  assertNoPageErrors,
  gotoHome,
  openModeOverlay,
  playUntil,
  resultOverlayVisible,
} from "./helpers.mjs";

test("COM戦を開始からフルタイムまで自動実行できる", async ({ page }) => {
  test.setTimeout(600_000); // 前後半30ターン超＋リプレイ演出ぶん
  const errors = trackPageErrors(page);
  await gotoHome(page);
  await openModeOverlay(page);
  await page.locator("#modeComBtn").click();
  await expect(page.locator("#board")).toBeVisible();

  // フルタイム（リザルト演出）まで自動でターンを進める
  await playUntil(page, () => resultOverlayVisible(page), { maxMs: 540_000 });

  // ハーフタイムとフルタイムのログが残っている（構造化ログのキーで言語非依存に確認。
  // オフライン戦は halftimeSimple / matchResult キーを使う。halftime/fulltime はオンライン再生用）
  await expect(page.locator('#log [data-i18n-log="halftimeSimple"]').first()).toBeAttached();
  await expect(page.locator('#log [data-i18n-log="matchResult"]').first()).toBeAttached();

  // COM AIの攻撃力回帰（2026-07-10ユーザー指摘「無操作でもシュートに至らない」の再発防止）:
  // このテストのプレイヤー(青)は一切操作しないため、シュート系ログが1件でもあれば赤AIのシュート。
  const shotLogs = await page
    .locator('#log [data-i18n-log="goal"], #log [data-i18n-log="shotMiss"], #log [data-i18n-log="shotBlocked"], #log [data-i18n-log="gkSave"], #log [data-i18n-log="goalAgainst"]')
    .count();
  expect(shotLogs).toBeGreaterThan(0);

  // リザルトからホームへ戻れる（タップで演出スキップ→HOME）
  await page.locator("#resultOverlay").click();
  await page.locator("#resultHomeBtn").click();
  await expect(page.locator("#ogHome")).toBeVisible();

  assertNoPageErrors(errors);
});
