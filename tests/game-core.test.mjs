import test from "node:test";
import assert from "node:assert/strict";

import {
  ballHolder,
  calcFlyingPass,
  calcPassDisplayProbability,
  calcTackleSuccess,
  createInitialGameState,
  resolveServerTurn,
  validateCommandsForTeam,
} from "../.test-dist/src/game-core.js";

function piece(overrides) {
  return {
    id: 1,
    team: "b",
    posType: "mf",
    x: 0,
    y: 1,
    cost: 1,
    sx: 0,
    sy: 1,
    moved: false,
    ...overrides,
  };
}

function minimalState(seed = "game-core-test") {
  const state = createInitialGameState("b", seed);
  const holder = piece({ id: 1, team: "b", posType: "mf", x: 0, y: 1, sx: 0, sy: 1 });
  state.pieces = [holder];
  state.ball = { target: "piece", pieceId: holder.id, x: null, y: null, lastTeam: "b" };
  state.score = { b: 0, r: 0 };
  state.turnBallMoved = false;
  state.turnStopped = false;
  state.battleDelayCounts = { b: 0, r: 0 };
  state.passivePenaltyTeams = [];
  return state;
}

test("through pass survives when the passer makes a normal move later in the same turn", () => {
  const state = minimalState("throughpass-then-move");
  const commands = [
    { type: "throughpass", pieceId: 1, tx: 0, ty: 0, team: "b" },
    { type: "move", pieceId: 1, tx: 1, ty: 1, team: "b" },
  ];

  const validation = validateCommandsForTeam(state, "b", commands);
  assert.equal(validation.ok, true, validation.errors.join("; "));

  const result = resolveServerTurn(state, { b: validation.commands });
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["ball.moved", "piece.moved", "turn.completed"],
  );
  assert.deepEqual(result.game.ball, { target: "cell", pieceId: null, x: 0, y: 0, lastTeam: "b" });
  assert.deepEqual(
    result.game.pieces.map(({ id, x, y }) => ({ id, x, y })),
    [{ id: 1, x: 1, y: 1 }],
  );
});

test("pass probability display is hidden for an enemy-only target cell", () => {
  const state = minimalState("pass-display");
  const passer = state.pieces[0];
  state.pieces.push(piece({ id: 2, team: "r", posType: "df", x: 0, y: 0, sx: 0, sy: 0, cost: 2 }));

  assert.equal(calcPassDisplayProbability(state, passer, 0, 0), null);

  state.pieces.push(piece({ id: 3, team: "b", posType: "fw", x: 1, y: 1, sx: 1, sy: 1, cost: 1 }));
  assert.equal(calcPassDisplayProbability(state, passer, 1, 1), 100);
});

test("online command validation follows chain ball holder for chained passes", () => {
  const state = createInitialGameState("b", "chain-pass-validation");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 3, x: 0, y: 1, sx: 0, sy: 1 }),
    piece({ id: 2, team: "b", posType: "mf", cost: 3, x: 0, y: 0, sx: 0, sy: 0 }),
    piece({ id: 3, team: "b", posType: "fw", cost: 3, x: 0, y: -1, sx: 0, sy: -1 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const validation = validateCommandsForTeam(state, "b", [
    { type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: 0, team: "b" },
    { type: "pass", pieceId: 2, targetId: 3, tx: 0, ty: -1, team: "b" },
  ]);

  assert.equal(validation.ok, true, validation.errors.join("; "));

  const result = resolveServerTurn(state, { b: validation.commands });
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["pass.completed", "pass.completed", "turn.completed"],
  );
  assert.equal(ballHolder(result.game)?.id, 3);
});

