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

test("how-to-play is a static one-page guide with five illustrated rules", () => {
  // 2026-07-11仕様変更: 動画型チュートリアル（アニメ再生・MP4収録前提）は廃止し、静的1枚ガイドへ
  for (const id of ["intro", "move", "pass", "defend", "shoot"]) {
    assert.match(html, new RegExp(`id:'${id}'`));
  }
  assert.match(html, /const TUTORIAL_GUIDE=/);
  assert.match(html, /id="tutorialSheet"/);
  assert.match(html, /id="ogTutorialBtn"/);
  assert.match(html, /id="tutorialCloseBtn"/);
  // 旧・再生系UIが復活していないこと
  for (const id of ["tutorialPlayBtn", "tutorialRestartBtn", "tutorialNextBtn", "tutorialProgressBar", "tutorialTabs"]) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /TUTORIAL_SCENE_MS/);
  assert.doesNotMatch(html, /tutorial\.scene_complete/);
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

test("TEAM COST label is localized for 7 locales and rank hint is premium-only", () => {
  // ホームの合計表示とランク変更ウィンドウのTEAM COST表記が英語固定でないこと（2026-07-10ユーザー指摘）
  assert.match(html, /TEAM_COST_LABELS/);
  assert.match(html, /ja:'チームコスト'/);
  assert.match(html, /'zh-CN':'球队成本'/);
  assert.match(html, /tFmt\('ogTeamCostTpl'/);
  assert.doesNotMatch(html, /textContent=`TEAM COST /);
  // 「駒をタップでランク変更」ヒントはプレミアム加入者のみ表示
  assert.match(html, /ogIsPremium\(\)\?t\('ogCostHint'\):''/);
});

test("header shows real names and COM personas cover all six formations", () => {
  // ヘッダーは「あなた/あいて」ではなく実名（自分=プレイヤー名/相手=オンライン名 or COMペルソナ）
  assert.match(html, /function headerTeamNames\(/);
  const personas = html.match(/const COM_PERSONAS=\[[\s\S]*?\];/)?.[0] ?? "";
  for (const id of [1, 2, 3, 4, 5, 6]) {
    assert.match(personas, new RegExp(`formationId:${id},`), `フォーメーション${id}のペルソナが無い`);
  }
  // 秘匿方針: ペルソナ名にCOM/AIを含めない
  assert.doesNotMatch(personas, /name:'[^']*(COM|AI|CPU)[^']*'/i);
  // COM(赤)の編成はペルソナのフォーメーションで組む
  assert.match(html, /comTeamDef\(\)\.forEach/);
});

test("player name persists across reloads (session restore must not overwrite it)", () => {
  // セッション復元(ogRestoreSession)は syncName を渡さない＝プレイヤー名を上書きしない
  assert.match(html, /function ogApplyUser\(options=\{\}\)/);
  assert.match(html, /ogAuth\.user&&options\.syncName/);
  const restoreBlock = html.match(/async function ogRestoreSession\(\)[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(restoreBlock, /ogApplyUser\(\);/);
  assert.doesNotMatch(restoreBlock, /syncName/);
  // 入力の都度保存（changeのみだとリロードで失われる）
  assert.match(html, /addEventListener\('input',e=>ogSaveNameFromInput/);
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
