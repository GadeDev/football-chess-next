// E2E共通ヘルパー（Issue #1 P0）
// 方針: 起動時の未捕捉例外を必ずテスト失敗にする（pageerror収集）。

/* ページの未捕捉例外を収集する。テスト末尾で assertNoPageErrors を呼ぶこと。 */
export function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

export function assertNoPageErrors(errors) {
  if (errors.length > 0) {
    throw new Error(`未捕捉のページ例外が発生: \n${errors.join("\n")}`);
  }
}

/* 初回チュートリアル案内をスキップした状態でホームを開く（案内自体のテストは boot.spec 参照） */
export async function gotoHome(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fc.tutorial.prompted", "1");
    } catch {}
  });
  await page.goto("/");
  await page.locator("#ogHome").waitFor({ state: "visible" });
}

/* ホーム→「対戦」→モード選択を開く */
export async function openModeOverlay(page) {
  await page.locator("#ogMatchBtn").click();
  await page.locator("#modeOverlay").waitFor({ state: "visible" });
}

/* リプレイ中でなく入力可能なら TURN END を押す、を試合終了まで繰り返す共通ループ。
   - isDone(): 終了条件（例: #resultOverlay 表示）
   - 20秒の入力タイマーが自動発火するため、押し損ねても試合は進む（このループはそれを速める） */
export async function playUntil(page, isDone, { maxMs = 600_000 } = {}) {
  const startedAt = Date.now();
  for (;;) {
    if (await isDone()) return;
    if (Date.now() - startedAt > maxMs) {
      throw new Error(`playUntil: ${maxMs}ms 以内に終了条件へ到達しなかった`);
    }
    const clickable = await page.evaluate(() => {
      const btn = document.getElementById("endTurnBtn");
      const replaying = document.body.classList.contains("replaying");
      const result = document.getElementById("resultOverlay");
      const resultShown = result && result.style.display !== "none";
      return Boolean(btn && !btn.disabled && !replaying && !resultShown);
    });
    if (clickable) {
      // リプレイ開始と競合しても実害なし（ハンドラ側で再生中ガードあり）
      await page.locator("#endTurnBtn").click({ trial: false }).catch(() => {});
    }
    await page.waitForTimeout(300);
  }
}

export async function resultOverlayVisible(page) {
  return page.evaluate(() => {
    const el = document.getElementById("resultOverlay");
    return Boolean(el && el.style.display !== "none");
  });
}

/* "Turn N" 表示から現在ターン番号を読む */
export async function currentTurn(page) {
  const text = await page.locator("#turnInfo").textContent();
  const m = /(\d+)/.exec(text ?? "");
  return m ? Number(m[1]) : 0;
}
