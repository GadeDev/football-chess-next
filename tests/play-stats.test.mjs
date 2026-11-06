import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PLAY_STATS_MAX_DAYS,
  isUniversoMember,
  jstDay,
  normalizeClientId,
  parseStatsRange,
  playStatsBody,
} from "../.test-dist/src/play-stats.js";

const q = (s) => new URLSearchParams(s);
const NOW = new Date("2026-11-06T16:30:00Z"); // 日本時間 11/7 01:30

test("1日は日本時間で区切る", () => {
  assert.equal(jstDay(new Date("2026-11-06T14:59:59Z")), "2026-11-06");
  assert.equal(jstDay(new Date("2026-11-06T15:00:00Z")), "2026-11-07");
});

test("期間の省略は日本時間の前日", () => {
  assert.deepEqual(parseStatsRange(q(""), NOW), { ok: true, from: "2026-11-06", to: "2026-11-06" });
});

test("date と from/to を受け付ける", () => {
  assert.deepEqual(parseStatsRange(q("date=2026-11-05"), NOW), { ok: true, from: "2026-11-05", to: "2026-11-05" });
  assert.deepEqual(parseStatsRange(q("from=2026-11-05&to=2026-11-06"), NOW), { ok: true, from: "2026-11-05", to: "2026-11-06" });
});

test("おかしな期間は断る", () => {
  for (const s of ["date=2026-13-01", "date=2026-02-30", "date=20261105", "from=2026-11-06&to=2026-11-05", "from=2026-11-05", "date=2026-11-05&from=2026-11-05&to=2026-11-05"]) {
    assert.equal(parseStatsRange(q(s), NOW).ok, false, s);
  }
});

test("期間は最長400日", () => {
  assert.equal(PLAY_STATS_MAX_DAYS, 400);
  assert.equal(parseStatsRange(q("from=2025-10-03&to=2026-11-06"), NOW).ok, true); // 400日
  assert.equal(parseStatsRange(q("from=2025-10-02&to=2026-11-06"), NOW).ok, false); // 401日
});

test("ブラウザの目印は決まった形だけ受け付ける", () => {
  assert.equal(normalizeClientId("fc-abc12345-lx9q0z"), "fc-abc12345-lx9q0z");
  for (const v of [null, 1, "", "abc", "a b c d", "<script>", "x".repeat(65)]) assert.equal(normalizeClientId(v), null, String(v));
});

test("会員はUF IDでログインした人だけ", () => {
  assert.equal(isUniversoMember("uf:5f0c"), true);
  for (const v of [null, undefined, "", "uf:", "wp:12", "5f0c"]) assert.equal(isUniversoMember(v), false, String(v));
});

test("返すのは人数だけ（毎朝の係が読む形）", () => {
  const body = playStatsBody("2026-11-05", "2026-11-06", 2, 5);
  assert.deepEqual(Object.keys(body).sort(), ["definition", "from", "guest", "members", "new_members", "notes", "to"]);
  assert.deepEqual(body.members, { played: 2 });
  assert.deepEqual(body.guest, { browsers: 5 });
  assert.equal(body.new_members, null);
  assert.equal(body.definition, "started_match");
});

test("コンピューター戦の開始で1回だけ知らせる", () => {
  const html = readFileSync(new URL("../football-chess-prototype.html", import.meta.url), "utf8");
  const body = (name) => {
    const at = html.indexOf(`function ${name}(){`);
    return html.slice(at, html.indexOf("\nfunction ", at + 1));
  };
  const start = body("startComMatch");
  assert.equal((start.match(/sendPlayStart\(\)/g) || []).length, 1);
  const fn = body("sendPlayStart");
  assert.match(fn, /\/plays\/start/);
  assert.match(fn, /client_id:getOnlineClientId\(\)/);
  // 表示名やルームコードは送らない
  assert.doesNotMatch(fn, /displayName|roomCode|ogUserName/);
});

