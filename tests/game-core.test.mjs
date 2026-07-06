import test from "node:test";
import assert from "node:assert/strict";

import {
  ballHolder,
  calcPassDisplayProbability,
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