test("online command validation stops kicks after a pass lands in a contested cell", () => {
  const state = createInitialGameState("b", "chain-pass-contested-validation");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 3, x: 0, y: 1, sx: 0, sy: 1 }),
    piece({ id: 2, team: "b", posType: "mf", cost: 3, x: 0, y: 0, sx: 0, sy: 0 }),
    piece({ id: 3, team: "b", posType: "fw", cost: 3, x: 0, y: -1, sx: 0, sy: -1 }),
    piece({ id: 4, team: "r", posType: "df", cost: 1, x: 0, y: 0, sx: 0, sy: 0 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const validation = validateCommandsForTeam(state, "b", [
    { type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: 0, team: "b" },
    { type: "pass", pieceId: 2, targetId: 3, tx: 0, ty: -1, team: "b" },
  ]);

  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.includes("pass requires current chain ball holder")), true);
});

test("online command validation checks landing passes against a moved receiver cell", () => {
  const state = createInitialGameState("b", "landing-pass-validation");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 3, x: -2, y: 0, sx: -2, sy: 0 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 3, x: 1, y: 3, sx: 1, sy: 3 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const validation = validateCommandsForTeam(state, "b", [
    { type: "move", pieceId: 2, tx: 0, ty: 2, team: "b" },
    { type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: 2, team: "b" },
  ]);

  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.deepEqual(validation.commands[1], { type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: 2, team: "b" });
});

test("online command validation applies landing receiver moves even when the pass was queued first", () => {
  const state = createInitialGameState("b", "landing-pass-validation-pass-first");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 3, x: -2, y: 0, sx: -2, sy: 0 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 3, x: 1, y: 3, sx: 1, sy: 3 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const validation = validateCommandsForTeam(state, "b", [
    { type: "pass", pieceId: 1, targetId: 2, tx: 1, ty: 3, team: "b" },
    { type: "move", pieceId: 2, tx: 0, ty: 2, team: "b" },
  ]);

  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.deepEqual(validation.commands[0], { type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: 2, team: "b" });
});

test("online command validation rejects landing passes if the moved receiver cell is out of range", () => {
  const state = createInitialGameState("b", "landing-pass-validation-out");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 3, x: -2, y: 0, sx: -2, sy: 0 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 3, x: 0, y: 2, sx: 0, sy: 2 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const validation = validateCommandsForTeam(state, "b", [
    { type: "move", pieceId: 2, tx: 1, ty: 3, team: "b" },
    { type: "pass", pieceId: 1, targetId: 2, tx: 1, ty: 3, team: "b" },
  ]);

  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.includes("pass target is out of range")), true);
});

test("a completed pass into a contested cell skips end-of-turn stationary tackles", () => {
  const state = createInitialGameState("b", "contested-pass-0");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 3, x: 0, y: 1, sx: 0, sy: 1 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 3, x: 0, y: 0, sx: 0, sy: 0 }),
    piece({ id: 3, team: "r", posType: "df", cost: 1, x: 0, y: 0, sx: 0, sy: 0 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: 0, team: "b" }],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["pass.completed", "turn.completed"],
  );
  assert.equal(ballHolder(result.game)?.id, 2);
  assert.deepEqual(result.game.ball, { target: "piece", pieceId: 2, x: null, y: null, lastTeam: "b" });
});

test("dribbles resolve before ordinary moves like Unity PrepareMoveOperations", () => {
  const state = createInitialGameState("b", "dribble-before-move");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 1, x: 0, y: 1, sx: 0, sy: 1 }),
    piece({ id: 2, team: "b", posType: "df", cost: 1, x: 1, y: 1, sx: 1, sy: 1 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [
      { type: "move", pieceId: 2, tx: 2, ty: 1, team: "b" },
      { type: "dribble", pieceId: 1, tx: 0, ty: 0, team: "b" },
    ],
  });

  const movedEvents = result.events.filter((event) => event.type === "piece.moved");
  assert.deepEqual(
    movedEvents.map((event) => [event.pieceId, event.details?.carryBall]),
    [
      [1, true],
      [2, false],
    ],
  );
  assert.equal(ballHolder(result.game)?.id, 1);
});

