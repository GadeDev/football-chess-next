export type Team = "b" | "r";
export type PositionType = "fw" | "mf" | "df" | "gk";
export type BoardCellType =
  | "normal"
  | "pa"
  | "va"
  | "selfga"
  | "oppga"
  | "selfgoal"
  | "oppgoal"
  | "cross";

export interface BoardCell {
  x: number;
  y: number;
  t: BoardCellType;
  label?: string;
}

export interface Piece {
  id: number;
  team: Team;
  posType: PositionType;
  x: number;
  y: number;
  cost: number;
  sx: number;
  sy: number;
  moved: boolean;
}

export interface TeamPieceDefinition {
  id: number;
  x: number;
  y: number;
}

export type TeamDefinitions = Partial<Record<Team, TeamPieceDefinition[]>>;

export type BallState =
  | { target: "piece"; pieceId: number; x: null; y: null; lastTeam: Team | null }
  | { target: "cell"; pieceId: null; x: number; y: number; lastTeam: Team | null };

export interface FootballChessGameState {
  schemaVersion: 1;
  pieces: Piece[];
  teamDefinitions: Record<Team, TeamPieceDefinition[]>;
  ball: BallState;
  score: Record<Team, number>;
  rng: {
    seed: string;
    state: number;
  };
  firstKickTeam: Team;
  turnBallMoved: boolean;
  turnStopped: boolean;
  battleDelayCounts: Record<Team, number>;
  passivePenaltyTeams: Team[];
}

export type GameCommand =
  | { type: "move"; pieceId: number; tx: number; ty: number; team: Team }
  | { type: "dribble"; pieceId: number; tx: number; ty: number; team: Team }
  | { type: "pass"; pieceId: number; targetId: number; tx: number; ty: number; team: Team }
  | { type: "throughpass"; pieceId: number; tx: number; ty: number; team: Team }
  | { type: "shoot"; pieceId: number; tx: number; ty: number; team: Team };

export interface CommandValidationResult {
  ok: boolean;
  commands: GameCommand[];
  errors: string[];
}

export type TurnEventType =
  | "command.skipped"
  | "piece.moved"
  | "ball.moved"
  | "pass.cut"
  | "pass.completed"
  | "pass.failed"
  | "offside"
  | "looseball.picked"
  | "tackle.foul"
  | "tackle.success"
  | "tackle.failed"
  | "shot.blocked"
  | "shot.goal"
  | "shot.miss"
  | "shot.saved"
  | "kickoff"
  | "additional-time"
  | "halftime"
  | "fulltime"
  | "battle-delay"
  | "passive-tactics"
  | "turn.completed";

export interface TurnEvent {
  seq: number;
  type: TurnEventType;
  team?: Team;
  pieceId?: number;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  details?: Record<string, unknown>;
}

export interface TurnResolution {
  game: FootballChessGameState;
  events: TurnEvent[];
  logs: string[];
}

export interface SeededRng {
  seed: string;
  state: number;
  next: () => number;
  rollPercent: (percent: number) => boolean;
}

const COSTS = [1, 1.5, 2, 2.5, 3] as const;

export const COLS = [-2, -1, 0, 1, 2] as const;
export const ROWS = [-3, -2, -1, 0, 1, 2, 3, 4] as const;
export const MAX_PER_CELL = 3;
export const TEAM_MEMBER_COUNT = 11;
export const MAX_TEAM_COST = 16;
export const REGULAR_TURNS = 15;
export const MAX_CK_NUM = 3;
export const BATTLE_DELAY_COUNT = 3;

export const BOARD: BoardCell[] = [
  { x: 0, y: -3, t: "oppgoal", label: "敵G" },
  { x: -2, y: -2, t: "cross" },
  { x: -1, y: -2, t: "pa", label: "PA" },
  { x: 0, y: -2, t: "oppga", label: "GA" },
  { x: 1, y: -2, t: "pa", label: "PA" },
  { x: 2, y: -2, t: "cross" },
  { x: -2, y: -1, t: "cross" },
  { x: -1, y: -1, t: "va", label: "VA" },
  { x: 0, y: -1, t: "va", label: "VA" },
  { x: 1, y: -1, t: "va", label: "VA" },
  { x: 2, y: -1, t: "cross" },
  { x: -2, y: 0, t: "normal" },
  { x: -1, y: 0, t: "normal" },
  { x: 0, y: 0, t: "normal" },
  { x: 1, y: 0, t: "normal" },
  { x: 2, y: 0, t: "normal" },
  { x: -2, y: 1, t: "normal" },
  { x: -1, y: 1, t: "normal" },
  { x: 0, y: 1, t: "normal" },
  { x: 1, y: 1, t: "normal" },
  { x: 2, y: 1, t: "normal" },
  { x: -2, y: 2, t: "cross" },
  { x: -1, y: 2, t: "va", label: "VA" },
  { x: 0, y: 2, t: "va", label: "VA" },
  { x: 1, y: 2, t: "va", label: "VA" },
  { x: 2, y: 2, t: "cross" },
  { x: -2, y: 3, t: "cross" },
  { x: -1, y: 3, t: "pa", label: "PA" },
  { x: 0, y: 3, t: "selfga", label: "GA" },
  { x: 1, y: 3, t: "pa", label: "PA" },
  { x: 2, y: 3, t: "cross" },
  { x: 0, y: 4, t: "selfgoal", label: "自G" },
];

export const DEFAULT_TEAM = [
  { id: 5, x: -1, y: 0 },
  { id: 1, x: 1, y: 0 },
  { id: 6, x: -2, y: -1 },
  { id: 8, x: -1, y: -1 },
  { id: 6, x: 1, y: -1 },
  { id: 10, x: 2, y: -1 },
  { id: 12, x: -2, y: -2 },
  { id: 13, x: -1, y: -2 },
  { id: 18, x: 0, y: -2 },
  { id: 11, x: 1, y: -2 },
  { id: 11, x: 2, y: -2 },
] as const;

export const KICKOFF_CELLS: Record<Team, Array<{ x: number; y: number }>> = {
  b: [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ],
  r: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ],
};

export const BALL_LIMIT = [
  [0, 1],
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 2],
  [0, -2],
  [-2, 0],
  [2, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [2, 2],
  [2, -2],
  [-2, 2],
  [-2, -2],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
] as const;

const T_LANDING_PASS = [
  [30, 35, 40, 40, 45],
  [25, 25, 40, 40, 45],
  [15, 15, 20, 25, 25],
  [10, 10, 15, 15, 25],
  [5, 5, 5, 5, 5],
];
const T_FLYING_PASS = [
  [35, 35, 35, 35, 35],
  [25, 25, 25, 25, 25],
  [20, 20, 20, 20, 20],
  [10, 10, 10, 10, 10],
  [5, 5, 5, 5, 5],
];
const T_TACKLE = [
  [50, 55, 60, 60, 75],
  [45, 50, 60, 60, 75],
  [30, 30, 40, 45, 50],
  [30, 30, 35, 40, 50],
  [5, 5, 15, 15, 25],
];
const T_PA_SHOOT = [
  [40, 45, 60, 60, 80],
  [35, 40, 60, 60, 80],
  [30, 30, 45, 50, 60],
  [30, 30, 40, 45, 60],
  [20, 20, 30, 30, 40],
];
const T_VA_SHOOT = [
  [25, 30, 40, 40, 45],
  [20, 25, 40, 40, 45],
  [15, 15, 30, 35, 30],
  [15, 15, 25, 30, 30],
  [10, 10, 10, 10, 15],
];
const T_PK = [
  [75, 80, 85, 85, 90],
  [70, 75, 85, 85, 90],
  [65, 65, 75, 80, 85],
  [65, 65, 70, 75, 85],
  [55, 55, 65, 65, 75],
];
const T_FK = [
  [65, 70, 75, 75, 85],
  [60, 65, 75, 75, 85],
  [55, 55, 60, 65, 70],
  [55, 55, 55, 60, 70],
  [45, 50, 50, 50, 55],
];
const T_CK = [
  [55, 60, 65, 65, 75],
  [50, 55, 65, 65, 75],
  [45, 50, 50, 55, 60],
  [45, 50, 45, 50, 60],
  [35, 35, 40, 40, 45],
];
const T_FAILED: Record<string, number[]> = {
  PenaltyAreaShoot: [60, 50, 30, 25, 15],
  VitalAreaShoot: [30, 25, 20, 15, 5],
  PK: [10, 10, 10, 10, 10],
  FK: [60, 65, 75, 60, 85],
  CK: [50, 55, 65, 70, 75],
};
const T_OFFSIDE = [
  [100, 100, 100],
  [100, 50, 0],
  [100, 50, 0],
];
const T_FOUL: Record<number, number> = { 1: 10, 2: 20, 3: 30 };
const PASSIVE_TACTICS_DEBUFF = { PassCut: -20, Tackle: -20 };
const BUFF = {
  PenaltyAreaShoot: { OwnFW: 10, OwnBuff: 10, EnemyDebuff: -20 },
  VitalAreaShoot: { OwnFW: 5, EnemyDebuff: -25 },
  FryingPass: { OwnMF: 10, EnemyDebuff: -40 },
  LandingPass: { OwnBuff: 10, OwnMF: 0, EnemyDebuff: -20 },
  Tackle: { OwnMF: 10, EnemyDF: -15, OwnBuff: 10, EnemyDebuff: -20 },
};

