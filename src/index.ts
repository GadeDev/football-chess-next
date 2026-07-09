import { DurableObject } from "cloudflare:workers";
import { AccountStore } from "./accounts";
export { AccountStore };
import {
  REGULAR_TURNS,
  createInitialGameState,
  normalizeGameState,
  opponentTeam,
  rollIntInclusive,
  resolveServerTurn,
  setupKickoffForTeam,
  teamDefinitionCost,
  validateTeamDefinition,
  validateCommandsForTeam,
  type FootballChessGameState,
  type GameCommand,
  type Team,
  type TeamPieceDefinition,
  type TurnEvent,
  type TurnResolution,
} from "./game-core";

type SeatRole = Team | "spectator";
type RoomStatus = "waiting" | "ready" | "playing" | "finished";

interface ContentInfo {
  property: "UniversoFutbol";
  slug: string;
  title: "Football Chess";
  basePath: string;
  universoFutbolUrl: string;
}

interface PlayerSeat {
  clientId: string;
  displayName: string;
  teamCost?: number;
  connected: boolean;
  joinedAt: string;
  lastSeenAt: string;
}

interface TurnInfo {
  half: "first" | "second";
  index: number;
  inputDeadlineAt: string | null;
  additionalTurns: {
    first: number | null;
    second: number | null;
  };
}

interface PendingIntent {
  team: Team;
  clientId: string;
  commands: GameCommand[];
  submittedAt: string;
}

interface MatchSnapshot {
  schemaVersion: 1;
  roomCode: string;
  content: ContentInfo;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
  cleanupAt: string | null;
  players: Partial<Record<Team, PlayerSeat>>;
  teamDefinitions: Partial<Record<Team, TeamPieceDefinition[]>>;
  spectatorCount: number;
  turn: TurnInfo;
  game: FootballChessGameState;
  pendingIntents: Partial<Record<Team, PendingIntent>>;
  rematchRequests: Partial<Record<Team, string>>;
  lastResolution?: {
    turn: TurnInfo;
    resolvedAt: string;
    events: TurnEvent[];
    logs: string[];
  };
  eventSeq: number;
}

interface ClientSession {
  clientId: string;
  role: SeatRole;
  displayName: string;
  joinedAt: string;
}

interface ServerEnvelope {
  type: string;
  roomCode: string;
  seq: number;
  payload: unknown;
}

interface PresenceInfo {
  connections: number;
  spectators: number;
  status: RoomStatus;
  inputDeadlineAt: string | null;
  pendingTeams: Team[];
  players: Partial<
    Record<
      Team,
      {
        displayName: string;
        teamCost?: number;
        connected: boolean;
        lastSeenAt: string;
      }
    >
  >;
}

const API_PREFIX = "/api/universofutbol/football-chess";
const ROOM_CODE_RE = /^[A-Z0-9-]{4,24}$/;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TURN_INPUT_TIMEOUT_MS = 3 * 60 * 1000;
const ROOM_IDLE_CLEANUP_MS = 30 * 60 * 1000;
const FINISHED_ROOM_CLEANUP_MS = 6 * 60 * 60 * 1000;

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      ...init.headers,
    },
  });
}

function problem(status: number, message: string): Response {
  return json({ error: message }, { status });
}

function normalizeRoomCode(value: string): string | null {
  const roomCode = value.trim().toUpperCase();
  return ROOM_CODE_RE.test(roomCode) ? roomCode : null;
}

function createRoomCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) suffix += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
  return `FC-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`;
}

function contentInfo(env: Env): ContentInfo {
  return {
    property: "UniversoFutbol",
    slug: env.CONTENT_SLUG,
    title: "Football Chess",
    basePath: env.PUBLIC_BASE_PATH,
    universoFutbolUrl: env.UNIVERSO_FUTBOL_URL,
  };
}

function joinUrl(env: Env, roomCode: string): string {
  return `${env.PUBLIC_BASE_PATH}?room=${encodeURIComponent(roomCode)}`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function stringField(value: unknown, fallback: string, maxLength = 48): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : fallback;
}

function roleField(value: unknown): SeatRole | "auto" {
  return value === "b" || value === "r" || value === "spectator" ? value : "auto";
}

function teamField(value: unknown): Team | null {
  return value === "b" || value === "r" ? value : null;
}

function teamDefinitionField(value: string | null): { definition?: TeamPieceDefinition[]; error?: string } {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    const validation = validateTeamDefinition(parsed);
    if (!validation.ok) return { error: validation.errors.join("; ") };
    return { definition: validation.definition };
  } catch {
    return { error: "Invalid team definition JSON" };
  }
}

function roomStub(env: Env, roomCode: string): DurableObjectStub<MatchRoom> {
  return env.MATCH_ROOM.getByName(roomCode);
}

/* ===== UniversoFutbol 会員/サブスク（暫定: Worker内アカウント。AUTH_UNIVERSOFUTBOL.md 参照） ===== */

function accountStub(env: Env): DurableObjectStub<AccountStore> {
  return env.ACCOUNTS.getByName("global");
}