test("a route pass cut gives possession directly to the cutter", () => {
  const state = createInitialGameState("b", "pass-cut-held-0");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 1, x: 0, y: 1, sx: 0, sy: 1 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 1, x: 0, y: -1, sx: 0, sy: -1 }),
    piece({ id: 3, team: "r", posType: "df", cost: 3, x: 0, y: 0, sx: 0, sy: 0 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: -1, team: "b" }],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["pass.cut", "turn.completed"],
  );
  assert.equal(result.events[0].details?.cutterId, 3);
  assert.deepEqual(result.events[0].details?.cutAt, { x: 0, y: 0 });
  assert.equal(ballHolder(result.game)?.id, 3);
  assert.deepEqual(result.game.ball, { target: "piece", pieceId: 3, x: null, y: null, lastTeam: "r" });
});

test("a landing pass cut gives possession directly to the defender on the target cell", () => {
  const state = createInitialGameState("b", "landing-pass-cut-held-0");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 1, x: 0, y: 1, sx: 0, sy: 1 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 1, x: 0, y: 0, sx: 0, sy: 0 }),
    piece({ id: 3, team: "r", posType: "df", cost: 3, x: 0, y: 0, sx: 0, sy: 0 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: 0, team: "b" }],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["pass.cut", "turn.completed"],
  );
  assert.equal(result.events[0].details?.receiverId, 2);
  assert.equal(result.events[0].details?.cutterId, 3);
  assert.deepEqual(result.events[0].details?.cutAt, { x: 0, y: 0 });
  assert.equal(ballHolder(result.game)?.id, 3);
  assert.deepEqual(result.game.ball, { target: "piece", pieceId: 3, x: null, y: null, lastTeam: "r" });
});

test("a through pass cut on the target cell gives possession directly to the defender", () => {
  const state = createInitialGameState("b", "throughpass-target-cut-held-0");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 1, x: 0, y: 1, sx: 0, sy: 1 }),
    piece({ id: 2, team: "r", posType: "df", cost: 3, x: 0, y: 0, sx: 0, sy: 0 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "throughpass", pieceId: 1, tx: 0, ty: 0, team: "b" }],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["pass.cut", "turn.completed"],
  );
  assert.equal(result.events[0].details?.commandType, "throughpass");
  assert.equal(result.events[0].details?.cutterId, 2);
  assert.deepEqual(result.events[0].details?.cutAt, { x: 0, y: 0 });
  assert.equal(ballHolder(result.game)?.id, 2);
  assert.deepEqual(result.game.ball, { target: "piece", pieceId: 2, x: null, y: null, lastTeam: "r" });
});

test("ball commands after a same-turn possession-team change are skipped like Unity", () => {
  const state = createInitialGameState("b", "changed-team-pass-cut-0");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 1, x: 0, y: 3, sx: 0, sy: 3 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 1, x: 0, y: 1, sx: 0, sy: 1 }),
    piece({ id: 3, team: "r", posType: "df", cost: 3, x: 0, y: 2, sx: 0, sy: 2 }),
    piece({ id: 4, team: "b", posType: "gk", cost: 3, x: 0, y: 3, sx: 0, sy: 3 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: 1, team: "b" }],
    r: [{ type: "shoot", pieceId: 3, tx: 0, ty: 4, team: "r" }],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["pass.cut", "command.skipped", "turn.completed"],
  );
  assert.equal(result.events[0].details?.cutterId, 3);
  assert.equal(result.events[1].pieceId, 3);
  assert.equal(result.events[1].details?.commandType, "shoot");
  assert.equal(result.events[1].details?.reason, "ball possession team changed earlier this turn");
  assert.equal(ballHolder(result.game)?.id, 3);
  assert.deepEqual(result.game.ball, { target: "piece", pieceId: 3, x: null, y: null, lastTeam: "r" });
});

