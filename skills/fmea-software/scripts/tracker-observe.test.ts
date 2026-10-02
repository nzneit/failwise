import { test } from "node:test";
import assert from "node:assert/strict";
import { judge } from "./lib/tracker/observe.ts";
import type { Verdict } from "./lib/tracker/observe.ts";
import type { ActionStatus, ObservedState } from "./lib/types.ts";

const NOTHING: Verdict = {};
const COMPLETED: Verdict = { proposal: { status: "Completed" } };
const NOT_IMPLEMENTED: Verdict = { proposal: { status: "Not Implemented" } };
const UNCLEAR: Verdict = { finding: "closed-unclear" };
const DISAGREE: Verdict = { finding: "disagree" };
const STILL_OPEN: Verdict = { finding: "still-open" };
const UNREACHABLE: Verdict = { finding: "unreachable" };

const STATES: ObservedState[] = ["open", "done", "dropped", "closed", "unreachable"];

// Each row is one document status; the verdicts follow STATES in order.
const PENDING_ROW: Verdict[] = [NOTHING, COMPLETED, NOT_IMPLEMENTED, UNCLEAR, UNREACHABLE];
const TABLE: [ActionStatus, Verdict[]][] = [
  ["Open", PENDING_ROW],
  ["Decision pending", PENDING_ROW],
  ["Implementation pending", PENDING_ROW],
  ["Completed", [STILL_OPEN, NOTHING, DISAGREE, NOTHING, UNREACHABLE]],
  ["Not Implemented", [STILL_OPEN, DISAGREE, NOTHING, NOTHING, UNREACHABLE]],
];

test("every pair of document status and tracker state has the verdict of the table", () => {
  let pairs = 0;
  for (const [status, row] of TABLE) {
    STATES.forEach((state, i) => {
      assert.deepEqual(judge(status, state), row[i], `${status} against ${state}`);
      pairs++;
    });
  }
  assert.equal(pairs, 25);
});

test("a Completed proposal carries the closing date when there is one and no date when there is none", () => {
  assert.deepEqual(judge("Open", "done", "2026-10-09"), { proposal: { status: "Completed", completed_date: "2026-10-09" } });
  assert.deepEqual(judge("Open", "done"), { proposal: { status: "Completed" } });
  assert.deepEqual(judge("Open", "dropped", "2026-10-09"), { proposal: { status: "Not Implemented" } });
});
