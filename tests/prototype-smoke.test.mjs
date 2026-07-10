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