test("a goal-area GK always cuts a landing pass and takes possession", () => {
  const state = createInitialGameState("b", "goal-area-gk-landing-cut");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 1, x: 0, y: -1, sx: 0, sy: -1 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 1, x: 0, y: -2, sx: 0, sy: -2 }),
    piece({ id: 3, team: "r", posType: "gk", cost: 3, x: 0, y: -2, sx: 0, sy: -2 }),
    piece({ id: 4, team: "r", posType: "df", cost: 3, x: 0, y: -2, sx: 0, sy: -2 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "pass", pieceId: 1, targetId: 2, tx: 0, ty: -2, team: "b" }],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["pass.cut", "turn.completed"],
  );
  assert.equal(result.events[0].details?.cutterId, 3);
  assert.equal(result.events[0].details?.cutProbability, 100);
  assert.equal(ballHolder(result.game)?.id, 3);
});

test("a goal-area GK always cuts a through pass target and takes possession", () => {
  const state = createInitialGameState("b", "goal-area-gk-through-cut");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 1, x: 0, y: -1, sx: 0, sy: -1 }),
    piece({ id: 2, team: "r", posType: "gk", cost: 3, x: 0, y: -2, sx: 0, sy: -2 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "throughpass", pieceId: 1, tx: 0, ty: -2, team: "b" }],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["pass.cut", "turn.completed"],
  );
  assert.equal(result.events[0].details?.commandType, "throughpass");
  assert.equal(result.events[0].details?.cutterId, 2);
  assert.equal(result.events[0].details?.cutProbability, 100);
  assert.equal(result.events[0].details?.reason, "goalAreaGK");
  assert.equal(ballHolder(result.game)?.id, 2);
});

test("standing in the attacking penalty area does not score without a shot", () => {
  const state = minimalState("penalty-area-no-auto-goal");
  state.pieces[0].x = 0;
  state.pieces[0].y = -2;
  state.pieces[0].sx = 0;
  state.pieces[0].sy = -2;

  const result = resolveServerTurn(state, {});
  assert.deepEqual(result.game.score, { b: 0, r: 0 });
  assert.equal(result.events.some((event) => event.type === "shot.goal"), false);
  assert.equal(ballHolder(result.game)?.id, 1);
});

test("a successful shot scores and returns kickoff possession to the conceding team", () => {
  const state = minimalState("shot-goal-kickoff");
  state.pieces[0].posType = "fw";
  state.pieces[0].x = 0;
  state.pieces[0].y = -2;
  state.pieces[0].sx = 0;
  state.pieces[0].sy = -2;

  const result = resolveServerTurn(state, {
    b: [{ type: "shoot", pieceId: 1, tx: 0, ty: -3, team: "b" }],
  });

  assert.equal(result.game.score.b, 1);
  assert.equal(result.events.some((event) => event.type === "shot.goal"), true);
  assert.equal(result.events.some((event) => event.type === "kickoff" && event.team === "r"), true);
  assert.equal(ballHolder(result.game)?.team, "r");
});

test("a normal shot miss becomes a saving catch when the GK is in the goal area", () => {
  const state = createInitialGameState("b", "saving-0");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 1, x: 0, y: -2, sx: 0, sy: -2 }),
    piece({ id: 2, team: "b", posType: "mf", cost: 1, x: 1, y: 1, sx: 1, sy: 1 }),
    piece({ id: 3, team: "r", posType: "gk", cost: 3, x: 0, y: -2, sx: 0, sy: -2 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [
      { type: "shoot", pieceId: 1, tx: 0, ty: -3, team: "b" },
      { type: "move", pieceId: 2, tx: 2, ty: 1, team: "b" },
    ],
  });

  assert.deepEqual(
    result.events.map((event) => `${event.type}:${event.details?.saveType ?? ""}`),
    ["shot.miss:", "shot.saved:saving", "piece.moved:", "turn.completed:"],
  );
  assert.deepEqual(
    result.game.pieces.find((candidate) => candidate.id === 2),
    piece({ id: 2, team: "b", posType: "mf", cost: 1, x: 2, y: 1, sx: 2, sy: 1, moved: false }),
  );
  assert.equal(ballHolder(result.game)?.id, 3);
});