function bearerToken(request: Request): string {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const pad = "=".repeat((4 - (value.length % 4)) % 4);
    const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/* WordPress(UniversoFutbol) 発行の SSO トークンを検証する。
   形式: HS256 JWT / claims: sub(会員ID), name(表示名), subscribed(bool), exp(unix秒) */
async function verifySsoToken(
  token: string,
  secret: string,
): Promise<{ externalId: string; name: string; subscribed: boolean } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const signature = base64UrlToBytes(parts[2]);
  const payloadBytes = base64UrlToBytes(parts[1]);
  if (!signature || !payloadBytes) return null;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const dataBytes = enc.encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature as unknown as ArrayBuffer,
    dataBytes as unknown as ArrayBuffer,
  );
  if (!valid) return null;

  const payload = parseJsonObject(new TextDecoder().decode(payloadBytes));
  if (!payload) return null;
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp * 1000 < Date.now()) return null;
  const externalId =
    typeof payload.sub === "string" || typeof payload.sub === "number" ? String(payload.sub) : "";
  if (!externalId) return null;
  return {
    externalId,
    name: stringField(payload.name, `UF-${externalId}`, 16),
    subscribed: payload.subscribed === true,
  };
}

/* Universo Futbol Platform (fc-platform-api) の access token を検証してプロフィールを得る。
   ポータル(universo-frontpage)の /api/auth/launch が付ける #uf_sso ハンドオフの受け口。
   同一アカウントの workers.dev 同士は素の fetch() が通らないため service binding 経由で呼ぶ。 */
async function verifyUniversoPlatformToken(
  env: Env,
  accessToken: string,
): Promise<{ externalId: string; name: string; subscribed: boolean } | null> {
  const binding = (env as { PLATFORM_API?: Fetcher }).PLATFORM_API;
  if (!binding) return null;
  const origin =
    (env as { PLATFORM_API_ORIGIN?: string }).PLATFORM_API_ORIGIN ??
    "https://fc-platform-api.yanagiho.workers.dev";
  const authHeaders = { authorization: `Bearer ${accessToken}` };

  // トークン検証 + user_id 取得（無効・期限切れトークンはここで弾かれる）
  const meRes = await binding.fetch(`${origin}/v1/users/me`, { headers: authHeaders });
  if (!meRes.ok) return null;
  const me = parseJsonObject(await meRes.text());
  const userId = me && typeof me.user_id === "string" ? me.user_id : "";
  if (!userId || !me) return null;
  if (typeof me.state === "string" && me.state !== "active") return null;

  // 表示名（公開プロフィール）。失敗してもログインは通す
  let name = "";
  try {
    const profRes = await binding.fetch(`${origin}/v1/portal/users/${userId}/profile`);
    if (profRes.ok) {
      const prof = parseJsonObject(await profRes.text());
      if (prof && typeof prof.display_name === "string") name = prof.display_name;
    }
  } catch {
    /* 表示名はフォールバックで続行 */
  }

  // UFサブスク（uf_subscription_*、game_id=NULL の共通サブスク）を premium として同期
  let subscribed = false;
  try {
    const entRes = await binding.fetch(
      `${origin}/v1/entitlements?state=active&tag=uf_subscription`,
      { headers: authHeaders },
    );
    if (entRes.ok) {
      const ent = parseJsonObject(await entRes.text());
      const items = ent && Array.isArray(ent.items) ? (ent.items as unknown[]) : [];
      subscribed = items.some(
        (it) => !!it && typeof it === "object" && (it as { kind?: unknown }).kind === "subscription",
      );
    }
  } catch {
    /* サブスク同期失敗時は無料扱いで続行（次回SSOで再同期される） */
  }

  return {
    externalId: `uf:${userId}`,
    name: stringField(name, `UF-${userId.slice(0, 8)}`, 16),
    subscribed,
  };
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/* レート制限。超過時は 429 を返す。認証系は総当たり対策、ROOM作成は乱造対策 */
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  auth: { limit: 10, windowMs: 10 * 60 * 1000 }, // login/register/sso: 10回/10分/IP
  billing: { limit: 30, windowMs: 60 * 60 * 1000 },
  room: { limit: 12, windowMs: 60 * 60 * 1000 }, // ROOM作成: 12回/時/IP
};

async function rateLimited(env: Env, bucket: keyof typeof RATE_LIMITS, request: Request): Promise<boolean> {
  const conf = RATE_LIMITS[bucket];
  const ok = await accountStub(env).checkRateLimit(`${bucket}:${clientIp(request)}`, conf.limit, conf.windowMs);
  return !ok;
}