export function positionFromMasterId(id: number): PositionType {
  if (id <= 5) return "fw";
  if (id <= 10) return "mf";
  if (id <= 15) return "df";
  return "gk";
}

export function costOfMasterId(id: number): number {
  return COSTS[(id - 1) % COSTS.length];
}

export function costToIndex(cost: number): number {
  return Math.round(cost / 0.5 - 2);
}

export function clampProb(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function pieceCost(piece: Pick<Piece, "cost">): number {
  return piece.cost || 1;
}

function cloneTeamDefinition(definition: readonly TeamPieceDefinition[]): TeamPieceDefinition[] {
  return definition.map((piece) => ({ id: piece.id, x: piece.x, y: piece.y }));
}

export function defaultTeamDefinition(): TeamPieceDefinition[] {
  return cloneTeamDefinition(DEFAULT_TEAM);
}

export function teamDefinitionCost(definition: readonly TeamPieceDefinition[]): number {
  return definition.reduce((total, piece) => total + costOfMasterId(piece.id), 0);
}

function sameTeamDefinition(a: readonly TeamPieceDefinition[], b: readonly TeamPieceDefinition[]): boolean {
  return (
    a.length === b.length &&
    a.every((piece, index) => {
      const other = b[index];
      return piece.id === other.id && piece.x === other.x && piece.y === other.y;
    })
  );
}

export function validateTeamDefinition(value: unknown): {
  ok: boolean;
  definition: TeamPieceDefinition[];
  teamCost: number;
  errors: string[];
} {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    return { ok: false, definition: [], teamCost: 0, errors: ["Team definition must be an array"] };
  }

  const definition: TeamPieceDefinition[] = [];
  const cellCounts = new Map<string, number>();
  let gkCount = 0;

  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`Piece ${index + 1} must be an object`);
      return;
    }
    const item = raw as Record<string, unknown>;
    const id = item.id;
    const x = item.x;
    const y = item.y;
    const validId = typeof id === "number" && Number.isInteger(id) && id >= 1 && id <= 20;
    const validX = typeof x === "number" && Number.isInteger(x) && (COLS as readonly number[]).includes(x);
    const validY = typeof y === "number" && Number.isInteger(y) && [-2, -1, 0].includes(y);
    if (!validId) errors.push(`Piece ${index + 1} has invalid id`);
    if (!validX) {
      errors.push(`Piece ${index + 1} has invalid x`);
    }
    if (!validY) {
      errors.push(`Piece ${index + 1} has invalid y`);
    }
    if (!validId || !validX || !validY) return;

    const piece = { id, x, y };
    definition.push(piece);
    if (positionFromMasterId(id) === "gk") gkCount += 1;
    const key = `${x},${y}`;
    const nextCount = (cellCounts.get(key) ?? 0) + 1;
    cellCounts.set(key, nextCount);
    if (nextCount > MAX_PER_CELL) errors.push(`Cell ${key} has too many pieces`);
  });

  if (definition.length !== TEAM_MEMBER_COUNT) {
    errors.push(`Team must have ${TEAM_MEMBER_COUNT} pieces`);
  }
  if (gkCount !== 1) errors.push("Team must have exactly one GK");

  const teamCost = teamDefinitionCost(definition);
  const isLegacyDefault = sameTeamDefinition(definition, DEFAULT_TEAM);
  if (teamCost > MAX_TEAM_COST && !isLegacyDefault) {
    errors.push(`Team cost must be ${MAX_TEAM_COST} or less`);
  }

  return { ok: errors.length === 0, definition, teamCost, errors };
}

export function normalizeTeamDefinitions(definitions?: TeamDefinitions): Record<Team, TeamPieceDefinition[]> {
  const normalized: Record<Team, TeamPieceDefinition[]> = {
    b: defaultTeamDefinition(),
    r: defaultTeamDefinition(),
  };
  for (const team of ["b", "r"] as Team[]) {
    const validation = validateTeamDefinition(definitions?.[team]);
    if (validation.ok) normalized[team] = validation.definition;
  }
  return normalized;
}

export function cellAt(x: number, y: number): BoardCell | undefined {
  return BOARD.find((cell) => cell.x === x && cell.y === y);
}

export function piecesAt(state: FootballChessGameState, x: number, y: number): Piece[] {
  return state.pieces.filter((piece) => piece.x === x && piece.y === y);
}

export function pieceById(state: FootballChessGameState, id: number): Piece | undefined {
  return state.pieces.find((piece) => piece.id === id);
}

export function ballHolder(state: FootballChessGameState): Piece | undefined {
  return state.ball.target === "piece" ? pieceById(state, state.ball.pieceId) : undefined;
}

export function opponentTeam(team: Team): Team {
  return team === "b" ? "r" : "b";
}

export function goalCellFor(team: Team): { x: number; y: number } {
  return team === "b" ? { x: 0, y: -3 } : { x: 0, y: 4 };
}

export function makeDefaultPiece(
  masterPiece: TeamPieceDefinition,
  team: Team,
  nextId: number,
): Piece {
  if (team === "b") {
    const y = -masterPiece.y + 1;
    return {
      id: nextId,
      team,
      posType: positionFromMasterId(masterPiece.id),
      x: masterPiece.x,
      y,
      cost: costOfMasterId(masterPiece.id),
      sx: masterPiece.x,
      sy: y,
      moved: false,
    };
  }
  return {
    id: nextId,
    team,
    posType: positionFromMasterId(masterPiece.id),
    x: -masterPiece.x,
    y: masterPiece.y,
    cost: costOfMasterId(masterPiece.id),
    sx: -masterPiece.x,
    sy: masterPiece.y,
    moved: false,
  };
}

export function createDefaultPieces(teamDefinitions?: TeamDefinitions): Piece[] {
  const definitions = normalizeTeamDefinitions(teamDefinitions);
  const pieces: Piece[] = [];
  let pieceSeq = 0;
  for (const piece of definitions.b) pieces.push(makeDefaultPiece(piece, "b", ++pieceSeq));
  for (const piece of definitions.r) pieces.push(makeDefaultPiece(piece, "r", ++pieceSeq));
  return pieces;
}

export function kickoffPieceForTeam(pieces: Piece[], team: Team): Piece {
  for (const cell of KICKOFF_CELLS[team]) {
    const piece = pieces.find((candidate) => candidate.team === team && candidate.x === cell.x && candidate.y === cell.y);
    if (piece) return piece;
  }
  const fallback = pieces.find((piece) => piece.team === team && piece.posType === "fw") ?? pieces.find((piece) => piece.team === team);
  if (!fallback) throw new Error(`No kickoff piece for team ${team}`);
  return fallback;
}

export function createInitialGameState(
  kickoffTeam: Team = "b",
  seed = `football-chess:${kickoffTeam}`,
  teamDefinitions?: TeamDefinitions,
): FootballChessGameState {
  const normalizedTeamDefinitions = normalizeTeamDefinitions(teamDefinitions);
  const pieces = createDefaultPieces(normalizedTeamDefinitions);
  const kickoffPiece = kickoffPieceForTeam(pieces, kickoffTeam);
  const rng = createSeededRng(seed);
  return {
    schemaVersion: 1,
    pieces,
    teamDefinitions: normalizedTeamDefinitions,
    ball: { target: "piece", pieceId: kickoffPiece.id, x: null, y: null, lastTeam: kickoffTeam },
    score: { b: 0, r: 0 },
    rng: { seed, state: rng.state },
    firstKickTeam: kickoffTeam,
    turnBallMoved: false,
    turnStopped: false,
    battleDelayCounts: { b: 0, r: 0 },
    passivePenaltyTeams: [],
  };
}

export function normalizeGameState(
  state: Partial<FootballChessGameState> | null | undefined,
  kickoffTeam: Team = "b",
  seed = `football-chess:${kickoffTeam}`,
  teamDefinitions?: TeamDefinitions,
): FootballChessGameState {
  if (!state) return createInitialGameState(kickoffTeam, seed, teamDefinitions);
  const game = state as FootballChessGameState;
  game.schemaVersion = 1;
  game.teamDefinitions = normalizeTeamDefinitions(game.teamDefinitions ?? teamDefinitions);
  game.pieces ??= createDefaultPieces(game.teamDefinitions);
  game.score ??= { b: 0, r: 0 };
  game.rng ??= { seed, state: createSeededRng(seed).state };
  game.firstKickTeam ??= kickoffTeam;
  game.turnBallMoved ??= false;
  game.turnStopped ??= false;
  game.battleDelayCounts ??= { b: 0, r: 0 };
  game.passivePenaltyTeams ??= [];
  if (!game.ball) {
    const kickoffPiece = kickoffPieceForTeam(game.pieces, kickoffTeam);
    game.ball = { target: "piece", pieceId: kickoffPiece.id, x: null, y: null, lastTeam: kickoffTeam };
  }
  return game;
}

