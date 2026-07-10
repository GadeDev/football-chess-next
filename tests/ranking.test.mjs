import test from "node:test";
import assert from "node:assert/strict";

import {
  RANKING_INITIAL_RATING,
  RANKING_K_FACTOR,
  expectedScore,
  nextRating,
  outcomeForSeat,
  outcomeScore,
} from "../.test-dist/src/ranking.js";

test("equal-rating win/loss moves exactly half the K factor", () => {
  const win = nextRating(RANKING_INITIAL_RATING, RANKING_INITIAL_RATING, "win");
  const loss = nextRating(RANKING_INITIAL_RATING, RANKING_INITIAL_RATING, "loss");
  assert.equal(win, RANKING_INITIAL_RATING + RANKING_K_FACTOR / 2);
  assert.equal(loss, RANKING_INITIAL_RATING - RANKING_K_FACTOR / 2);
});

test("equal-rating draw does not change the rating", () => {
  assert.equal(nextRating(1200, 1200, "draw"), 1200);
});

test("beating a stronger opponent gains more than beating a weaker one", () => {
  const vsStronger = nextRating(1000, 1400, "win") - 1000;
  const vsWeaker = nextRating(1000, 600, "win") - 1000;
  assert.ok(vsStronger > vsWeaker);
  assert.ok(vsStronger > 0 && vsWeaker > 0);
});

test("rating never goes below the floor", () => {
  // 同レート同士の敗北はK/2=16下がるが、レートが低くても0未満にはならない
  assert.equal(nextRating(5, 5, "loss"), 0);
});

test("expected score is symmetric and bounded", () => {
  const a = expectedScore(1000, 1200);
  const b = expectedScore(1200, 1000);
  assert.ok(Math.abs(a + b - 1) < 1e-9);
  assert.ok(a > 0 && a < 0.5);
});

test("winner mapping resolves each seat outcome", () => {
  assert.equal(outcomeForSeat("b", "b"), "win");
  assert.equal(outcomeForSeat("r", "b"), "loss");
  assert.equal(outcomeForSeat("b", "draw"), "draw");
  assert.equal(outcomeScore("win"), 1);
  assert.equal(outcomeScore("draw"), 0.5);
  assert.equal(outcomeScore("loss"), 0);
});