async function handleAuthApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const accounts = accountStub(env);
  const route = `${request.method} ${pathname.slice(API_PREFIX.length)}`;

  const isAuthAttempt =
    route === "POST /auth/register" ||
    route === "POST /auth/login" ||
    route === "POST /auth/sso" ||
    route === "POST /auth/uf-sso";
  if (isAuthAttempt && (await rateLimited(env, "auth", request))) {
    return problem(429, "試行回数が多すぎます。しばらく待ってから再試行してください");
  }
  if (route.startsWith("POST /billing/") && (await rateLimited(env, "billing", request))) {
    return problem(429, "試行回数が多すぎます。しばらく待ってから再試行してください");
  }
  const body =
    request.method === "POST" ? (parseJsonObject(await request.text()) ?? {}) : ({} as Record<string, unknown>);

  switch (route) {
    case "POST /auth/register":
      return json(await accounts.register(body.name, body.password));
    case "POST /auth/login":
      return json(await accounts.login(body.name, body.password));
    case "POST /auth/logout":
      return json(await accounts.logout(bearerToken(request)));
    case "GET /auth/me":
      return json(await accounts.me(bearerToken(request)));
    case "POST /auth/sso": {
      const secret = (env as { SSO_SECRET?: string }).SSO_SECRET;
      if (!secret) return problem(501, "SSO is not configured (set SSO_SECRET)");
      const token = typeof body.token === "string" ? body.token : "";
      const profile = await verifySsoToken(token, secret);
      if (!profile) return problem(401, "Invalid SSO token");
      return json(await accounts.ssoLogin(profile));
    }
    case "POST /auth/uf-sso": {
      // Universo Futbol ポータルからのSSOハンドオフ（#uf_sso fragment の access_token）
      const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
      if (!accessToken) return problem(400, "access_token is required");
      const profile = await verifyUniversoPlatformToken(env, accessToken);
      if (!profile) return problem(401, "Invalid Universo Futbol access token");
      return json(await accounts.ssoLogin(profile));
    }
    case "POST /billing/subscribe":
      return json(await accounts.subscribe(bearerToken(request)));
    case "POST /billing/cancel":
      return json(await accounts.cancelSubscription(bearerToken(request)));
    default:
      return problem(404, "Not found");
  }
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return json({ ok: true });

  if (url.pathname === `${API_PREFIX}/health` && request.method === "GET") {
    return json({
      ok: true,
      content: contentInfo(env),
      environment: env.ENVIRONMENT,
    });
  }

  if (
    url.pathname.startsWith(`${API_PREFIX}/auth/`) ||
    url.pathname.startsWith(`${API_PREFIX}/billing/`)
  ) {
    return handleAuthApi(request, env, url.pathname);
  }

  if (url.pathname === `${API_PREFIX}/matches` && request.method === "POST") {
    if (await rateLimited(env, "room", request)) {
      return problem(429, "ROOM作成が多すぎます。しばらく待ってから再試行してください");
    }
    const roomCode = createRoomCode();
    const snapshot = await roomStub(env, roomCode).getSnapshot(roomCode, contentInfo(env));
    return json({ roomCode, joinUrl: joinUrl(env, roomCode), snapshot }, { status: 201 });
  }

  const match = url.pathname.match(new RegExp(`^${API_PREFIX}/matches/([^/]+)(/socket)?$`));
  if (!match) return problem(404, "Not found");

  const roomCode = normalizeRoomCode(decodeURIComponent(match[1]));
  if (!roomCode) return problem(400, "Invalid room code");

  const isSocket = match[2] === "/socket";
  if (isSocket) return roomStub(env, roomCode).fetch(request);

  if (request.method === "GET") {
    const snapshot = await roomStub(env, roomCode).getSnapshot(roomCode, contentInfo(env));
    return json({ roomCode, joinUrl: joinUrl(env, roomCode), snapshot });
  }

  return problem(405, "Method not allowed");
}

