import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../football-chess-prototype.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

test("prototype inline scripts compile", () => {
  assert.ok(scripts.length > 0);
  scripts.forEach((source, index) => assert.doesNotThrow(() => new vm.Script(source, { filename: `prototype-${index}.js` })));
});

test("video tutorial ships five deterministic scenes and controls", () => {
  for (const id of ["intro", "move", "pass", "defend", "shoot"]) {
    assert.match(html, new RegExp(`id:'${id}'`));
  }
  for (const id of ["ogTutorialBtn", "tutorialPlayBtn", "tutorialRestartBtn", "tutorialNextBtn"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /const TUTORIAL_SCENE_MS=4800/);
});

test("all supported locales inherit tutorial copy and locale selector remains available", () => {
  assert.match(html, /const SUPPORTED_LOCALES=\['ja','en','ko','es','pt','de','zh-CN'\]/);
  assert.match(html, /data-i18n="tutorial\.open"/);
  assert.match(html, /id="ogSetLanguage"/);
});

test("localization boot initializes optional nested dictionaries before assignment", () => {
  assert.match(html, /Object\.assign\(dict\.action\|\|\(dict\.action=\{\}\)/);
  assert.doesNotMatch(html, /Object\.assign\(dict\.action,\{ball:/);
});

test("cut-in labels are resolved through localization dictionaries", () => {
  assert.match(html, /dict\.cutinLabel=/);
  assert.match(html, /cutinLabel\.\$\{key\}/);
  assert.match(html, /L10N\.ja\.cutinSub=/);
});

test("goal timeline is reconstructed from locale-independent log metadata", () => {
  const block = html.match(/function collectGoalTimelineFromLog\(\)[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(block, /dataset\.i18nLog/);
  assert.match(block, /params\.halfId/);
  assert.match(block, /params\.teamId/);
  assert.doesNotMatch(block, /textContent|相手ゴール|青\|赤/);
});

test("telemetry client does not include identity fields", () => {
  const block = html.match(/function sendTelemetry\([\s\S]*?\n}/)?.[0] ?? "";
  assert.match(block, /locale:currentLocale/);
  assert.doesNotMatch(block, /displayName|roomCode|authorization|onlineName/);
});

test("home offers a single match button that opens the mode selector", () => {
  // 2026-07-10仕様変更：ホームは「対戦」ボタンだけ→オンライン/COM/フレンドのモード選択へ
  for (const id of ["ogMatchBtn", "modeOverlay", "modeOnlineBtn", "modeComBtn", "modeFriendBtn"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  // 旧・個別ボタン（KICK OFF=COM対戦/オンライン対戦/ホームのフレンド対戦リンク）は廃止済み
  for (const id of ["ogKickoffBtn", "ogOnlineBtn", "ogFriendBtn"]) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
  }
});

test("online matchmaking falls back to COM silently (never disclosed to the user)", () => {
  // 9〜15秒ランダムでフォールバック（毎回15秒ちょうどだと機械的に見えるため）
  assert.match(html, /MM_COM_FALLBACK_MIN_MS=9000/);
  assert.match(html, /MM_COM_FALLBACK_MAX_MS=15000/);
  assert.match(html, /mmFallbackTimer=setTimeout/);
  // 成立演出（対戦相手が見つかりました：{name}）→ COM対戦を裏で開始
  assert.match(html, /aiOpponentName/);
  assert.match(html, /matching\.foundTpl/);
  assert.match(html, /startComMatch\(\);/);
  // 旧・30秒COM提案ボタンは廃止済み
  assert.doesNotMatch(html, /id="mmComBtn"/);
  // COMへの切替をユーザーに明示する文言・キーが復活していないこと（ユーザーが冷めるとの指摘）
  assert.doesNotMatch(html, /COMと対戦します/);
  assert.doesNotMatch(html, /comFallback/);
  assert.doesNotMatch(html, /id="mmNote"/);
});

test("premium-only ranking page ships with locked states and session binding", () => {
  for (const id of ["ogTabRanking", "ogPageRanking", "ogRankingBody"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const block = html.match(/async function ogRenderRanking\(\)[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(block, /ogIsPremium\(\)/);
  assert.match(block, /ogIsLoggedIn\(\)/);
  assert.match(block, /\/ranking\/top/);
  // オンライン席とアカウントの紐付け（ランキング記録用のsessionパラメータ）
  assert.match(html, /url\.searchParams\.set\('session',ogAuth\.token\)/);
});