test("a normal shot miss outside the GK goal-area catch stops later commands as GK", () => {
  const state = createInitialGameState("b", "failed-0");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 1, x: -1, y: -1, sx: -1, sy: -1 }),
    piece({ id: 2, team: "b", posType: "mf", cost: 1, x: 1, y: 1, sx: 1, sy: 1 }),
    piece({ id: 3, team: "r", posType: "gk", cost: 3, x: -1, y: -1, sx: -1, sy: -1 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [
      { type: "shoot", pieceId: 1, tx: 0, ty: -3, team: "b" },
      { type: "move", pieceId: 2, tx: 2, ty: 1, team: "b" },
    ],
  });

  assert.deepEqual(
    result.events.map((event) => `${event.type}:${event.details?.saveType ?? ""}`),
    ["shot.miss:", "shot.saved:failedShoot", "turn.completed:"],
  );
  assert.deepEqual(
    result.game.pieces.find((candidate) => candidate.id === 2),
    piece({ id: 2, team: "b", posType: "mf", cost: 1, x: 1, y: 1, sx: 1, sy: 1 }),
  );
  assert.equal(ballHolder(result.game)?.id, 3);
});

test("a normal shot miss keeps replay metadata for the GK follow-up", () => {
  const state = createInitialGameState("b", "failed-0");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 1, x: -1, y: -1, sx: -1, sy: -1 }),
    piece({ id: 3, team: "r", posType: "gk", cost: 3, x: -1, y: -1, sx: -1, sy: -1 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "shoot", pieceId: 1, tx: 0, ty: -3, team: "b" }],
  });
  const [miss, saved] = result.events;

  assert.equal(miss.type, "shot.miss");
  assert.deepEqual(miss.from, { x: -1, y: -1 });
  assert.equal(miss.details?.area, "VA");
  assert.equal(saved.type, "shot.saved");
  assert.equal(saved.details?.source, "VitalAreaShoot");
  assert.deepEqual(saved.details?.from, { x: -1, y: -1 });
  assert.deepEqual(saved.details?.kickLogs, ["VitalAreaShoot failed-to-CK 5% => GK"]);
  assert.equal(saved.details?.gkId, 3);
  assert.equal(saved.details?.saveType, "failedShoot");
});

test("a foul set-piece that ends in GK stops later commands in the same turn", () => {
  const state = createInitialGameState("b", "setpiece-stop-unique-1");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 1.5, x: 0, y: -1, sx: 0, sy: -1 }),
    piece({ id: 2, team: "b", posType: "mf", cost: 1, x: 1, y: 1, sx: 1, sy: 1 }),
    piece({ id: 3, team: "r", posType: "df", cost: 1, x: 0, y: -2, sx: 0, sy: -2 }),
    piece({ id: 4, team: "r", posType: "gk", cost: 3, x: 2, y: -1, sx: 2, sy: -1 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [
      { type: "dribble", pieceId: 1, tx: 0, ty: -2, team: "b" },
      { type: "move", pieceId: 2, tx: 2, ty: 1, team: "b" },
    ],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["piece.moved", "tackle.foul", "shot.saved", "turn.completed"],
  );
  assert.deepEqual(
    result.game.pieces.find((candidate) => candidate.id === 2),
    piece({ id: 2, team: "b", posType: "mf", cost: 1, x: 1, y: 1, sx: 1, sy: 1 }),
  );
  assert.equal(ballHolder(result.game)?.team, "r");
});

