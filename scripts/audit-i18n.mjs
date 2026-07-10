import { readFileSync } from "node:fs";

const file = new URL("../football-chess-prototype.html", import.meta.url);
const source = readFileSync(file, "utf8")
  .replace(/<!--[\s\S]*?-->/g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, "");
const lines = source.split("\n");
const findings = [];
const japanese = /[ぁ-んァ-ヶ一-龠]/;

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (!japanese.test(line)) continue;
  if (/const (JA|CUTIN_LABEL)|Object\.assign\(L10N\.ja/.test(line)) continue;
  if (/data-i18n(?:-attr)?=/.test(line)) continue;
  findings.push(`${index + 1}: ${line.trim().slice(0, 180)}`);
}

console.log(`Potential user-visible Japanese outside L10N: ${findings.length}`);
console.log(findings.slice(0, 250).join("\n"));
process.exitCode = findings.length ? 2 : 0;