export function getRoute(sx: number, sy: number, ex: number, ey: number): Array<[number, number]> {
  const route: Array<[number, number]> = [];
  let vd = ey - sy;
  let hd = ex - sx;
  let cx = sx;
  let cy = sy;
  let i = 0;
  while (i < 10 && !(cx === ex && cy === ey)) {
    i += 1;
    let tx = cx;
    let ty = cy;
    if (vd >= 1) {
      ty += 1;
      vd -= 1;
    } else if (vd <= -1) {
      ty -= 1;
      vd += 1;
    }
    if ((tx !== cx || ty !== cy) && cellAt(tx, ty)) {
      if (tx === ex && ty === ey) break;
      cx = tx;
      cy = ty;
      route.push([cx, cy]);
    }
    tx = cx;
    ty = cy;
    if (hd >= 1) {
      tx += 1;
      hd -= 1;
    } else if (hd <= -1) {
      tx -= 1;
      hd += 1;
    }
    if ((tx !== cx || ty !== cy) && cellAt(tx, ty)) {
      if (tx === ex && ty === ey) break;
      cx = tx;
      cy = ty;
      route.push([cx, cy]);
    }
    if (vd === 0 && hd === 0) break;
  }
  return route;
}

function passivePenaltyApplies(state: FootballChessGameState, team: Team): boolean {
  return state.passivePenaltyTeams.includes(team);
}

export function calcLandingPass(
  state: FootballChessGameState,
  passPiece: Piece,
  receivePiece: Piece,
  targetX: number,
  targetY: number,
): number {
  const enemies = piecesAt(state, targetX, targetY).filter((piece) => piece.team !== passPiece.team);
  if (enemies.length === 0) return 100;
  const cell = cellAt(targetX, targetY);
  if (enemies.some((piece) => piece.posType === "gk") && (cell?.t === "oppga" || cell?.t === "selfga")) return 0;
  const hardest = highestCostPiece(enemies);
  if (!hardest) return 100;
  const base = T_LANDING_PASS[costToIndex(pieceCost(hardest))][costToIndex(pieceCost(receivePiece))];
  let buff = 0;
  if (enemies.length > 1) buff += BUFF.LandingPass.EnemyDebuff;
  const mates = piecesAt(state, targetX, targetY).filter((piece) => piece.team === passPiece.team && piece.id !== receivePiece.id);
  buff += mates.length * BUFF.LandingPass.OwnBuff;
  if (passPiece.posType === "mf") buff += BUFF.LandingPass.OwnMF;
  return clampProb(base + buff);
}

export function calcFlyingPass(state: FootballChessGameState, passPiece: Piece, targetX: number, targetY: number): number {
  const enemies = piecesAt(state, targetX, targetY).filter((piece) => piece.team !== passPiece.team);
  if (enemies.length === 0) return 100;
  const hardest = highestCostPiece(enemies);
  if (!hardest) return 100;
  const base = T_FLYING_PASS[costToIndex(pieceCost(hardest))][costToIndex(pieceCost(passPiece))];
  let buff = 0;
  if (enemies.length > 1) buff += BUFF.FryingPass.EnemyDebuff;
  if (passPiece.posType === "mf") buff += BUFF.FryingPass.OwnMF;
  if (passivePenaltyApplies(state, passPiece.team)) buff += PASSIVE_TACTICS_DEBUFF.PassCut;
  return clampProb(base + buff);
}

export function calcRoutePassProbability(
  state: FootballChessGameState,
  passPiece: Piece,
  targetX: number,
  targetY: number,
): number {
  return getRoute(passPiece.x, passPiece.y, targetX, targetY).reduce(
    (probability, [x, y]) => (probability * calcFlyingPass(state, passPiece, x, y)) / 100,
    100,
  );
}

export function calcPassDisplayProbability(
  state: FootballChessGameState,
  passPiece: Piece,
  targetX: number,
  targetY: number,
): number | null {
  const receivers = piecesAt(state, targetX, targetY).filter((piece) => piece.team === passPiece.team);
  if (receivers.length === 0) return null;
  const routeProb = calcRoutePassProbability(state, passPiece, targetX, targetY);
  const landingProb = calcLandingPass(state, passPiece, receivers[0], targetX, targetY);
  return clampProb((routeProb * landingProb) / 100);
}

export function calcTackleSuccess(state: FootballChessGameState, hasBallPiece: Piece, tacklePiece: Piece): number {
  const base = T_TACKLE[costToIndex(pieceCost(hasBallPiece))][costToIndex(pieceCost(tacklePiece))];
  let buff = 0;
  if (hasBallPiece.posType === "mf") buff += BUFF.Tackle.OwnMF;
  if (tacklePiece.posType === "df") buff += BUFF.Tackle.EnemyDF;
  const cellEnemies = piecesAt(state, hasBallPiece.x, hasBallPiece.y).filter((piece) => piece.team !== hasBallPiece.team);
  if (cellEnemies.length > 1) buff += BUFF.Tackle.EnemyDebuff;
  const cellMates = piecesAt(state, hasBallPiece.x, hasBallPiece.y).filter(
    (piece) => piece.team === hasBallPiece.team && piece.id !== hasBallPiece.id,
  );
  buff += cellMates.length * BUFF.Tackle.OwnBuff;
  if (passivePenaltyApplies(state, tacklePiece.team)) buff += PASSIVE_TACTICS_DEBUFF.Tackle;
  return clampProb(100 - clampProb(base + buff));
}

export function attackDir(team: Team): -1 | 1 {
  return team === "b" ? -1 : 1;
}

export function relLine(offsideLine: number, y: number, dir: -1 | 1): 0 | 1 | 2 {
  const delta = dir < 0 ? offsideLine - y : y - offsideLine;
  if (delta === 0) return 1;
  return delta > 0 ? 0 : 2;
}

export function calcOffside(offsideLine: number, beforeY: number, afterY: number, dir: -1 | 1): number {
  return clampProb(T_OFFSIDE[relLine(offsideLine, beforeY, dir)][relLine(offsideLine, afterY, dir)]);
}

export function offsideLineFor(state: FootballChessGameState, defTeam: Team): number | null {
  const defenders = state.pieces.filter((piece) => piece.team === defTeam);
  if (defenders.length === 0) return null;
  const sorted = defTeam === "b" ? defenders.slice().sort((a, b) => b.y - a.y) : defenders.slice().sort((a, b) => a.y - b.y);
  const line = (sorted[1] ?? sorted[0]).y;
  return defTeam === "b" ? Math.min(line, 1) : Math.max(line, 0);
}

export function isAttackGoalArea(team: Team, x: number, y: number): boolean {
  const cell = cellAt(x, y);
  if (!cell) return false;
  return team === "b" ? cell.t === "oppga" : cell.t === "selfga";
}

export function isAttackPenaltyArea(team: Team, x: number, y: number): boolean {
  const cell = cellAt(x, y);
  if (!cell) return false;
  return isAttackGoalArea(team, x, y) || (cell.t === "pa" && (team === "b" ? y < 0 : y > 0));
}

export function isAttackVitalArea(team: Team, x: number, y: number): boolean {
  const cell = cellAt(x, y);
  return Boolean(cell && cell.t === "va" && (team === "b" ? y < 0 : y > 0));
}

export function isAttackCrossArea(team: Team, x: number, y: number): boolean {
  const cell = cellAt(x, y);
  return Boolean(cell && cell.t === "cross" && (team === "b" ? y < 0 : y > 0));
}

export function isFoulFKArea(team: Team, x: number, y: number): boolean {
  return isAttackVitalArea(team, x, y) || isAttackCrossArea(team, x, y);
}

export function shootArea(piece: Piece): "PA" | "VA" | "-" {
  const cell = cellAt(piece.x, piece.y);
  if (!cell) return "-";
  if (piece.team === "b") {
    if (cell.t === "oppga" || (cell.t === "pa" && piece.y < 0)) return "PA";
    if (cell.t === "va" && piece.y < 0) return "VA";
  } else {
    if (cell.t === "selfga" || (cell.t === "pa" && piece.y > 0)) return "PA";
    if (cell.t === "va" && piece.y > 0) return "VA";
  }
  return "-";
}

export function enemyGKFor(state: FootballChessGameState, team: Team): Piece | undefined {
  return state.pieces.find((piece) => piece.team !== team && piece.posType === "gk");
}

function goalAreaPassCutGK(state: FootballChessGameState, passTeam: Team, x: number, y: number): Piece | undefined {
  if (!isAttackGoalArea(passTeam, x, y)) return undefined;
  return state.pieces.find((piece) => piece.team !== passTeam && piece.posType === "gk" && piece.x === x && piece.y === y);
}

export function isGKGuardingShot(attackPiece: Piece, enemyGK: Piece | undefined): boolean {
  if (!enemyGK) return false;
  return (
    (enemyGK.x === attackPiece.x && enemyGK.y === attackPiece.y) ||
    isAttackGoalArea(attackPiece.team, enemyGK.x, enemyGK.y)
  );
}

