import { readFileSync } from "node:fs";

const file = new URL("../football-chess-prototype.html", import.meta.url);
const source = readFileSync(file, "utf8")
  .replace(/<!--[\s\S]*?-->/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, "")
  .replace(/const CUTIN_LABEL=\{[\s\S]*?\n\};/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/const CUTIN_SUBLABEL=\{[\s\S]*?\n\};/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/const OG_FORMATIONS=\[[\s\S]*?\n\];/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/const EN=\{[\s\S]*?(?=\nconst LOCALE_NAMES)/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/function kickKindLabel[\s\S]*?(?=\nfunction resolveCKOrGKSequence)/g, (value) => value.replace(/[^\n]/g, " "))
  // These functions retain Japanese as an internal battle-result protocol. Their
  // output is converted to matchLog keys by logBattleDetail before it reaches UI.
  .replace(/function resolveCKOrGKSequence[\s\S]*?(?=\nfunction kickSequenceReachedCK)/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/function resolveTackle[\s\S]*?(?=\nasync function applyTackleResult)/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/async function applyTackleResult[\s\S]*?(?=\nasync function runTackle)/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/function logBattleDetail[\s\S]*?(?=\nfunction localizeKickKind)/g, (value) => value.replace(/[^\n]/g, " "));
const lines = source.split("\n");
const findings = [];
const japanese = /[ぁ-んァ-ヶ一-龠]/;

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (!japanese.test(line)) continue;
  if (/const (JA|CUTIN_LABEL)|Object\.assign\(L10N\.ja|L10N\.ja\./.test(line)) continue;
  if (/const LOCALE_NAMES|function localizeLegacyText|snapshotHalfToLocal|event\.details\?\.half|state\.half|half:'前半'|half:'後半'|half==='前半'|half==='後半'|half='前半'|half='後半'|rollAT\('前半'\)|rollAT\('後半'\)/.test(line)) continue;
  if (/data-i18n(?:-attr)?=/.test(line)) continue;
  findings.push(`${index + 1}: ${line.trim().slice(0, 180)}`);
}

console.log(`Potential user-visible Japanese outside L10N: ${findings.length}`);
console.log(findings.slice(0, 250).join("\n"));
process.exitCode = findings.length ? 2 : 0;
