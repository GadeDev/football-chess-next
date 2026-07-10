// ブラウザE2E（Issue #1 P0）。`npm run test:e2e` で実行する。
// wrangler dev（miniflare）がHTML配信とDurable Object（MatchRoom/Matchmaker/AccountStore）を
// ローカルで完全再現するため、オンラインE2Eも実WebSocketで検証できる。
// ポートは8787固定（HTML側 defaultOnlineApiBase が同一オリジン/8787前提のため変更しない）。
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // COMフル試合とオンラインE2EはCPU負荷が高いため直列で安定させる
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8787",
    viewport: { width: 390, height: 844 }, // スマホ前提UI（iPhone相当）
    locale: "ja-JP",
    // 実行環境にプリインストール済みのChromiumを使う（バージョン違いの再ダウンロードを避ける）。
    // ローカルにこのパスが無い環境では launchOptions を外すか `npx playwright install chromium` を実行する。
    launchOptions: process.env.PLAYWRIGHT_BROWSERS_PATH
      ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` }
      : {},
  },
  webServer: {
    command: "npm run build:assets && npx wrangler dev --port 8787",
    url: "http://127.0.0.1:8787/api/universofutbol/football-chess/health",
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