test("a shot block tie picks randomly among equal highest-cost defenders", () => {
  const state = createInitialGameState("b", "shot-block-tie-6");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 1, x: 0, y: -1, sx: 0, sy: -1 }),
    piece({ id: 2, team: "r", posType: "df", cost: 1, x: 0, y: -2, sx: 0, sy: -2 }),
    piece({ id: 3, team: "r", posType: "df", cost: 2, x: 0, y: -2, sx: 0, sy: -2 }),
    piece({ id: 4, team: "r", posType: "df", cost: 2, x: 0, y: -2, sx: 0, sy: -2 }),
  ];
  state.ball = { target: "piece", pieceId: 1, x: null, y: null, lastTeam: "b" };

  const result = resolveServerTurn(state, {
    b: [{ type: "shoot", pieceId: 1, tx: 0, ty: -3, team: "b" }],
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["shot.blocked", "turn.completed"],
  );
  assert.equal(result.events[0].details?.blockerId, 4);
  assert.equal(ballHolder(result.game)?.id, 4);
});

test("a loose ball tie picks randomly among equal highest-cost pieces", () => {
  const state = createInitialGameState("b", "loose-ball-tie-1");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "mf", cost: 2, x: 0, y: 0, sx: 0, sy: 0 }),
    piece({ id: 2, team: "r", posType: "mf", cost: 2, x: 0, y: 0, sx: 0, sy: 0 }),
  ];
  state.ball = { target: "cell", pieceId: null, x: 0, y: 0, lastTeam: "b" };

  const result = resolveServerTurn(state, {});

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["looseball.picked", "turn.completed"],
  );
  assert.equal(result.events[0].pieceId, 2);
  assert.equal(ballHolder(result.game)?.id, 2);
});

test("same-team loose ball pickup is offside from the turn-start line like Unity", () => {
  const state = createInitialGameState("b", "loose-ball-offside");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 2, x: 0, y: -1, sx: 0, sy: -1 }),
    piece({ id: 2, team: "r", posType: "gk", cost: 3, x: 0, y: -2, sx: 0, sy: -2 }),
    piece({ id: 3, team: "r", posType: "df", cost: 1, x: 1, y: 0, sx: 1, sy: 0 }),
  ];
  state.ball = { target: "cell", pieceId: null, x: 0, y: -1, lastTeam: "b" };

  const result = resolveServerTurn(state, {});

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["looseball.picked", "offside", "turn.completed"],
  );
  assert.equal(result.events[0].pieceId, 1);
  assert.equal(result.events[1].pieceId, 1);
  assert.deepEqual(result.game.ball, { target: "cell", pieceId: null, x: 0, y: -1, lastTeam: "b" });
});

test("same-team loose ball pickup uses turn-start position, not pickup cell, for offside", () => {
  const state = createInitialGameState("b", "loose-ball-offside-start-position");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 2, x: 0, y: -1, sx: 0, sy: 1 }),
    piece({ id: 2, team: "r", posType: "gk", cost: 3, x: 0, y: -2, sx: 0, sy: -2 }),
    piece({ id: 3, team: "r", posType: "df", cost: 1, x: 1, y: 0, sx: 1, sy: 0 }),
  ];
  state.ball = { target: "cell", pieceId: null, x: 0, y: -1, lastTeam: "b" };

  const result = resolveServerTurn(state, {});

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["looseball.picked", "turn.completed"],
  );
  assert.equal(ballHolder(result.game)?.id, 1);
});

