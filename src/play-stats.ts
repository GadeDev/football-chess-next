/*
 * KPI-01「遊んだ人」：対戦を始めた人を1日1人として数えるための純粋関数。
 * - 1日は日本時間の0時〜24時。
 * - UFの会員（UF IDでログインした人）は会員として、それ以外はブラウザに残る目印（clientId）で数える。
 * - 外に出すのは人数だけ。目印や会員IDは返さない。
 * 設計：GADE-AI-Workspace 06_Reports/DESIGN_20261106_KPI01_FOOTBALLCHESS_PLAYS.md
 */

export const PLAY_STATS_MAX_DAYS = 400;
const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** 日本時間の日付（YYYY-MM-DD）。 */
export function jstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

function validDay(value: string | null): value is string {
  if (!value || !DAY_RE.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}

export type StatsRange = { ok: true; from: string; to: string } | { ok: false; error: string };

/** ?date= か ?from=&to=。省略時は前日（日本時間）。最長400日。 */
export function parseStatsRange(params: URLSearchParams, now: Date = new Date()): StatsRange {
  const date = params.get("date");
  const fromParam = params.get("from");
  const toParam = params.get("to");
  if (date !== null) {
    if (fromParam !== null || toParam !== null) return { ok: false, error: "use date or from/to, not both" };
    if (!validDay(date)) return { ok: false, error: "date must be YYYY-MM-DD" };
    return { ok: true, from: date, to: date };
  }
  if (fromParam === null && toParam === null) {
    const yesterday = jstDay(new Date(now.getTime() - DAY_MS));
    return { ok: true, from: yesterday, to: yesterday };
  }
  if (!validDay(fromParam) || !validDay(toParam)) return { ok: false, error: "from and to must be YYYY-MM-DD" };
  const days = (Date.parse(`${toParam}T00:00:00Z`) - Date.parse(`${fromParam}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1) return { ok: false, error: "from must not be after to" };
  if (days > PLAY_STATS_MAX_DAYS) return { ok: false, error: `range must be ${PLAY_STATS_MAX_DAYS} days or less` };
  return { ok: true, from: fromParam, to: toParam };
}

/** ブラウザの目印として受け付ける形。合わないものは数えない。 */
export function normalizeClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return CLIENT_ID_RE.test(v) ? v : null;
}

/** UF IDでログインした会員か（このゲームだけの名前・パスワードのアカウントは会員に数えない）。 */
export function isUniversoMember(externalId: string | null | undefined): boolean {
  return typeof externalId === "string" && externalId.startsWith("uf:") && externalId.length > 3;
}

export interface PlayStatsBody {
  from: string;
  to: string;
  definition: "started_match";
  members: { played: number };
  guest: { browsers: number };
  new_members: null;
  notes: string[];
}

export function playStatsBody(from: string, to: string, members: number, browsers: number): PlayStatsBody {
  return {
    from,
    to,
    definition: "started_match",
    members: { played: members },
    guest: { browsers },
    new_members: null,
    notes: [
      "対戦（コンピューター戦・オンライン戦）を始めた人。期間中に何回遊んでも1人。",
      "会員はUF IDでログインした人。ログインなしは、ブラウザに残る目印で数える（同じ人が別のブラウザで遊ぶと2つに数える）。",
      "入会はUFのサイトで数える（この作品はPlatformの作品として登録されていない）。",
    ],
  };
}