export function calcShoot(state: FootballChessGameState, attackPiece: Piece): { area: "PA" | "VA" | "-"; prob: number } {
  const area = shootArea(attackPiece);
  const enemyGK = enemyGKFor(state, attackPiece.team);
  if ((area === "PA" || area === "VA") && !isGKGuardingShot(attackPiece, enemyGK)) return { area, prob: 100 };
  const gkCost = enemyGK ? pieceCost(enemyGK) : 1;
  const cellPieces = piecesAt(state, attackPiece.x, attackPiece.y);
  const mates = cellPieces.filter((piece) => piece.team === attackPiece.team && piece.id !== attackPiece.id);
  const enemies = cellPieces.filter((piece) => piece.team !== attackPiece.team);

  if (area === "PA") {
    const base = T_PA_SHOOT[costToIndex(gkCost)][costToIndex(pieceCost(attackPiece))];
    let buff = 0;
    if (attackPiece.posType === "fw") buff += BUFF.PenaltyAreaShoot.OwnFW;
    buff += mates.length * BUFF.PenaltyAreaShoot.OwnBuff;
    buff += enemies.length * BUFF.PenaltyAreaShoot.EnemyDebuff;
    return { area: "PA", prob: clampProb(base + buff) };
  }

  if (area === "VA") {
    const base = T_VA_SHOOT[costToIndex(gkCost)][costToIndex(pieceCost(attackPiece))];
    let buff = 0;
    if (attackPiece.posType === "fw") buff += BUFF.VitalAreaShoot.OwnFW;
    buff += enemies.length * BUFF.VitalAreaShoot.EnemyDebuff;
    return { area: "VA", prob: clampProb(base + buff) };
  }

  return { area: "-", prob: 100 };
}

export function highestCostPiece(list: Piece[]): Piece | undefined {
  return highestCostPieces(list)[0];
}

function highestCostPieces(list: Piece[]): Piece[] {
  if (list.length === 0) return [];
  const highestCost = Math.max(...list.map(pieceCost));
  return list.filter((piece) => pieceCost(piece) >= highestCost);
}

function pickHighestCostPiece(state: FootballChessGameState, list: Piece[]): Piece | undefined {
  const candidates = highestCostPieces(list);
  if (candidates.length <= 1) return candidates[0];
  return candidates[rollIntInclusive(state, 0, candidates.length - 1)];
}

export function shootBlockAvoidanceProbability(state: FootballChessGameState, shooter: Piece, x: number, y: number): number {
  return piecesAt(state, x, y).some((piece) => piece.team !== shooter.team && piece.posType !== "gk") ? 65 : 100;
}

export function calcPK(attacker: Piece, gk: Piece): number {
  return clampProb(T_PK[costToIndex(pieceCost(attacker))][costToIndex(pieceCost(gk))]);
}

export function calcFK(attacker: Piece, gk: Piece): number {
  return clampProb(T_FK[costToIndex(pieceCost(attacker))][costToIndex(pieceCost(gk))]);
}

export function calcCK(attacker: Piece, gk: Piece): number {
  return clampProb(T_CK[costToIndex(pieceCost(attacker))][costToIndex(pieceCost(gk))]);
}

export function calcFoul(defenderCount: number): number {
  return T_FOUL[Math.min(Math.max(defenderCount, 1), 3)] ?? 0;
}

export function failedToCK(kind: string, gkCost: number): number {
  const table = T_FAILED[kind];
  return table ? clampProb(table[costToIndex(gkCost)]) : 0;
}

export function moveLimitList(cost: number): Array<[number, number]> {
  const base: Array<[number, number]> = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  if (cost >= 3) base.push([1, -1], [1, 1], [-1, -1], [-1, 1]);
  return base;
}

export function isMoveCommand(command: Pick<GameCommand, "type">): boolean {
  return command.type === "move" || command.type === "dribble";
}

function isNormalMoveCommand(command: Pick<GameCommand, "type">): boolean {
  return command.type === "move";
}

export function isBallCommand(command: Pick<GameCommand, "type">): boolean {
  return command.type === "pass" || command.type === "throughpass" || command.type === "shoot";
}

export function isPassTargetInRange(piece: Piece, x: number, y: number): boolean {
  const dx = x - piece.x;
  const dy = y - piece.y;
  return BALL_LIMIT.some(([lx, ly]) => lx === dx && ly === dy);
}