test("passive tactics is flagged when nine pieces stay deep and the ball is outside that area", () => {
  const state = createInitialGameState("b", "passive-tactics-flag");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 1, x: -2, y: 2, sx: -2, sy: 2 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 1, x: -1, y: 2, sx: -1, sy: 2 }),
    piece({ id: 3, team: "b", posType: "mf", cost: 1, x: 0, y: 2, sx: 0, sy: 2 }),
    piece({ id: 4, team: "b", posType: "mf", cost: 1, x: 1, y: 2, sx: 1, sy: 2 }),
    piece({ id: 5, team: "b", posType: "mf", cost: 1, x: 2, y: 2, sx: 2, sy: 2 }),
    piece({ id: 6, team: "b", posType: "df", cost: 1, x: -2, y: 3, sx: -2, sy: 3 }),
    piece({ id: 7, team: "b", posType: "df", cost: 1, x: -1, y: 3, sx: -1, sy: 3 }),
    piece({ id: 8, team: "b", posType: "df", cost: 1, x: 0, y: 3, sx: 0, sy: 3 }),
    piece({ id: 9, team: "b", posType: "gk", cost: 1, x: 1, y: 3, sx: 1, sy: 3 }),
  ];
  state.ball = { target: "cell", pieceId: null, x: 0, y: 0, lastTeam: "r" };

  const result = resolveServerTurn(state, {});

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["passive-tactics", "turn.completed"],
  );
  assert.deepEqual(result.game.passivePenaltyTeams, ["b"]);
});

test("passive tactics does not trigger while the ball is inside that team's deep area", () => {
  const state = createInitialGameState("b", "passive-tactics-ball-deep");
  state.pieces = [
    piece({ id: 1, team: "b", posType: "fw", cost: 1, x: -2, y: 2, sx: -2, sy: 2 }),
    piece({ id: 2, team: "b", posType: "fw", cost: 1, x: -1, y: 2, sx: -1, sy: 2 }),
    piece({ id: 3, team: "b", posType: "mf", cost: 1, x: 0, y: 2, sx: 0, sy: 2 }),
    piece({ id: 4, team: "b", posType: "mf", cost: 1, x: 1, y: 2, sx: 1, sy: 2 }),
    piece({ id: 5, team: "b", posType: "mf", cost: 1, x: 2, y: 2, sx: 2, sy: 2 }),
    piece({ id: 6, team: "b", posType: "df", cost: 1, x: -2, y: 3, sx: -2, sy: 3 }),
    piece({ id: 7, team: "b", posType: "df", cost: 1, x: -1, y: 3, sx: -1, sy: 3 }),
    piece({ id: 8, team: "b", posType: "df", cost: 1, x: 0, y: 3, sx: 0, sy: 3 }),
    piece({ id: 9, team: "b", posType: "gk", cost: 1, x: 1, y: 3, sx: 1, sy: 3 }),
  ];
  state.ball = { target: "cell", pieceId: null, x: 0, y: 2, lastTeam: "b" };

  const result = resolveServerTurn(state, {});

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["looseball.picked", "turn.completed"],
  );
  assert.deepEqual(result.game.passivePenaltyTeams, []);
});

test("passive tactics applies the pass-cut and tackle modifiers to the Unity-side team", () => {
  const state = createInitialGameState("b", "passive-tactics-modifiers");
  const passer = piece({ id: 1, team: "b", posType: "mf", cost: 1, x: 0, y: 1, sx: 0, sy: 1 });
  const holder = piece({ id: 2, team: "b", posType: "mf", cost: 1, x: 0, y: 0, sx: 0, sy: 0 });
  const tackler = piece({ id: 3, team: "r", posType: "df", cost: 1, x: 0, y: 0, sx: 0, sy: 0 });
  state.pieces = [passer, holder, tackler];

  state.passivePenaltyTeams = [];
  assert.equal(calcFlyingPass(state, passer, 0, 0), 45);
  assert.equal(calcTackleSuccess(state, holder, tackler), 55);

  state.passivePenaltyTeams = ["b"];
  assert.equal(calcFlyingPass(state, passer, 0, 0), 25);
  assert.equal(calcTackleSuccess(state, holder, tackler), 55);

  state.passivePenaltyTeams = ["r"];
  assert.equal(calcFlyingPass(state, passer, 0, 0), 45);
  assert.equal(calcTackleSuccess(state, holder, tackler), 75);
});