// 会員の倉庫（AccountStore）をSQLiteで動かして、記録と数え方を確かめる。
const { DatabaseSync } = await import("node:sqlite");
const accountsSource = readFileSync(new URL("../.test-dist/src/accounts.js", import.meta.url), "utf8")
  .replace('import { DurableObject } from "cloudflare:workers";', "class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }")
  .replace('"./platform-subscription"', JSON.stringify(new URL("../.test-dist/src/platform-subscription.js", import.meta.url).href))
  .replace('"./play-stats"', JSON.stringify(new URL("../.test-dist/src/play-stats.js", import.meta.url).href))
  .replace('"./ranking"', JSON.stringify(new URL("../.test-dist/src/ranking.js", import.meta.url).href));
const { AccountStore } = await import("data:text/javascript;base64," + Buffer.from(accountsSource).toString("base64"));

function makeStore() {
  const db = new DatabaseSync(":memory:");
  const sql = { exec(query, ...args) { const st = db.prepare(query); const rows = st.columns().length ? st.all(...args) : (st.run(...args), []); return { toArray: () => rows }; } };
  const store = new AccountStore({ storage: { sql }, blockConcurrencyWhile: (fn) => fn() }, {});
  sql.exec("INSERT INTO users(id,name,name_key,external_id,created_at) VALUES(?,?,?,?,?)", "uf-user", "A", "a", "uf:11111111-2222-3333-4444-555555555555", "2026-01-01");
  sql.exec("INSERT INTO users(id,name,name_key,created_at) VALUES(?,?,?,?)", "local-user", "B", "b", "2026-01-01");
  sql.exec("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)", "uf-token", "uf-user", "2026-01-01", Date.now() + 60_000);
  sql.exec("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)", "old-token", "uf-user", "2026-01-01", Date.now() - 1);
  return { store, sql, db };
}

test("UF会員は会員として、それ以外はブラウザで1日1人に数える", async () => {
  const { store, sql, db } = makeStore();
  const day1 = Date.parse("2026-11-06T03:00:00Z"); // 日本時間 11/6
  const day2 = Date.parse("2026-11-07T03:00:00Z"); // 日本時間 11/7
  // UF会員：ログインの印（コンピューター戦）と席のアカウント（オンライン戦）は同じ人
  assert.equal(await store.recordPlayStart({ sessionToken: "uf-token", clientId: "fc-browser-01", now: day1 }), true);
  assert.equal(await store.recordPlayStart({ accountId: "uf-user", clientId: "fc-browser-02", now: day1 }), true);
  // このゲームだけのアカウント・期限切れのログイン・ログインなしは、ブラウザの目印で数える
  await store.recordPlayStart({ accountId: "local-user", clientId: "fc-browser-03", now: day1 });
  await store.recordPlayStart({ sessionToken: "old-token", clientId: "fc-browser-04", now: day1 });
  await store.recordPlayStart({ clientId: "fc-browser-04", now: day1 });
  // 目印もログインもない、形のおかしい目印は数えない
  assert.equal(await store.recordPlayStart({ clientId: "bad id", now: day1 }), false);
  assert.equal(await store.recordPlayStart({ now: day1 }), false);
  await store.recordPlayStart({ sessionToken: "uf-token", now: day2 });
  await store.recordPlayStart({ clientId: "fc-browser-03", now: day2 });

  assert.deepEqual(await store.playStats("2026-11-06", "2026-11-06"), { members: 1, browsers: 2 });
  assert.deepEqual(await store.playStats("2026-11-07", "2026-11-07"), { members: 1, browsers: 1 });
  assert.deepEqual(await store.playStats("2026-11-06", "2026-11-07"), { members: 1, browsers: 2 }); // 期間でも1人
  assert.deepEqual(await store.playStats("2026-11-08", "2026-11-08"), { members: 0, browsers: 0 });
  // 目印はそのまま保存しない
  const saved = sql.exec("SELECT who FROM play_starts").toArray().map((r) => r.who).join(" ");
  assert.doesNotMatch(saved, /fc-browser/);
  db.close();
});