export function isMovable(
  state: FootballChessGameState,
  piece: Piece,
  x: number,
  y: number,
  movedIds: Set<number> = new Set(),
): boolean {
  if (movedIds.has(piece.id)) return false;
  const cell = cellAt(x, y);
  if (!cell || cell.t === "selfgoal" || cell.t === "oppgoal") return false;
  if (piece.sx === x && piece.sy === y) return false;
  const dx = x - piece.sx;
  const dy = y - piece.sy;
  if (!moveLimitList(piece.cost).some(([lx, ly]) => lx === dx && ly === dy)) return false;
  if (piecesAt(state, x, y).length >= MAX_PER_CELL) return false;
  if (piecesAt(state, x, y).filter((candidate) => candidate.team === piece.team).length >= MAX_PER_CELL) return false;
  return true;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isCommandType(value: unknown): value is GameCommand["type"] {
  return value === "move" || value === "dribble" || value === "pass" || value === "throughpass" || value === "shoot";
}

function rawObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function validateCommandsForTeam(
  state: FootballChessGameState,
  team: Team,
  input: unknown,
): CommandValidationResult {
  const errors: string[] = [];
  const commands: GameCommand[] = [];
  const commandIndexes = new Map<GameCommand, number>();

  const pushCommand = (index: number, command: GameCommand) => {
    commands.push(command);
    commandIndexes.set(command, index);
  };

  if (!Array.isArray(input)) {
    return { ok: false, commands: [], errors: ["commands must be an array"] };
  }
  if (input.length > 32) errors.push("too many commands");

  input.slice(0, 32).forEach((raw, index) => {
    const object = rawObject(raw);
    if (!object) {
      errors.push(`commands[${index}] must be an object`);
      return;
    }

    const type = object.type;
    const pieceId = object.pieceId;
    if (!isCommandType(type)) {
      errors.push(`commands[${index}].type is invalid`);
      return;
    }
    if (!isCoordinate(pieceId)) {
      errors.push(`commands[${index}].pieceId is invalid`);
      return;
    }
    if (object.team !== undefined && object.team !== team) {
      errors.push(`commands[${index}].team does not match player team`);
      return;
    }

    const piece = pieceById(state, pieceId);
    if (!piece || piece.team !== team) {
      errors.push(`commands[${index}].pieceId does not belong to ${team}`);
      return;
    }

    if (type === "pass") {
      const targetId = object.targetId;
      if (!isCoordinate(targetId)) {
        errors.push(`commands[${index}].targetId is invalid`);
        return;
      }
      const target = pieceById(state, targetId);
      if (!target || target.team !== team) {
        errors.push(`commands[${index}].targetId does not belong to ${team}`);
        return;
      }
      pushCommand(index, { type, pieceId, targetId, tx: target.x, ty: target.y, team });
      return;
    }

    const tx = object.tx;
    const ty = object.ty;
    if (!isCoordinate(tx) || !isCoordinate(ty)) {
      errors.push(`commands[${index}] target coordinates are invalid`);
      return;
    }

    pushCommand(index, { type, pieceId, tx, ty, team } as GameCommand);
  });

  const movedIds = new Set<number>();
  const holder = ballHolder(state);
  const plannedPositions = new Map<number, { x: number; y: number }>();
  let chainHolderId: number | null = holder?.team === team ? holder.id : null;
  let ballMoveCount = 0;
  let ballCanMove = true;

  const plannedCoord = (piece: Piece) => plannedPositions.get(piece.id) ?? coordOf(piece);
  const plannedPiecesAt = (x: number, y: number) =>
    state.pieces.filter((piece) => {
      const coord = plannedCoord(piece);
      return coord.x === x && coord.y === y;
    });
  const canMoveInPlannedState = (piece: Piece, x: number, y: number) => {
    if (movedIds.has(piece.id)) return false;
    const cell = cellAt(x, y);
    if (!cell || cell.t === "selfgoal" || cell.t === "oppgoal") return false;
    const current = plannedCoord(piece);
    if (current.x === x && current.y === y) return false;
    const dx = x - piece.sx;
    const dy = y - piece.sy;
    if (!moveLimitList(piece.cost).some(([lx, ly]) => lx === dx && ly === dy)) return false;
    if (plannedPiecesAt(x, y).length >= MAX_PER_CELL) return false;
    if (plannedPiecesAt(x, y).filter((candidate) => candidate.team === piece.team).length >= MAX_PER_CELL) return false;
    return true;
  };
  const isPassTargetInPlannedRange = (piece: Piece, x: number, y: number) => {
    const from = plannedCoord(piece);
    const dx = x - from.x;
    const dy = y - from.y;
    return BALL_LIMIT.some(([lx, ly]) => lx === dx && ly === dy);
  };
  const chainHolder = () => (chainHolderId == null ? undefined : pieceById(state, chainHolderId));
  const canKickWithChainHolder = (piece: Piece) => {
    const current = chainHolder();
    if (!ballCanMove || !current || current.id !== piece.id) return false;
    const currentCoord = plannedCoord(current);
    const enemyCount = plannedPiecesAt(currentCoord.x, currentCoord.y).filter((candidate) => candidate.team !== team).length;
    return enemyCount === 0 || ballMoveCount === 0;
  };
  const stopBallIfContested = (piece: Piece) => {
    const coord = plannedCoord(piece);
    if (plannedPiecesAt(coord.x, coord.y).some((candidate) => candidate.team !== team)) ballCanMove = false;
  };

  const validationIntents: Partial<Record<Team, GameCommand[]>> = {};
  validationIntents[team] = commands;

  for (const command of sortCommandsForResolution(validationIntents)) {
    const index = commandIndexes.get(command) ?? 0;
    const piece = pieceById(state, command.pieceId);
    if (!piece || piece.team !== team) continue;

    if (command.type === "pass") {
      const target = pieceById(state, command.targetId);
      if (!target || target.team !== team) continue;
      if (!canKickWithChainHolder(piece)) errors.push(`commands[${index}] pass requires current chain ball holder`);
      const targetCoord = plannedCoord(target);
      if (!isPassTargetInPlannedRange(piece, targetCoord.x, targetCoord.y)) errors.push(`commands[${index}] pass target is out of range`);
      command.tx = targetCoord.x;
      command.ty = targetCoord.y;
      chainHolderId = target.id;
      ballMoveCount += 1;
      stopBallIfContested(target);
      continue;
    }

    if (command.type === "move" || command.type === "dribble") {
      if (!canMoveInPlannedState(piece, command.tx, command.ty)) errors.push(`commands[${index}] move target is invalid`);
      if (command.type === "dribble" && chainHolderId !== piece.id) errors.push(`commands[${index}] dribble requires current chain ball holder`);
      movedIds.add(piece.id);
      plannedPositions.set(piece.id, { x: command.tx, y: command.ty });
      if (command.type === "dribble") {
        chainHolderId = piece.id;
        if (plannedPiecesAt(command.tx, command.ty).some((candidate) => candidate.team !== team)) ballCanMove = false;
      }
      continue;
    }

    if (command.type === "throughpass") {
      const targetCell = cellAt(command.tx, command.ty);
      if (!targetCell || targetCell.t === "selfgoal" || targetCell.t === "oppgoal") errors.push(`commands[${index}] target cell is invalid`);
      if (!canKickWithChainHolder(piece)) errors.push(`commands[${index}] throughpass requires current chain ball holder`);
      if (!isPassTargetInPlannedRange(piece, command.tx, command.ty)) errors.push(`commands[${index}] throughpass target is out of range`);
      chainHolderId = null;
      ballMoveCount += 1;
      ballCanMove = false;
      continue;
    }

    const shoot = calcShoot(state, { ...piece, ...plannedCoord(piece) });
    if (shoot.area === "-") errors.push(`commands[${index}] shoot is outside shooting area`);
    if (!canKickWithChainHolder(piece)) errors.push(`commands[${index}] shoot requires current chain ball holder`);
    chainHolderId = null;
    ballCanMove = false;
  }

  return { ok: errors.length === 0, commands, errors };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seed: string, state = hashSeed(seed)): SeededRng {
  let current = state >>> 0;
  const next = () => {
    current += 0x6d2b79f5;
    let t = current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    get state() {
      return current >>> 0;
    },
    next,
    rollPercent: (percent: number) => next() * 100 < percent,
  };
}

export function rollPercent(state: FootballChessGameState, percent: number): boolean {
  const rng = createSeededRng(state.rng.seed, state.rng.state);
  const result = rng.rollPercent(percent);
  state.rng.state = rng.state;
  return result;
}

export function rollIntInclusive(state: FootballChessGameState, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return lo;
  const rng = createSeededRng(state.rng.seed, state.rng.state);
  const value = lo + Math.floor(rng.next() * (hi - lo + 1));
  state.rng.state = rng.state;
  return value;
}

export function cloneGameState(state: FootballChessGameState): FootballChessGameState {
  return normalizeGameState(
    JSON.parse(JSON.stringify(state)) as Partial<FootballChessGameState>,
    state.firstKickTeam,
    state.rng.seed,
  );
}

function pushEvent(events: TurnEvent[], event: Omit<TurnEvent, "seq">): void {
  events.push({ seq: events.length + 1, ...event });
}

function teamName(team: Team): string {
  return team === "b" ? "blue" : "red";
}

function coordOf(piece: Piece): { x: number; y: number } {
  return { x: piece.x, y: piece.y };
}

function setBallToPiece(state: FootballChessGameState, piece: Piece, moved = false): void {
  state.ball = { target: "piece", pieceId: piece.id, x: null, y: null, lastTeam: piece.team };
  if (moved) state.turnBallMoved = true;
}

function setBallToCell(state: FootballChessGameState, x: number, y: number, lastTeam: Team | null, moved = false): void {
  state.ball = { target: "cell", pieceId: null, x, y, lastTeam: lastTeam ?? state.ball.lastTeam };
  if (moved) state.turnBallMoved = true;
}

function resetBattleDelayCount(state: FootballChessGameState): void {
  state.battleDelayCounts = { b: 0, r: 0 };
}

export function setupKickoffForTeam(state: FootballChessGameState, team: Team, keepTurnStopped = false): void {
  state.teamDefinitions = normalizeTeamDefinitions(state.teamDefinitions);
  state.pieces = createDefaultPieces(state.teamDefinitions);
  const kickoffPiece = kickoffPieceForTeam(state.pieces, team);
  state.ball = { target: "piece", pieceId: kickoffPiece.id, x: null, y: null, lastTeam: team };
  state.turnBallMoved = false;
  state.turnStopped = keepTurnStopped;
  resetBattleDelayCount(state);
  state.passivePenaltyTeams = [];
}

function prepareNextTurn(state: FootballChessGameState): void {
  state.pieces.forEach((piece) => {
    piece.sx = piece.x;
    piece.sy = piece.y;
    piece.moved = false;
  });
  state.turnBallMoved = false;
  state.turnStopped = false;
}

function clearPushCell(x: number, y: number): { x: number; y: number; cleared: boolean } {
  const cell = cellAt(x, y);
  if (!cell) return { x, y, cleared: false };
  let nextY: number | null = null;
  if (cell.t === "selfga" || (cell.t === "pa" && y > 0)) nextY = y - 1;
  if (cell.t === "oppga" || (cell.t === "pa" && y < 0)) nextY = y + 1;
  if (nextY === null) return { x, y, cleared: false };
  const nextCell = cellAt(x, nextY);
  if (!nextCell || nextCell.t === "selfgoal" || nextCell.t === "oppgoal") return { x, y, cleared: false };
  return { x, y: nextY, cleared: true };
}

function placeLooseBallDefensive(
  state: FootballChessGameState,
  x: number,
  y: number,
  lastTeam: Team,
): { x: number; y: number; cleared: boolean } {
  const target = clearPushCell(x, y);
  setBallToCell(state, target.x, target.y, lastTeam, true);
  return target;
}

function replayCoordFromDetails(details: Record<string, unknown>): { x: number; y: number } | undefined {
  const from = details.from;
  if (typeof from !== "object" || from === null) return undefined;
  const maybeCoord = from as { x?: unknown; y?: unknown };
  if (typeof maybeCoord.x !== "number" || typeof maybeCoord.y !== "number") return undefined;
  return Number.isFinite(maybeCoord.x) && Number.isFinite(maybeCoord.y) ? { x: maybeCoord.x, y: maybeCoord.y } : undefined;
}

function replayPieceIdFromDetails(details: Record<string, unknown>): number | undefined {
  const id = details.shooterId ?? details.kickerId;
  return typeof id === "number" && Number.isFinite(id) ? id : undefined;
}

function scoreGoal(
  state: FootballChessGameState,
  team: Team,
  events: TurnEvent[],
  logs: string[],
  details: Record<string, unknown>,
): void {
  state.score[team] = (state.score[team] ?? 0) + 1;
  const kickoffTeam = opponentTeam(team);
  const eventDetails = { ...details };
  if (typeof eventDetails.finalKickKind !== "string" && typeof eventDetails.source === "string") {
    eventDetails.finalKickKind = eventDetails.source;
  }
  pushEvent(events, {
    type: "shot.goal",
    team,
    pieceId: replayPieceIdFromDetails(eventDetails),
    from: replayCoordFromDetails(eventDetails),
    details: { ...eventDetails, score: { ...state.score }, kickoffTeam },
  });
  logs.push(`${teamName(team)} goal; kickoff returns to ${teamName(kickoffTeam)}`);
  setupKickoffForTeam(state, kickoffTeam, true);
  pushEvent(events, { type: "kickoff", team: kickoffTeam, details: { afterGoalBy: team } });
}

function sortCommandsForResolution(intents: Partial<Record<Team, GameCommand[]>>): GameCommand[] {
  const blue = intents.b ?? [];
  const red = intents.r ?? [];
  const landingMoveRefs = new Set<GameCommand>();
  const collectLandingMoves = (commands: GameCommand[]) => {
    const targets = new Set(commands.filter((command) => command.type === "pass").map((command) => command.targetId));
    commands
      .filter((command) => command.type === "move" && targets.has(command.pieceId))
      .forEach((command) => landingMoveRefs.add(command));
  };
  const sortTeam = (commands: GameCommand[]) => [
    ...commands.filter((command) => !isNormalMoveCommand(command)),
    ...commands.filter((command) => isNormalMoveCommand(command)),
  ];

  collectLandingMoves(blue);
  collectLandingMoves(red);
  const sortedBlue = sortTeam(blue);
  const sortedRed = sortTeam(red);
  const merged: GameCommand[] = [];
  const maxLength = Math.max(sortedBlue.length, sortedRed.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (sortedBlue[index]) merged.push(sortedBlue[index]);
    if (sortedRed[index]) merged.push(sortedRed[index]);
  }
  return [
    ...merged.filter((command) => landingMoveRefs.has(command)),
    ...merged.filter((command) => !isNormalMoveCommand(command)),
    ...merged.filter((command) => isNormalMoveCommand(command) && !landingMoveRefs.has(command)),
  ];
}

function resolveFlyingPassPath(
  state: FootballChessGameState,
  passPiece: Piece,
  targetX: number,
  targetY: number,
  events: TurnEvent[],
): boolean {
  for (const [x, y] of getRoute(passPiece.x, passPiece.y, targetX, targetY)) {
    const enemies = piecesAt(state, x, y).filter((piece) => piece.team !== passPiece.team);
    if (enemies.length === 0) continue;
    const passProbability = calcFlyingPass(state, passPiece, x, y);
    const cutProbability = clampProb(100 - passProbability);
    if (!rollPercent(state, cutProbability)) continue;
    const cutter = pickHighestCostPiece(state, enemies);
    if (cutter) {
      setBallToPiece(state, cutter, true);
    } else {
      setBallToCell(state, x, y, opponentTeam(passPiece.team), true);
    }
    pushEvent(events, {
      type: "pass.cut",
      team: passPiece.team,
      pieceId: passPiece.id,
      from: coordOf(passPiece),
      to: cutter ? coordOf(cutter) : { x, y },
      details: {
        cutAt: { x, y },
        cutterId: cutter?.id ?? null,
        cutProbability,
      },
    });
    return true;
  }
  return false;
}

function hasPassDefensiveContact(state: FootballChessGameState, passPiece: Piece, targetX: number, targetY: number): boolean {
  return (
    getRoute(passPiece.x, passPiece.y, targetX, targetY).some(([x, y]) =>
      piecesAt(state, x, y).some((piece) => piece.team !== passPiece.team),
    ) || piecesAt(state, targetX, targetY).some((piece) => piece.team !== passPiece.team)
  );
}

function isOffsidePass(state: FootballChessGameState, passer: Piece, receiver: Piece): boolean {
  const dir = attackDir(passer.team);
  const inOpponentHalf = dir < 0 ? receiver.y < 0 : receiver.y > 0;
  if (!inOpponentHalf) return false;
  const line = offsideLineFor(state, opponentTeam(passer.team));
  if (line === null) return false;
  return rollPercent(state, calcOffside(line, receiver.y, receiver.y, dir));
}

function handleOffside(
  state: FootballChessGameState,
  receiver: Piece,
  x: number,
  y: number,
  sourceTeam: Team,
  events: TurnEvent[],
  logs: string[],
): void {
  const from = coordOf(receiver);
  const resetTo = { x: receiver.sx, y: receiver.sy };
  receiver.x = receiver.sx;
  receiver.y = receiver.sy;
  setBallToCell(state, x, y, sourceTeam, true);
  pushEvent(events, {
    type: "offside",
    team: receiver.team,
    pieceId: receiver.id,
    from,
    to: { x, y },
    details: { sourceTeam, resetTo },
  });
  logs.push(`${teamName(receiver.team)} offside at (${x},${y})`);
}

function isFreeBallCatchOffside(state: FootballChessGameState, team: Team, catchPiece: Piece): boolean {
  const dir = attackDir(team);
  const inOpponentHalf = dir < 0 ? catchPiece.sy < 0 : catchPiece.sy > 0;
  if (!inOpponentHalf) return false;
  const line = offsideLineFor(state, opponentTeam(team));
  if (line === null) return false;
  return dir < 0 ? catchPiece.sy < line : catchPiece.sy > line;
}

function pickupLooseBall(state: FootballChessGameState, events: TurnEvent[], logs: string[]): void {
  if (state.ball.target !== "cell") return;
  const ballX = state.ball.x;
  const ballY = state.ball.y;
  const sourceTeam = state.ball.lastTeam;
  const pieces = piecesAt(state, ballX, ballY);
  if (pieces.length === 0) return;
  const winner = pickHighestCostPiece(state, pieces);
  if (!winner) return;
  setBallToPiece(state, winner, true);
  pushEvent(events, {
    type: "looseball.picked",
    team: winner.team,
    pieceId: winner.id,
    from: { x: ballX, y: ballY },
    to: { x: ballX, y: ballY },
    details: { sourceTeam, cost: winner.cost },
  });
  logs.push(`${teamName(winner.team)} piece ${winner.id} picked up a loose ball`);
  if (sourceTeam === winner.team && isFreeBallCatchOffside(state, winner.team, winner)) {
    handleOffside(state, winner, ballX, ballY, sourceTeam, events, logs);
  }
}

type KickKind = "PenaltyAreaShoot" | "VitalAreaShoot" | "PK" | "FK" | "CK";

interface KickSequenceOutcome {
  goal: boolean;
  gk?: Piece;
  logs: string[];
  steps: KickSequenceStep[];
}

interface KickSequenceStep {
  type: "missing-gk" | "failed-to-ck" | "ck-kick" | "ck-limit";
  kind?: KickKind;
  probability?: number;
  result: "goal" | "miss" | "CK" | "GK";
  limit?: number;
}

type ShotSaveType = "saving" | "failedShoot" | "gk";

function resolveCKOrGKSequence(
  state: FootballChessGameState,
  kicker: Piece,
  gk: Piece | undefined,
  firstKind: KickKind,
  shoot = false,
): KickSequenceOutcome {
  const logs: string[] = [];
  const steps: KickSequenceStep[] = [];
  if (!gk) {
    steps.push({ type: "missing-gk", result: "goal" });
    return { goal: true, logs: ["enemy GK missing"], steps };
  }
  if (shoot) {
    const firstChance = failedToCK(firstKind, pieceCost(gk));
    const firstToCK = rollPercent(state, firstChance);
    logs.push(`${firstKind} failed-to-CK ${firstChance}% => ${firstToCK ? "CK" : "GK"}`);
    steps.push({ type: "failed-to-ck", kind: firstKind, probability: firstChance, result: firstToCK ? "CK" : "GK" });
    if (!firstToCK) return { goal: false, gk, logs, steps };

    const firstCKProbability = calcCK(kicker, gk);
    const firstCKOk = rollPercent(state, firstCKProbability);
    logs.push(`CK ${firstCKProbability}% => ${firstCKOk ? "goal" : "miss"}`);
    steps.push({ type: "ck-kick", kind: "CK", probability: firstCKProbability, result: firstCKOk ? "goal" : "miss" });
    if (firstCKOk) return { goal: true, logs, steps };

    for (let index = 0; index < MAX_CK_NUM; index += 1) {
      const ckChance = failedToCK("CK", pieceCost(gk));
      const toCK = rollPercent(state, ckChance);
      logs.push(`CK failed-to-CK ${ckChance}% => ${toCK ? "CK" : "GK"}`);
      steps.push({ type: "failed-to-ck", kind: "CK", probability: ckChance, result: toCK ? "CK" : "GK" });
      if (!toCK) continue;

      const ckProbability = calcCK(kicker, gk);
      const ckOk = rollPercent(state, ckProbability);
      logs.push(`CK ${ckProbability}% => ${ckOk ? "goal" : "miss"}`);
      steps.push({ type: "ck-kick", kind: "CK", probability: ckProbability, result: ckOk ? "goal" : "miss" });
      if (ckOk) return { goal: true, logs, steps };
      return { goal: false, gk, logs, steps };
    }

    logs.push(`shoot CK retry limit ${MAX_CK_NUM} => GK`);
    steps.push({ type: "ck-limit", kind: "CK", result: "GK", limit: MAX_CK_NUM });
    return { goal: false, gk, logs, steps };
  }

  const maxAttempts = MAX_CK_NUM;
  let kickType: KickKind = firstKind;
  for (let index = 0; index < maxAttempts; index += 1) {
    const ckChance = failedToCK(kickType, pieceCost(gk));
    const toCK = rollPercent(state, ckChance);
    logs.push(`${kickType} failed-to-CK ${ckChance}% => ${toCK ? "CK" : "GK"}`);
    steps.push({ type: "failed-to-ck", kind: kickType, probability: ckChance, result: toCK ? "CK" : "GK" });
    if (!toCK) return { goal: false, gk, logs, steps };
    const ckProbability = calcCK(kicker, gk);
    const ckOk = rollPercent(state, ckProbability);
    logs.push(`CK ${ckProbability}% => ${ckOk ? "goal" : "miss"}`);
    steps.push({ type: "ck-kick", kind: "CK", probability: ckProbability, result: ckOk ? "goal" : "miss" });
    if (ckOk) return { goal: true, logs, steps };
    kickType = "CK";
  }
  logs.push(`CK limit ${maxAttempts} => GK`);
  steps.push({ type: "ck-limit", kind: "CK", result: "GK", limit: maxAttempts });
  return { goal: false, gk, logs, steps };
}

function resolveSetPieceOutcome(
  state: FootballChessGameState,
  kicker: Piece,
  outcome: KickSequenceOutcome,
  events: TurnEvent[],
  logs: string[],
  details: Record<string, unknown>,
  stopOnSave = false,
  saveType: ShotSaveType = "gk",
): void {
  logs.push(...outcome.logs);
  const finalKickStep = [...outcome.steps].reverse().find((step) => step.type === "ck-kick");
  const eventDetails = {
    ...details,
    finalKickKind: finalKickStep?.kind ?? (typeof details.source === "string" ? details.source : undefined),
    kickLogs: outcome.logs,
    kickSteps: outcome.steps,
  };
  if (outcome.goal) {
    scoreGoal(state, kicker.team, events, logs, eventDetails);
    return;
  }
  if (outcome.gk) {
    setBallToPiece(state, outcome.gk, true);
    if (stopOnSave) state.turnStopped = true;
    pushEvent(events, {
      type: "shot.saved",
      team: kicker.team,
      pieceId: kicker.id,
      from: replayCoordFromDetails(eventDetails),
      to: coordOf(outcome.gk),
      details: { ...eventDetails, gkId: outcome.gk.id, saveType },
    });
  }
}

function hasSetPieceKick(logs: string[]): boolean {
  return logs.some((line) => line.includes("=> CK") || /^CK \d/.test(line));
}

function shotSaveType(state: FootballChessGameState, shooter: Piece, outcome: KickSequenceOutcome): ShotSaveType {
  if (!outcome.gk || hasSetPieceKick(outcome.logs)) return "gk";
  return isAttackGoalArea(shooter.team, outcome.gk.x, outcome.gk.y) ? "saving" : "failedShoot";
}

function runTackle(
  state: FootballChessGameState,
  holder: Piece,
  tackler: Piece,
  events: TurnEvent[],
  logs: string[],
): boolean {
  const defenderCount = piecesAt(state, tackler.x, tackler.y).filter((piece) => piece.team === tackler.team).length;
  const foulProbability = calcFoul(defenderCount);
  const foul = rollPercent(state, foulProbability);
  const foulIsPK = foul && isAttackPenaltyArea(holder.team, holder.x, holder.y);
  const foulIsFK = foul && !foulIsPK && isFoulFKArea(holder.team, holder.x, holder.y);

  if (foulIsPK || foulIsFK) {
    const kind: KickKind = foulIsPK ? "PK" : "FK";
    const kicker = pickHighestCostPiece(state, state.pieces.filter((piece) => piece.team === holder.team)) ?? holder;
    const gk = enemyGKFor(state, holder.team) ?? tackler;
    const probability = kind === "PK" ? calcPK(kicker, gk) : calcFK(kicker, gk);
    const ok = rollPercent(state, probability);
    pushEvent(events, {
      type: "tackle.foul",
      team: tackler.team,
      pieceId: tackler.id,
      from: coordOf(tackler),
      to: coordOf(holder),
      details: { defenderCount, foulProbability, kind, kickerId: kicker.id, kickerFrom: coordOf(kicker), probability, success: ok },
    });
    logs.push(`${teamName(tackler.team)} foul: ${kind} ${probability}% => ${ok ? "goal" : "miss"}`);
    if (ok) {
      scoreGoal(state, holder.team, events, logs, { source: kind, kickerId: kicker.id, tacklerId: tackler.id, from: coordOf(kicker) });
      return true;
    }
    resolveSetPieceOutcome(
      state,
      kicker,
      resolveCKOrGKSequence(state, kicker, gk, kind),
      events,
      logs,
      { source: kind, kickerId: kicker.id, tacklerId: tackler.id, from: coordOf(kicker) },
      true,
      "gk",
    );
    return true;
  }

  const probability = calcTackleSuccess(state, holder, tackler);
  const success = rollPercent(state, probability);
  if (success) {
    setBallToPiece(state, tackler, true);
    pushEvent(events, {
      type: "tackle.success",
      team: tackler.team,
      pieceId: tackler.id,
      from: coordOf(tackler),
      to: coordOf(holder),
      details: { holderId: holder.id, probability },
    });
    logs.push(`${teamName(tackler.team)} tackle success ${probability}%`);
    return true;
  }

  pushEvent(events, {
    type: "tackle.failed",
    team: tackler.team,
    pieceId: tackler.id,
    from: coordOf(tackler),
    to: coordOf(holder),
    details: { holderId: holder.id, probability },
  });
  logs.push(`${teamName(tackler.team)} tackle failed ${probability}%`);
  return false;
}

function resolveTacklesAgainstHolder(
  state: FootballChessGameState,
  holder: Piece,
  tacklers: Piece[],
  events: TurnEvent[],
  logs: string[],
): boolean {
  for (const tackler of tacklers) {
    if (state.turnStopped) return true;
    const currentHolder = ballHolder(state);
    if (!currentHolder || currentHolder.id !== holder.id) return true;
    if (runTackle(state, holder, tackler, events, logs)) return true;
  }
  return false;
}

function resolveStationaryTackles(state: FootballChessGameState, events: TurnEvent[], logs: string[]): void {
  if (state.turnBallMoved) return;
  const holder = ballHolder(state);
  if (!holder) return;
  const tacklers = piecesAt(state, holder.x, holder.y).filter((piece) => piece.team !== holder.team);
  if (tacklers.length === 0) return;
  resolveTacklesAgainstHolder(state, holder, tacklers, events, logs);
}

function resolveShoot(
  state: FootballChessGameState,
  shooter: Piece,
  command: Extract<GameCommand, { type: "shoot" }>,
  events: TurnEvent[],
  logs: string[],
): void {
  const from = coordOf(shooter);
  const goal = goalCellFor(shooter.team);
  for (const [x, y] of getRoute(shooter.x, shooter.y, goal.x, goal.y)) {
    const avoidProbability = shootBlockAvoidanceProbability(state, shooter, x, y);
    const avoided = rollPercent(state, avoidProbability);
    if (avoidProbability >= 100 || avoided) continue;
    const blocker = pickHighestCostPiece(
      state,
      piecesAt(state, x, y).filter((piece) => piece.team !== shooter.team && piece.posType !== "gk"),
    );
    if (blocker) setBallToPiece(state, blocker, true);
    else placeLooseBallDefensive(state, x, y, shooter.team);
    pushEvent(events, {
      type: "shot.blocked",
      team: shooter.team,
      pieceId: shooter.id,
      from,
      to: { x, y },
      details: { blockerId: blocker?.id ?? null, avoidProbability },
    });
    logs.push(`${teamName(shooter.team)} shot blocked at (${x},${y})`);
    return;
  }

  const shot = calcShoot(state, shooter);
  if (shot.area === "-") {
    pushEvent(events, {
      type: "command.skipped",
      team: shooter.team,
      pieceId: shooter.id,
      from,
      details: { commandType: "shoot", reason: "shoot outside shooting area", target: commandTarget(command) },
    });
    return;
  }

  const ok = rollPercent(state, shot.prob);
  if (ok) {
    scoreGoal(state, shooter.team, events, logs, { source: "shoot", shooterId: shooter.id, from, area: shot.area, probability: shot.prob });
    return;
  }

  pushEvent(events, {
    type: "shot.miss",
    team: shooter.team,
    pieceId: shooter.id,
    from,
    details: { area: shot.area, probability: shot.prob },
  });
  logs.push(`${teamName(shooter.team)} shot missed ${shot.area} ${shot.prob}%`);
  const failedKind: KickKind = shot.area === "VA" ? "VitalAreaShoot" : "PenaltyAreaShoot";
  const outcome = resolveCKOrGKSequence(state, shooter, enemyGKFor(state, shooter.team), failedKind, true);
  const saveType = shotSaveType(state, shooter, outcome);
  resolveSetPieceOutcome(
    state,
    shooter,
    outcome,
    events,
    logs,
    { source: failedKind, shooterId: shooter.id, from },
    saveType !== "saving",
    saveType,
  );
}

function isOwnField(team: Team, x: number, y: number): boolean {
  return team === "b" ? y >= 1 : y <= 0;
}

function isPassiveTacticsArea(team: Team, x: number, y: number): boolean {
  const cell = cellAt(x, y);
  if (!cell) return false;
  if (team === "b") return cell.t === "selfga" || ((cell.t === "pa" || cell.t === "va" || cell.t === "cross") && y > 0);
  return cell.t === "oppga" || ((cell.t === "pa" || cell.t === "va" || cell.t === "cross") && y < 0);
}

function ballPosition(state: FootballChessGameState): { x: number; y: number } | null {
  if (state.ball.target === "cell") return { x: state.ball.x, y: state.ball.y };
  const holder = ballHolder(state);
  return holder ? coordOf(holder) : null;
}

function isPassiveTactics(state: FootballChessGameState, team: Team): boolean {
  const ball = ballPosition(state);
  if (!ball || isPassiveTacticsArea(team, ball.x, ball.y)) return false;
  return state.pieces.filter((piece) => piece.team === team && isPassiveTacticsArea(team, piece.x, piece.y)).length >= 9;
}

function resolveTurnEndRules(
  state: FootballChessGameState,
  events: TurnEvent[],
  logs: string[],
  turnStartHasBallTeam: Team | null,
): void {
  const holder = ballHolder(state);
  if (!holder) {
    resetBattleDelayCount(state);
  } else if (holder.team === turnStartHasBallTeam && isOwnField(holder.team, holder.x, holder.y)) {
    state.battleDelayCounts[holder.team] += 1;
    state.battleDelayCounts[opponentTeam(holder.team)] = 0;
    if (state.battleDelayCounts[holder.team] >= BATTLE_DELAY_COUNT) {
      pushEvent(events, {
        type: "battle-delay",
        team: holder.team,
        pieceId: holder.id,
        to: coordOf(holder),
        details: { turns: BATTLE_DELAY_COUNT },
      });
      logs.push(`${teamName(holder.team)} battle delay; kickoff reset`);
      setupKickoffForTeam(state, holder.team, true);
      return;
    }
  } else {
    resetBattleDelayCount(state);
  }

  state.passivePenaltyTeams = [];
  (["b", "r"] as Team[]).forEach((team) => {
    if (!isPassiveTactics(state, team)) return;
    state.passivePenaltyTeams.push(team);
    pushEvent(events, { type: "passive-tactics", team });
    logs.push(`${teamName(team)} passive tactics penalty`);
  });
}

function commandTarget(command: GameCommand): { x: number; y: number } {
  return { x: command.tx, y: command.ty };
}

function skipCommand(events: TurnEvent[], command: GameCommand, reason: string, piece?: Piece): void {
  pushEvent(events, {
    type: "command.skipped",
    team: command.team,
    pieceId: command.pieceId,
    from: piece ? coordOf(piece) : undefined,
    details: { commandType: command.type, reason, target: commandTarget(command) },
  });
}

function resolveCommand(
  state: FootballChessGameState,
  command: GameCommand,
  movedIds: Set<number>,
  events: TurnEvent[],
  logs: string[],
  turnStartHasBallTeam: Team | null,
): void {
  const piece = pieceById(state, command.pieceId);
  if (!piece || piece.team !== command.team) {
    skipCommand(events, command, "piece is unavailable");
    return;
  }

  if (isBallCommand(command)) {
    const currentHasBallTeam = ballHolder(state)?.team ?? null;
    if (currentHasBallTeam !== turnStartHasBallTeam) {
      skipCommand(events, command, "ball possession team changed earlier this turn", piece);
      return;
    }
  }

  if (isBallCommand(command)) {
    const holder = ballHolder(state);
    if (!holder || holder.id !== piece.id) {
      skipCommand(events, command, "piece no longer has the ball", piece);
      return;
    }
  }

  if (command.type === "move" || command.type === "dribble") {
    if (!isMovable(state, piece, command.tx, command.ty, movedIds)) {
      skipCommand(events, command, "move target is invalid at resolution time", piece);
      return;
    }
    const from = coordOf(piece);
    const holderBeforeMove = ballHolder(state);
    const carriesBall = command.type === "dribble" && holderBeforeMove?.id === piece.id;
    const tacklers = carriesBall ? piecesAt(state, command.tx, command.ty).filter((target) => target.team !== piece.team) : [];
    piece.x = command.tx;
    piece.y = command.ty;
    piece.moved = true;
    movedIds.add(piece.id);
    if (command.type === "dribble") state.turnBallMoved = true;
    if (carriesBall) setBallToPiece(state, piece, true);
    pushEvent(events, {
      type: "piece.moved",
      team: piece.team,
      pieceId: piece.id,
      from,
      to: coordOf(piece),
      details: { carryBall: carriesBall, commandType: command.type },
    });
    logs.push(`${teamName(piece.team)} piece ${piece.id} ${command.type} to (${piece.x},${piece.y})`);
    if (carriesBall && tacklers.length > 0) {
      resolveTacklesAgainstHolder(state, piece, tacklers, events, logs);
    } else if (
      command.type === "dribble" &&
      holderBeforeMove &&
      holderBeforeMove.id !== piece.id &&
      holderBeforeMove.team !== piece.team &&
      holderBeforeMove.x === piece.x &&
      holderBeforeMove.y === piece.y
    ) {
      runTackle(state, holderBeforeMove, piece, events, logs);
    }
    return;
  }

  if (command.type === "pass") {
    const receiver = pieceById(state, command.targetId);
    if (!receiver || receiver.team !== piece.team) {
      skipCommand(events, command, "pass receiver is unavailable", piece);
      return;
    }
    if (!isPassTargetInRange(piece, receiver.x, receiver.y)) {
      skipCommand(events, command, "pass receiver is out of range at resolution time", piece);
      return;
    }
    if (resolveFlyingPassPath(state, piece, receiver.x, receiver.y, events)) return;
    const probability = calcLandingPass(state, piece, receiver, receiver.x, receiver.y);
    const defensiveContact = hasPassDefensiveContact(state, piece, receiver.x, receiver.y);
    const ok = rollPercent(state, probability);
    if (ok) {
      setBallToPiece(state, receiver, true);
      pushEvent(events, {
        type: "pass.completed",
        team: piece.team,
        pieceId: piece.id,
        from: coordOf(piece),
        to: coordOf(receiver),
        details: { receiverId: receiver.id, probability, defensiveContact },
      });
      logs.push(`${teamName(piece.team)} pass completed ${probability}%`);
      if (isOffsidePass(state, piece, receiver)) handleOffside(state, receiver, receiver.x, receiver.y, piece.team, events, logs);
      return;
    }
    const cutter =
      goalAreaPassCutGK(state, piece.team, receiver.x, receiver.y) ??
      pickHighestCostPiece(
        state,
        piecesAt(state, receiver.x, receiver.y).filter((candidate) => candidate.team !== piece.team),
      );
    if (cutter) {
      setBallToPiece(state, cutter, true);
    } else {
      setBallToCell(state, receiver.x, receiver.y, opponentTeam(piece.team), true);
    }
    pushEvent(events, {
      type: "pass.cut",
      team: piece.team,
      pieceId: piece.id,
      from: coordOf(piece),
      to: cutter ? coordOf(cutter) : coordOf(receiver),
      details: {
        receiverId: receiver.id,
        probability,
        cutAt: coordOf(receiver),
        cutterId: cutter?.id ?? null,
        cutProbability: clampProb(100 - probability),
      },
    });
    logs.push(`${teamName(piece.team)} pass cut ${probability}%`);
    return;
  }

  if (command.type === "throughpass") {
    const targetCell = cellAt(command.tx, command.ty);
    if (!targetCell || targetCell.t === "selfgoal" || targetCell.t === "oppgoal") {
      skipCommand(events, command, "throughpass target cell is invalid", piece);
      return;
    }
    if (!isPassTargetInRange(piece, command.tx, command.ty)) {
      skipCommand(events, command, "throughpass target is out of range at resolution time", piece);
      return;
    }
    if (resolveFlyingPassPath(state, piece, command.tx, command.ty, events)) return;
    const goalAreaGK = goalAreaPassCutGK(state, piece.team, command.tx, command.ty);
    if (goalAreaGK) {
      setBallToPiece(state, goalAreaGK, true);
      pushEvent(events, {
        type: "pass.cut",
        team: piece.team,
        pieceId: piece.id,
        from: coordOf(piece),
        to: coordOf(goalAreaGK),
        details: {
          commandType: "throughpass",
          probability: 0,
          cutAt: { x: command.tx, y: command.ty },
          cutterId: goalAreaGK.id,
          cutProbability: 100,
          reason: "goalAreaGK",
        },
      });
      logs.push(`${teamName(piece.team)} throughpass cut by goal-area GK`);
      return;
    }
    const probability = calcFlyingPass(state, piece, command.tx, command.ty);
    const defensiveContact = hasPassDefensiveContact(state, piece, command.tx, command.ty);
    const ok = rollPercent(state, probability);
    if (ok) {
      setBallToCell(state, command.tx, command.ty, piece.team, true);
      pushEvent(events, {
        type: "ball.moved",
        team: piece.team,
        pieceId: piece.id,
        from: coordOf(piece),
        to: { x: command.tx, y: command.ty },
        details: { commandType: "throughpass", probability, defensiveContact },
      });
      logs.push(`${teamName(piece.team)} throughpass completed ${probability}%`);
      return;
    }
    const cutter = pickHighestCostPiece(
      state,
      piecesAt(state, command.tx, command.ty).filter((candidate) => candidate.team !== piece.team),
    );
    if (cutter) {
      setBallToPiece(state, cutter, true);
    } else {
      setBallToCell(state, command.tx, command.ty, opponentTeam(piece.team), true);
    }
    pushEvent(events, {
      type: "pass.cut",
      team: piece.team,
      pieceId: piece.id,
      from: coordOf(piece),
      to: cutter ? coordOf(cutter) : { x: command.tx, y: command.ty },
      details: {
        commandType: "throughpass",
        probability,
        cutAt: { x: command.tx, y: command.ty },
        cutterId: cutter?.id ?? null,
        cutProbability: clampProb(100 - probability),
      },
    });
    logs.push(`${teamName(piece.team)} throughpass cut ${probability}%`);
    return;
  }

  resolveShoot(state, piece, command, events, logs);
}

export function resolveServerTurn(
  state: FootballChessGameState,
  intents: Partial<Record<Team, GameCommand[]>>,
): TurnResolution {
  const game = cloneGameState(state);
  game.turnBallMoved = false;
  game.turnStopped = false;
  const events: TurnEvent[] = [];
  const logs: string[] = [];
  const movedIds = new Set<number>();
  const turnStartHasBallTeam = ballHolder(game)?.team ?? null;

  for (const command of sortCommandsForResolution(intents)) {
    if (game.turnStopped) break;
    resolveCommand(game, command, movedIds, events, logs, turnStartHasBallTeam);
  }

  if (!game.turnStopped) resolveStationaryTackles(game, events, logs);
  if (!game.turnStopped) pickupLooseBall(game, events, logs);
  if (!game.turnStopped) resolveTurnEndRules(game, events, logs, turnStartHasBallTeam);
  prepareNextTurn(game);
  pushEvent(events, {
    type: "turn.completed",
    details: {
      score: { ...game.score },
      ball: game.ball,
      rng: game.rng,
    },
  });
  return { game, events, logs };
}
