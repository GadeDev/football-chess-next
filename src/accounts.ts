import { readPlatformSubscription } from "./platform-subscription";
import { DurableObject } from "cloudflare:workers";
import {
  RANKING_INITIAL_RATING,
  nextRating,
  outcomeForSeat,
  type MatchOutcome,
} from "./ranking";
import { PLAY_STATS_MAX_DAYS, isUniversoMember, jstDay, normalizeClientId } from "./play-stats";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* UniversoFutbol 会員基盤（暫定実装）
   - 現状: Worker 内アカウント（ユーザー名+パスワード）+ デモサブスク（実決済なし）。
   - 将来: universofutbol.com(WordPress) が発行する SSO トークン（HS256 JWT）でログインし、
     ここのアカウントに external_id で紐づける。詳細は AUTH_UNIVERSOFUTBOL.md。 */

export interface AccountUser {
  id: string;
  name: string;
  externalId: string | null;
  subscription: {
    active: boolean;
    plan: string | null;
    until: string | null;
    demo: boolean;
  };
  createdAt: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  token?: string;
  user?: AccountUser;
}

/* ランキングAPIレスポンス。一覧は公開、掲載と本人戦績はプレミアム限定。 */
export interface RankingEntry {
  rank: number;
  name: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface RankingResult {
  ok: boolean;
  error?: string;
  rankings?: RankingEntry[];
  me?: { rank: number | null; rating: number; wins: number; draws: number; losses: number; played: number };
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日
const PBKDF2_ITERATIONS = 100_000;

function nowIso(): string {
  return new Date().toISOString();
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function normalizeAccountName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/[\0-]/g, "");
  if (name.length < 2 || name.length > 16) return null;
  return name;
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 64;
}

interface UserRow {
  [key: string]: SqlStorageValue;
  id: string;
  name: string;
  pass_hash: string | null;
  salt: string | null;
  external_id: string | null;
  created_at: string;
  sub_active: number;
  sub_plan: string | null;
  sub_until: string | null;
  sub_demo: number;
  rating: number;
  rank_wins: number;
  rank_draws: number;
  rank_losses: number;
}

export class AccountStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          name_key TEXT NOT NULL UNIQUE,
          pass_hash TEXT,
          salt TEXT,
          external_id TEXT UNIQUE,
          created_at TEXT NOT NULL,
          sub_active INTEGER NOT NULL DEFAULT 0,
          sub_plan TEXT,
          sub_until TEXT,
          sub_demo INTEGER NOT NULL DEFAULT 1
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          window_start INTEGER NOT NULL,
          count INTEGER NOT NULL
        )
      `);
      // KPI-01：対戦を始めた人（1日1人）。who は "m:<アカウントID>"（UF会員）か "b:<目印のSHA-256>"（ログインなし）。
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS play_starts (
          day TEXT NOT NULL,
          who TEXT NOT NULL,
          kind TEXT NOT NULL,
          PRIMARY KEY (day, who)
        )
      `);
      // ランキング用の戦績カラム（既存DBへの後付けなので ALTER TABLE を冪等に流す）
      for (const ddl of [
        "ALTER TABLE sessions ADD COLUMN platform_token TEXT",
        `ALTER TABLE users ADD COLUMN rating INTEGER NOT NULL DEFAULT ${RANKING_INITIAL_RATING}`,
        "ALTER TABLE users ADD COLUMN rank_wins INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN rank_draws INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN rank_losses INTEGER NOT NULL DEFAULT 0",
      ]) {
        try {
          this.ctx.storage.sql.exec(ddl);
        } catch {
          /* すでに追加済み */
        }
      }
    });
  }

  /* IP別レート制限（固定ウィンドウ）。許可なら true。key例: "login:1.2.3.4" */
  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const row = this.ctx.storage.sql
      .exec<{ window_start: number; count: number }>(
        `SELECT window_start, count FROM rate_limits WHERE key = ?`,
        key,
      )
      .toArray()[0];
    if (!row || now - row.window_start >= windowMs) {
      this.ctx.storage.sql.exec(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET window_start = ?, count = 1`,
        key,
        now,
        now,
      );
      // 古いウィンドウの残骸をたまに掃除
      this.ctx.storage.sql.exec(`DELETE FROM rate_limits WHERE window_start < ?`, now - 24 * 60 * 60 * 1000);
      return true;
    }
    if (row.count >= limit) return false;
    this.ctx.storage.sql.exec(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`, key);
    return true;
  }

  // ------------------------------------------------------
  // KPI-01：対戦を始めた人を数える（数だけを外に出す。目印・IDは返さない）

  /**
   * 対戦を始めた人を1件記録する。UF IDでログインした会員は会員として、それ以外はブラウザの目印で数える。
   * 同じ日に同じ人が何度始めても1件。数えられない入力（目印もログインもない）は記録しない。
   */
  async recordPlayStart(input: {
    sessionToken?: unknown;
    accountId?: string | null;
    clientId?: unknown;
    now?: number;
  }): Promise<boolean> {
    const day = jstDay(new Date(input.now ?? Date.now()));
    let row: UserRow | undefined;
    if (typeof input.accountId === "string" && input.accountId) row = this.userById(input.accountId);
    else if (input.sessionToken) row = this.userBySession(input.sessionToken);
    let who: string | null = null;
    let kind: "member" | "browser" = "member";
    if (row && isUniversoMember(row.external_id)) {
      who = `m:${row.id}`;
    } else {
      const clientId = normalizeClientId(input.clientId);
      if (clientId) {
        who = `b:${await sha256Hex(clientId)}`;
        kind = "browser";
      }
    }
    if (!who) return false;
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO play_starts (day, who, kind) VALUES (?, ?, ?)`,
      day,
      who,
      kind,
    );
    // 400日より古い記録はたまに掃除する（数える期間の上限と同じ）
    if (Math.random() < 0.02) {
      const cutoff = jstDay(new Date(Date.now() - (PLAY_STATS_MAX_DAYS + 1) * 86_400_000));
      this.ctx.storage.sql.exec(`DELETE FROM play_starts WHERE day < ?`, cutoff);
    }
    return true;
  }

  /** 期間中に対戦を始めた人の数（期間中に何回遊んでも1人）。 */
  async playStats(from: string, to: string): Promise<{ members: number; browsers: number }> {
    const rows = this.ctx.storage.sql
      .exec<{ kind: string; n: number }>(
        `SELECT kind, COUNT(DISTINCT who) AS n FROM play_starts WHERE day >= ? AND day <= ? GROUP BY kind`,
        from,
        to,
      )
      .toArray();
    const count = (k: string) => Number(rows.find((r) => r.kind === k)?.n ?? 0);
    return { members: count("member"), browsers: count("browser") };
  }

  // ------------------------------------------------------
  // public RPC

  async register(nameInput: unknown, passwordInput: unknown): Promise<AuthResult> {
    const name = normalizeAccountName(nameInput);
    if (!name) return { ok: false, error: "ユーザー名は2〜16文字で入力してください" };
    if (!validPassword(passwordInput)) {
      return { ok: false, error: "パスワードは8〜64文字で入力してください" };
    }
    const exists = this.userByNameKey(name.toLowerCase());
    if (exists) return { ok: false, error: "そのユーザー名はすでに使われています" };

    const id = crypto.randomUUID();
    const salt = randomHex(16);
    const hash = await hashPassword(passwordInput, salt);
    this.ctx.storage.sql.exec(
      `INSERT INTO users (id, name, name_key, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      name,
      name.toLowerCase(),
      hash,
      salt,
      nowIso(),
    );
    return this.issueSession(id);
  }

  async login(nameInput: unknown, passwordInput: unknown): Promise<AuthResult> {
    const name = normalizeAccountName(nameInput);
    if (!name || typeof passwordInput !== "string") {
      return { ok: false, error: "ユーザー名またはパスワードが違います" };
    }
    const row = this.userByNameKey(name.toLowerCase());
    if (!row || !row.pass_hash || !row.salt) {
      return { ok: false, error: "ユーザー名またはパスワードが違います" };
    }
    const hash = await hashPassword(passwordInput, row.salt);
    if (!timingSafeEqualHex(hash, row.pass_hash)) {
      return { ok: false, error: "ユーザー名またはパスワードが違います" };
    }
    return this.issueSession(row.id);
  }

  /* SSO ログイン（トークン検証は Worker 側で済ませ、検証済みプロファイルだけ受け取る） */
  async ssoLogin(profile: {
    externalId: string;
    name: string;
    subscribed: boolean;
  }, platformToken = ""): Promise<AuthResult> {
    const name = normalizeAccountName(profile.name) ?? `UF-${profile.externalId.slice(0, 8)}`;
    let row = this.ctx.storage.sql
      .exec<UserRow>(`SELECT * FROM users WHERE external_id = ?`, profile.externalId)
      .toArray()[0];
    if (!row) {
      const id = crypto.randomUUID();
      let nameKey = name.toLowerCase();
      if (this.userByNameKey(nameKey)) nameKey = `${nameKey}#${profile.externalId.slice(0, 6)}`;
      this.ctx.storage.sql.exec(
        `INSERT INTO users (id, name, name_key, external_id, created_at) VALUES (?, ?, ?, ?, ?)`,
        id,
        name,
        nameKey,
        profile.externalId,
        nowIso(),
      );
      row = this.userById(id)!;
    }
    // UniversoFutbol 側のサブスク状態を正としてログイン時に同期する（本サブスクはdemo=0）
    this.ctx.storage.sql.exec(
      `UPDATE users SET sub_active = ?, sub_plan = ?, sub_until = NULL, sub_demo = 0 WHERE id = ?`,
      profile.subscribed ? 1 : 0,
      profile.subscribed ? "universofutbol" : null,
      row.id,
    );
    const session = this.issueSession(row.id);
    if (platformToken && session.token) this.ctx.storage.sql.exec(
      "UPDATE sessions SET platform_token = ? WHERE token = ?", platformToken, session.token);
    return { ...session, ...(await this.me(session.token)) };
  }

  async me(token: unknown): Promise<AuthResult> {
    const row = this.userBySession(token);
    if (!row) return { ok: false, error: "ログインしていません" };
    const credential = this.ctx.storage.sql.exec<{platform_token: string | null}>(
      "SELECT platform_token FROM sessions WHERE token = ?", String(token)).toArray()[0];
    const subscription = await readPlatformSubscription(this.env, credential?.platform_token ?? "", row.external_id ?? "");
    // Never return the historical demo/SSO cache as current entitlement.
    return { ok: true, user: { ...this.toUser(row), subscription } };
  }

  async logout(token: unknown): Promise<{ ok: boolean }> {
    if (typeof token === "string" && token) {
      this.ctx.storage.sql.exec(`DELETE FROM sessions WHERE token = ?`, token);
    }
    return { ok: true };
  }

  /* オンライン席とアカウントを紐付けるためのセッション解決（MatchRoomから呼ぶ）。
     無効・期限切れトークンは null（ゲスト扱い） */
  async sessionUserId(token: unknown): Promise<string | null> {
    const row = this.userBySession(token);
    return row ? row.id : null;
  }

  /* オンライン試合の確定結果（フルタイム/投了）をサーバー権威で記録する。
     - MatchRoom（Durable Object）だけが呼ぶ。クライアントから直接叩くAPIは無い（改ざん防止）。
     - ゲスト席（accountId無し）は記録対象外。同一アカウント同士（2席とも同じID）は自作自演防止でスキップ。
     - レートはElo簡略版（src/ranking.ts）。相手がゲストなら相手レート=初期値1000とみなす。 */
  async recordRankedResult(
    bAccountId: string | null,
    rAccountId: string | null,
    winner: "b" | "r" | "draw",
  ): Promise<{ ok: boolean; recorded: ("b" | "r")[] }> {
    if (winner !== "b" && winner !== "r" && winner !== "draw") return { ok: false, recorded: [] };
    if (bAccountId && rAccountId && bAccountId === rAccountId) return { ok: true, recorded: [] };
    // 登録済みアカウントのオンライン試合を反映する。ゲストは対象外。
    const bCandidate = bAccountId ? this.userById(bAccountId) : undefined;
    const rCandidate = rAccountId ? this.userById(rAccountId) : undefined;
    const bRow = bCandidate;
    const rRow = rCandidate;
    const bRating = bRow?.rating ?? RANKING_INITIAL_RATING;
    const rRating = rRow?.rating ?? RANKING_INITIAL_RATING;
    const recorded: ("b" | "r")[] = [];
    const apply = (seat: "b" | "r", row: UserRow | undefined, oppRating: number): void => {
      if (!row) return;
      const outcome: MatchOutcome = outcomeForSeat(seat, winner);
      const rating = nextRating(row.rating ?? RANKING_INITIAL_RATING, oppRating, outcome);
      this.ctx.storage.sql.exec(
        `UPDATE users SET rating = ?,
           rank_wins = rank_wins + ?,
           rank_draws = rank_draws + ?,
           rank_losses = rank_losses + ?
         WHERE id = ?`,
        rating,
        outcome === "win" ? 1 : 0,
        outcome === "draw" ? 1 : 0,
        outcome === "loss" ? 1 : 0,
        row.id,
      );
      recorded.push(seat);
    };
    // 双方とも「試合前のレート」を基準に更新する（applyの順序で結果が変わらないように）
    apply("b", bRow, rRating);
    apply("r", rRow, bRating);
    return { ok: true, recorded };
  }

  /* 公開ランキング。
     - 一覧は未ログインを含む全員が閲覧できる。
     - 掲載は登録済み会員。1試合以上プレイした人を表示。
     - 本人戦績（me）は登録済み本人にだけ返す。 */
  async rankingTop(token: unknown, limit = 100): Promise<RankingResult> {
    const row = this.userBySession(token);
    const top = this.ctx.storage.sql
      .exec<UserRow>(
        `SELECT * FROM users
         WHERE (rank_wins + rank_draws + rank_losses) > 0
         ORDER BY rating DESC, rank_wins DESC, created_at ASC
         LIMIT ?`,
        Math.max(1, Math.min(200, limit)),
      )
      .toArray();
    const rankings: RankingEntry[] = top.map((u, i) => ({
      rank: i + 1,
      name: u.name,
      rating: u.rating ?? RANKING_INITIAL_RATING,
      wins: u.rank_wins ?? 0,
      draws: u.rank_draws ?? 0,
      losses: u.rank_losses ?? 0,
    }));
    if (!row) return { ok: true, rankings };

    const played = (row.rank_wins ?? 0) + (row.rank_draws ?? 0) + (row.rank_losses ?? 0);
    let myRank: number | null = null;
    if (played > 0) {
      const higher = this.ctx.storage.sql
        .exec<{ n: number }>(
          `SELECT COUNT(*) AS n FROM users
           WHERE (rank_wins + rank_draws + rank_losses) > 0 AND rating > ?`,
          row.rating ?? RANKING_INITIAL_RATING,
        )
        .toArray()[0];
      myRank = (higher?.n ?? 0) + 1;
    }
    return {
      ok: true,
      rankings,
      me: {
        rank: myRank,
        rating: row.rating ?? RANKING_INITIAL_RATING,
        wins: row.rank_wins ?? 0,
        draws: row.rank_draws ?? 0,
        losses: row.rank_losses ?? 0,
        played,
      },
    };
  }

  // ------------------------------------------------------
  // private

  private issueSession(userId: string): AuthResult {
    const token = randomHex(32);
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
      token,
      userId,
      nowIso(),
      now + SESSION_TTL_MS,
    );
    this.ctx.storage.sql.exec(`DELETE FROM sessions WHERE expires_at < ?`, now);
    return { ok: true, token, user: this.toUser(this.userById(userId)!) };
  }

  private userByNameKey(nameKey: string): UserRow | undefined {
    return this.ctx.storage.sql
      .exec<UserRow>(`SELECT * FROM users WHERE name_key = ?`, nameKey)
      .toArray()[0];
  }

  private userById(id: string): UserRow | undefined {
    return this.ctx.storage.sql.exec<UserRow>(`SELECT * FROM users WHERE id = ?`, id).toArray()[0];
  }

  private userBySession(token: unknown): UserRow | undefined {
    if (typeof token !== "string" || !token) return undefined;
    const session = this.ctx.storage.sql
      .exec<{ user_id: string; expires_at: number }>(
        `SELECT user_id, expires_at FROM sessions WHERE token = ?`,
        token,
      )
      .toArray()[0];
    if (!session || session.expires_at < Date.now()) return undefined;
    return this.userById(session.user_id);
  }

  private toUser(row: UserRow): AccountUser {
    // Entitlement is granted only by me() after a live platform check.
    const active = false;
    return {
      id: row.id,
      name: row.name,
      externalId: row.external_id,
      subscription: {
        active,
        plan: active ? row.sub_plan : null,
        until: active ? row.sub_until : null,
        demo: row.sub_demo === 1,
      },
      createdAt: row.created_at,
    };
  }
}