export class MatchRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_events (
          seq INTEGER PRIMARY KEY,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") return problem(426, "Expected WebSocket upgrade");

    const url = new URL(request.url);
    const roomCode = this.roomCodeFromUrl(url);
    if (!roomCode) return problem(400, "Invalid room code");

    const clientId = stringField(url.searchParams.get("clientId"), crypto.randomUUID(), 64);
    const displayName = stringField(url.searchParams.get("name"), "Player");
    const requestedRole = roleField(url.searchParams.get("role"));
    const requestedTeamDefinition = teamDefinitionField(url.searchParams.get("deck"));
    if (requestedTeamDefinition.error) return problem(400, requestedTeamDefinition.error);
    const assigned = await this.assignSeat(
      roomCode,
      clientId,
      displayName,
      requestedRole,
      requestedTeamDefinition.definition,
    );

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const session: ClientSession = {
      clientId,
      role: assigned.role,
      displayName,
      joinedAt: new Date().toISOString(),
    };
    server.serializeAttachment(session);
    this.ctx.acceptWebSocket(server);

    this.send(server, "room.assigned", roomCode, {
      clientId,
      role: assigned.role,
      displayName,
      snapshot: assigned.snapshot,
      presence: this.presence(assigned.snapshot),
    });
    this.broadcast(roomCode, "room.presence", this.presence(assigned.snapshot), server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    const snapshot = this.readSnapshot();
    if (!snapshot) return;

    const cleanupMs = snapshot.cleanupAt ? Date.parse(snapshot.cleanupAt) : NaN;
    if (Number.isFinite(cleanupMs) && Date.now() >= cleanupMs) {
      if (this.connectionCount() === 0) {
        this.clearRoomStorage();
        await this.ctx.storage.deleteAlarm();
        return;
      }
      snapshot.cleanupAt = null;
      this.writeSnapshot(snapshot);
      await this.armNextAlarm(snapshot);
      return;
    }

    const deadlineMs = snapshot.turn.inputDeadlineAt ? Date.parse(snapshot.turn.inputDeadlineAt) : NaN;
    if (!Number.isFinite(deadlineMs)) {
      await this.armNextAlarm(snapshot);
      return;
    }

    if (Date.now() < deadlineMs) {
      await this.armNextAlarm(snapshot);
      return;
    }

    const hasPendingIntent = Boolean(snapshot.pendingIntents.b || snapshot.pendingIntents.r);
    if (!hasPendingIntent) {
      snapshot.turn.inputDeadlineAt = null;
      this.writeSnapshot(snapshot);
      await this.armNextAlarm(snapshot);
      return;
    }

    await this.resolvePendingTurn(snapshot, this.copyTurnInfo(snapshot.turn), "timeout");
  }

  async getSnapshot(roomCode: string, content: ContentInfo): Promise<MatchSnapshot> {
    const current = this.readSnapshot();
    if (current) {
      if (this.connectionCount() === 0 && !current.cleanupAt) {
        current.cleanupAt = this.cleanupDate(current).toISOString();
        this.writeSnapshot(current);
      }
      await this.armNextAlarm(current);
      return current;
    }

    const now = new Date().toISOString();
    const snapshot: MatchSnapshot = {
      schemaVersion: 1,
      roomCode,
      content,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      cleanupAt: new Date(Date.now() + ROOM_IDLE_CLEANUP_MS).toISOString(),
      players: {},
      teamDefinitions: {},
      spectatorCount: 0,
      turn: { half: "first", index: 1, inputDeadlineAt: null, additionalTurns: { first: null, second: null } },
      game: createInitialGameState("b", `match:${roomCode}`),
      pendingIntents: {},
      rematchRequests: {},
      eventSeq: 0,
    };
    this.writeSnapshot(snapshot);
    await this.armNextAlarm(snapshot);
    return snapshot;
  }

  private roomCodeFromUrl(url: URL): string | null {
    const match = url.pathname.match(/\/matches\/([^/]+)\/socket$/);
    if (!match) return normalizeRoomCode(url.searchParams.get("room") ?? "");
    return normalizeRoomCode(decodeURIComponent(match[1]));
  }

  private readSnapshot(): MatchSnapshot | null {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM room_state WHERE key = 'snapshot'")
      .toArray()[0];
    if (!row) return null;
    const snapshot = JSON.parse(row.value) as MatchSnapshot;
    snapshot.players ??= {};
    snapshot.teamDefinitions ??= {};
    snapshot.game = normalizeGameState(snapshot.game, "b", `match:${snapshot.roomCode}`, snapshot.teamDefinitions);
    snapshot.teamDefinitions = snapshot.game.teamDefinitions;
    snapshot.pendingIntents ??= {};
    snapshot.rematchRequests ??= {};
    snapshot.cleanupAt ??= null;
    snapshot.turn.additionalTurns ??= { first: null, second: null };
    snapshot.turn.additionalTurns.first ??= null;
    snapshot.turn.additionalTurns.second ??= null;
    return snapshot;
  }

  private writeSnapshot(snapshot: MatchSnapshot): void {
    snapshot.updatedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO room_state (key, value) VALUES ('snapshot', ?)",
      JSON.stringify(snapshot),
    );
  }

  private cleanupDate(snapshot: MatchSnapshot): Date {
    const delay = snapshot.status === "finished" ? FINISHED_ROOM_CLEANUP_MS : ROOM_IDLE_CLEANUP_MS;
    return new Date(Date.now() + delay);
  }

  private cleanupMs(snapshot: MatchSnapshot): number | null {
    if (!snapshot.cleanupAt) return null;
    const value = Date.parse(snapshot.cleanupAt);
    return Number.isFinite(value) ? value : null;
  }

  private inputDeadlineMs(snapshot: MatchSnapshot): number | null {
    if (!snapshot.turn.inputDeadlineAt) return null;
    const value = Date.parse(snapshot.turn.inputDeadlineAt);
    return Number.isFinite(value) ? value : null;
  }

  private async armNextAlarm(snapshot: MatchSnapshot): Promise<void> {
    const alarms = [this.inputDeadlineMs(snapshot), this.cleanupMs(snapshot)].filter(
      (value): value is number => value !== null,
    );
    if (alarms.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...alarms));
  }

  private clearRoomStorage(): void {
    this.ctx.storage.sql.exec("DELETE FROM room_events");
    this.ctx.storage.sql.exec("DELETE FROM room_state");
  }

  private connectionCount(except?: WebSocket): number {
    return this.ctx.getWebSockets().filter((socket) => socket !== except).length;
  }

  private async updateLifecycleCleanup(snapshot: MatchSnapshot, except?: WebSocket): Promise<void> {
    if (this.connectionCount(except) === 0) {
      snapshot.cleanupAt = this.cleanupDate(snapshot).toISOString();
      this.writeSnapshot(snapshot);
      await this.armNextAlarm(snapshot);
      return;
    }

    if (snapshot.cleanupAt) {
      snapshot.cleanupAt = null;
      this.writeSnapshot(snapshot);
    }
    await this.armNextAlarm(snapshot);
  }

  private appendEvent(snapshot: MatchSnapshot, type: string, payload: unknown): void {
    snapshot.eventSeq += 1;
    const createdAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO room_events (seq, type, payload, created_at) VALUES (?, ?, ?, ?)",
      snapshot.eventSeq,
      type,
      JSON.stringify(payload),
      createdAt,
    );
    this.writeSnapshot(snapshot);
  }

  private copyTurnInfo(turn: TurnInfo): TurnInfo {
    return {
      ...turn,
      additionalTurns: { ...turn.additionalTurns },
    };
  }

  private pushResolutionEvent(resolution: TurnResolution, event: Omit<TurnEvent, "seq">): void {
    resolution.events.push({
      seq: resolution.events.length + 1,
      ...event,
    });
  }

  private advanceMatchClock(snapshot: MatchSnapshot, resolution: TurnResolution): void {
    snapshot.turn.index += 1;
    snapshot.turn.inputDeadlineAt = null;

    if (snapshot.turn.half === "first") {
      if (snapshot.turn.additionalTurns.first === null && snapshot.turn.index > REGULAR_TURNS) {
        const additionalTurns = rollIntInclusive(snapshot.game, 0, 1);
        snapshot.turn.additionalTurns.first = additionalTurns;
        this.pushResolutionEvent(resolution, {
          type: "additional-time",
          details: { half: "first", turns: additionalTurns },
        });
        resolution.logs.push(`First-half additional time: ${additionalTurns}`);
      }

      const firstTotal = REGULAR_TURNS + (snapshot.turn.additionalTurns.first ?? 0);
      if (snapshot.turn.index > firstTotal) {
        const kickoffTeam = opponentTeam(snapshot.game.firstKickTeam);
        setupKickoffForTeam(snapshot.game, kickoffTeam);
        snapshot.turn.half = "second";
        snapshot.turn.index = 1;
        this.pushResolutionEvent(resolution, {
          type: "halftime",
          team: kickoffTeam,
          details: { kickoffTeam, additionalTurns: { ...snapshot.turn.additionalTurns } },
        });
        this.pushResolutionEvent(resolution, {
          type: "kickoff",
          team: kickoffTeam,
          details: { afterHalftime: true },
        });
        resolution.logs.push(`Halftime; second half kickoff by ${kickoffTeam}`);
      }
      return;
    }

    if (snapshot.turn.additionalTurns.second === null && snapshot.turn.index > REGULAR_TURNS) {
      const additionalTurns = rollIntInclusive(snapshot.game, 1, 3);
      snapshot.turn.additionalTurns.second = additionalTurns;
      this.pushResolutionEvent(resolution, {
        type: "additional-time",
        details: { half: "second", turns: additionalTurns },
      });
      resolution.logs.push(`Second-half additional time: ${additionalTurns}`);
    }

    const secondTotal = REGULAR_TURNS + (snapshot.turn.additionalTurns.second ?? 0);
    if (snapshot.turn.index > secondTotal) {
      snapshot.status = "finished";
      this.pushResolutionEvent(resolution, {
        type: "fulltime",
        details: {
          score: { ...snapshot.game.score },
          additionalTurns: { ...snapshot.turn.additionalTurns },
        },
      });
      resolution.logs.push("Full time");
    }
  }

  private updateRoomStatus(snapshot: MatchSnapshot): void {
    if (snapshot.status === "finished") return;
    const bothConnected = Boolean(snapshot.players.b?.connected && snapshot.players.r?.connected);
    snapshot.status = bothConnected ? "ready" : "waiting";
  }

  private isPregame(snapshot: MatchSnapshot): boolean {
    return (
      snapshot.status !== "playing" &&
      snapshot.status !== "finished" &&
      snapshot.turn.half === "first" &&
      snapshot.turn.index === 1 &&
      !snapshot.lastResolution &&
      !snapshot.pendingIntents.b &&
      !snapshot.pendingIntents.r
    );
  }

  private rebuildPregameGame(snapshot: MatchSnapshot): void {
    if (!this.isPregame(snapshot)) return;
    const seed = snapshot.game?.rng?.seed || `match:${snapshot.roomCode}`;
    snapshot.game = createInitialGameState("b", seed, snapshot.teamDefinitions);
    snapshot.teamDefinitions = snapshot.game.teamDefinitions;
  }

  private async assignSeat(
    roomCode: string,
    clientId: string,
    displayName: string,
    requestedRole: SeatRole | "auto",
    teamDefinition?: TeamPieceDefinition[],
  ): Promise<{ role: SeatRole; snapshot: MatchSnapshot }> {
    const snapshot = await this.getSnapshot(roomCode, contentInfo(this.env));
    const now = new Date().toISOString();
    const preferredRoles: SeatRole[] =
      requestedRole === "auto" ? ["b", "r", "spectator"] : [requestedRole, "spectator"];

    let assignedRole: SeatRole = "spectator";
    let seatEventType = "seat.assigned";
    for (const role of preferredRoles) {
      if (role === "spectator") {
        assignedRole = "spectator";
        break;
      }
      const occupied = snapshot.players[role];
      if (!occupied || occupied.clientId === clientId || !occupied.connected) {
        if (occupied?.clientId === clientId && !occupied.connected) {
          seatEventType = "seat.reconnected";
        } else if (occupied && occupied.clientId !== clientId) {
          seatEventType = "seat.reclaimed";
          delete snapshot.pendingIntents[role];
          delete snapshot.rematchRequests[role];
        }
        snapshot.players[role] = {
          clientId,
          displayName,
          teamCost: teamDefinition ? teamDefinitionCost(teamDefinition) : occupied?.teamCost,
          connected: true,
          joinedAt: occupied?.clientId === clientId ? occupied.joinedAt : now,
          lastSeenAt: now,
        };
        if (teamDefinition) {
          snapshot.teamDefinitions[role] = teamDefinition;
        } else if (!occupied || occupied.clientId !== clientId) {
          delete snapshot.teamDefinitions[role];
        }
        this.rebuildPregameGame(snapshot);
        assignedRole = role;
        break;
      }
    }

    if (assignedRole === "spectator") snapshot.spectatorCount = this.spectatorCount() + 1;
    snapshot.cleanupAt = null;
    this.updateRoomStatus(snapshot);
    this.appendEvent(snapshot, seatEventType, { clientId, displayName, role: assignedRole });
    await this.armNextAlarm(snapshot);
    return { role: assignedRole, snapshot };
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const packet = parseJsonObject(message);
    if (!packet) {
      this.sendError(ws, "Invalid JSON message");
      return;
    }

    const type = stringField(packet.type, "", 64);
    if (type === "ping") {
      const roomCode = this.readSnapshot()?.roomCode ?? "unknown";
      this.send(ws, "pong", roomCode, { t: Date.now() });
      return;
    }

    if (type === "client.hello") {
      this.handleHello(ws, packet);
      return;
    }

    if (type === "match.intent") {
      await this.handleIntent(ws, packet);
      return;
    }

    if (type === "match.leave") {
      await this.handleLeave(ws);
      return;
    }

    if (type === "match.resign") {
      await this.handleResign(ws);
      return;
    }

    if (type === "match.rematch.request") {
      await this.handleRematchRequest(ws);
      return;
    }

    this.sendError(ws, `Unsupported message type: ${type}`);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    if (!session) return;
    const snapshot = this.readSnapshot();
    if (!snapshot) return;

    let shouldBroadcastPresence = false;
    if (session.role === "b" || session.role === "r") {
      const seat = snapshot.players[session.role];
      if (seat?.clientId === session.clientId && seat.connected && this.connectionsFor(session.clientId).length <= 1) {
        seat.connected = false;
        seat.lastSeenAt = new Date().toISOString();
        this.updateRoomStatus(snapshot);
        this.appendEvent(snapshot, "seat.disconnected", {
          clientId: session.clientId,
          role: session.role,
        });
        shouldBroadcastPresence = true;
      }
    } else if (session.role === "spectator") {
      snapshot.spectatorCount = this.spectatorCount(ws);
      this.writeSnapshot(snapshot);
      shouldBroadcastPresence = true;
    }

    await this.updateLifecycleCleanup(snapshot, ws);
    if (shouldBroadcastPresence) {
      this.broadcast(snapshot.roomCode, "room.presence", this.presence(snapshot, ws), ws);
    }
  }

  private handleHello(ws: WebSocket, packet: Record<string, unknown>): void {
    const session = this.session(ws);
    const snapshot = this.readSnapshot();
    if (!session || !snapshot) return;

    const displayName = stringField(packet.displayName, session.displayName);
    const role = session.role;
    if (role === "b" || role === "r") {
      const seat = snapshot.players[role];
      if (seat?.clientId === session.clientId) {
        seat.displayName = displayName;
        seat.connected = true;
        seat.lastSeenAt = new Date().toISOString();
      }
    }

    ws.serializeAttachment({ ...session, displayName });
    this.updateRoomStatus(snapshot);
    this.appendEvent(snapshot, "client.hello", { clientId: session.clientId, role, displayName });
    this.send(ws, "room.snapshot", snapshot.roomCode, snapshot);
    this.broadcast(snapshot.roomCode, "room.presence", this.presence(snapshot));
  }

  private async handleLeave(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    const snapshot = this.readSnapshot();
    if (!session || !snapshot) return;

    if (session.role === "b" || session.role === "r") {
      const seat = snapshot.players[session.role];
      if (seat?.clientId === session.clientId) {
        delete snapshot.players[session.role];
        delete snapshot.teamDefinitions[session.role];
        delete snapshot.rematchRequests[session.role];
        snapshot.pendingIntents = {};
        snapshot.turn.inputDeadlineAt = null;
        await this.ctx.storage.deleteAlarm();
        this.rebuildPregameGame(snapshot);
        this.updateRoomStatus(snapshot);
      }
    }

    snapshot.spectatorCount = Math.max(0, this.spectatorCount() - (session.role === "spectator" ? 1 : 0));
    this.appendEvent(snapshot, "seat.left", {
      clientId: session.clientId,
      role: session.role,
    });
    const payload = {
      clientId: session.clientId,
      role: session.role,
      snapshot,
      presence: this.presence(snapshot, ws),
    };
    this.send(ws, "seat.left", snapshot.roomCode, payload);
    this.broadcast(snapshot.roomCode, "seat.left", payload, ws);
    await this.updateLifecycleCleanup(snapshot, ws);
    ws.close(1000, "left");
  }

  private async handleResign(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    const snapshot = this.readSnapshot();
    if (!session || !snapshot) return;

    if (session.role !== "b" && session.role !== "r") {
      this.sendError(ws, "Only seated players can resign");
      return;
    }
    if (snapshot.status === "finished") {
      this.sendError(ws, "This match has already finished");
      return;
    }

    const team = session.role;
    const winner = opponentTeam(team);
    snapshot.pendingIntents = {};
    snapshot.rematchRequests = {};
    snapshot.turn.inputDeadlineAt = null;
    snapshot.status = "finished";
    await this.ctx.storage.deleteAlarm();
    this.appendEvent(snapshot, "match.resigned", {
      team,
      winner,
      clientId: session.clientId,
      score: { ...snapshot.game.score },
    });
    this.broadcast(snapshot.roomCode, "match.resigned", {
      team,
      winner,
      snapshot,
    });
  }

  private async handleRematchRequest(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    const snapshot = this.readSnapshot();
    if (!session || !snapshot) return;

    if (session.role !== "b" && session.role !== "r") {
      this.sendError(ws, "Only seated players can request a rematch");
      return;
    }
    if (snapshot.status !== "finished") {
      this.sendError(ws, "Rematch is available after the match finishes");
      return;
    }

    const team = session.role;
    snapshot.rematchRequests[team] = new Date().toISOString();
    const bothRequested = Boolean(snapshot.rematchRequests.b && snapshot.rematchRequests.r);

    if (!bothRequested) {
      this.appendEvent(snapshot, "match.rematch.requested", {
        team,
        clientId: session.clientId,
      });
      this.broadcast(snapshot.roomCode, "match.rematch.requested", {
        team,
        snapshot,
      });
      return;
    }

    const startedAt = new Date().toISOString();
    const nextSeed = `match:${snapshot.roomCode}:rematch:${snapshot.eventSeq + 1}`;
    snapshot.status = snapshot.players.b?.connected && snapshot.players.r?.connected ? "ready" : "waiting";
    snapshot.turn = {
      half: "first",
      index: 1,
      inputDeadlineAt: null,
      additionalTurns: { first: null, second: null },
    };
    snapshot.game = createInitialGameState("b", nextSeed, snapshot.teamDefinitions);
    snapshot.teamDefinitions = snapshot.game.teamDefinitions;
    snapshot.pendingIntents = {};
    snapshot.rematchRequests = {};
    delete snapshot.lastResolution;
    await this.ctx.storage.deleteAlarm();
    this.appendEvent(snapshot, "match.rematch.started", {
      requestedBy: team,
      startedAt,
    });
    this.broadcast(snapshot.roomCode, "match.rematch.started", {
      requestedBy: team,
      snapshot,
    });
  }

  private async handleIntent(ws: WebSocket, packet: Record<string, unknown>): Promise<void> {
    const session = this.session(ws);
    const snapshot = this.readSnapshot();
    if (!session || !snapshot) return;

    if (snapshot.status === "finished") {
      this.sendError(ws, "This match has already finished");
      return;
    }

    const team = teamField(packet.team) ?? (session.role === "b" || session.role === "r" ? session.role : null);
    if (!team || session.role !== team) {
      this.sendError(ws, "Only seated players can submit intents for their team");
      return;
    }

    const validation = validateCommandsForTeam(snapshot.game, team, packet.commands);
    if (!validation.ok) {
      this.sendError(ws, validation.errors.join("; "));
      return;
    }
    const intent: PendingIntent = {
      team,
      clientId: session.clientId,
      commands: validation.commands,
      submittedAt: new Date().toISOString(),
    };
    snapshot.pendingIntents[team] = intent;
    const bothReady = Boolean(snapshot.pendingIntents.b && snapshot.pendingIntents.r);

    if (bothReady) {
      await this.resolvePendingTurn(snapshot, this.copyTurnInfo(snapshot.turn), "both-ready");
      return;
    }

    if (!snapshot.turn.inputDeadlineAt) {
      const deadlineMs = Date.now() + TURN_INPUT_TIMEOUT_MS;
      snapshot.turn.inputDeadlineAt = new Date(deadlineMs).toISOString();
      await this.ctx.storage.setAlarm(deadlineMs);
    }
    this.updateRoomStatus(snapshot);
    this.appendEvent(snapshot, "match.intent", {
      team,
      clientId: session.clientId,
      commandCount: validation.commands.length,
      inputDeadlineAt: snapshot.turn.inputDeadlineAt,
    });
    this.broadcast(snapshot.roomCode, "match.intent.received", {
      team,
      commandCount: validation.commands.length,
      bothReady,
      inputDeadlineAt: snapshot.turn.inputDeadlineAt,
      snapshot,
    });
  }

  private async resolvePendingTurn(
    snapshot: MatchSnapshot,
    resolvedTurn: TurnInfo,
    reason: "both-ready" | "timeout",
  ): Promise<TurnResolution> {
    snapshot.status = "playing";
    const resolution = this.resolveTurn(snapshot);
    snapshot.pendingIntents = {};
    this.advanceMatchClock(snapshot, resolution);
    snapshot.lastResolution = {
      turn: resolvedTurn,
      resolvedAt: new Date().toISOString(),
      events: resolution.events,
      logs: resolution.logs,
    };
    await this.ctx.storage.deleteAlarm();
    this.updateRoomStatus(snapshot);
    this.appendEvent(snapshot, "match.turn.resolved", {
      turn: resolvedTurn,
      eventCount: resolution.events.length,
      score: resolution.game.score,
      reason,
    });
    this.broadcast(snapshot.roomCode, "match.turn.resolved", {
      turn: resolvedTurn,
      resolution,
      snapshot,
      reason,
    });
    return resolution;
  }

  private resolveTurn(snapshot: MatchSnapshot): TurnResolution {
    const resolution = resolveServerTurn(snapshot.game, {
      b: snapshot.pendingIntents.b?.commands ?? [],
      r: snapshot.pendingIntents.r?.commands ?? [],
    });
    snapshot.game = resolution.game;
    return resolution;
  }

  private session(ws: WebSocket): ClientSession | null {
    const attachment = ws.deserializeAttachment();
    if (!attachment || typeof attachment !== "object") return null;
    const value = attachment as Partial<ClientSession>;
    if (!value.clientId || !value.role || !value.displayName || !value.joinedAt) return null;
    return {
      clientId: value.clientId,
      role: value.role,
      displayName: value.displayName,
      joinedAt: value.joinedAt,
    };
  }

  private connectionsFor(clientId: string): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((socket) => this.session(socket)?.clientId === clientId);
  }

  private spectatorCount(except?: WebSocket): number {
    return this.ctx
      .getWebSockets()
      .filter((socket) => socket !== except && this.session(socket)?.role === "spectator").length;
  }

  private presence(snapshot = this.readSnapshot(), except?: WebSocket): PresenceInfo {
    const players: PresenceInfo["players"] = {};
    if (snapshot?.players.b) {
      players.b = {
        displayName: snapshot.players.b.displayName,
        teamCost: snapshot.players.b.teamCost,
        connected: snapshot.players.b.connected,
        lastSeenAt: snapshot.players.b.lastSeenAt,
      };
    }
    if (snapshot?.players.r) {
      players.r = {
        displayName: snapshot.players.r.displayName,
        teamCost: snapshot.players.r.teamCost,
        connected: snapshot.players.r.connected,
        lastSeenAt: snapshot.players.r.lastSeenAt,
      };
    }
    return {
      connections: this.connectionCount(except),
      spectators: this.spectatorCount(except),
      status: snapshot?.status ?? "waiting",
      inputDeadlineAt: snapshot?.turn.inputDeadlineAt ?? null,
      pendingTeams: (["b", "r"] as Team[]).filter((team) => Boolean(snapshot?.pendingIntents[team])),
      players,
    };
  }

  private send(ws: WebSocket, type: string, roomCode: string, payload: unknown): void {
    const snapshot = this.readSnapshot();
    const envelope: ServerEnvelope = {
      type,
      roomCode,
      seq: snapshot?.eventSeq ?? 0,
      payload,
    };
    ws.send(JSON.stringify(envelope));
  }

  private sendError(ws: WebSocket, message: string): void {
    const roomCode = this.readSnapshot()?.roomCode ?? "unknown";
    this.send(ws, "room.error", roomCode, { message });
  }

  private broadcast(roomCode: string, type: string, payload: unknown, except?: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      this.send(socket, type, roomCode, payload);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      // universofutbol.com 配下の正式パス（PUBLIC_BASE_PATH）ではゲームHTMLを配信する。
      // workers.dev では静的アセット（/ → index.html）がWorker より先に配信されるため、ここには来ない。
      const basePath = env.PUBLIC_BASE_PATH;
      if (url.pathname === basePath || url.pathname === `${basePath}/`) {
        const assetUrl = new URL(url);
        assetUrl.pathname = "/";
        return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      }

      if (url.pathname === "/") {
        return json({
          name: "UniversoFutbol Football Chess",
          api: API_PREFIX,
          content: contentInfo(env),
        });
      }

      if (url.pathname.startsWith(API_PREFIX)) {
        return handleApi(request, env);
      }

      return problem(404, "Not found");
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Request failed",
          error: error instanceof Error ? error.message : String(error),
          path: url.pathname,
        }),
      );
      return problem(500, "Internal Server Error");
    }
  },
};
