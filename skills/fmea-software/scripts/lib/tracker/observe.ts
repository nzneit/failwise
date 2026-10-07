import type { ActionStatus, ObservedState } from "../types.ts";

export type RefreshFinding = "closed-unclear" | "disagree" | "still-open" | "unreachable" | "link-mismatch";
export interface Proposal { status: "Completed" | "Not Implemented"; completed_date?: string }
export interface Verdict { proposal?: Proposal; finding?: RefreshFinding }

// What the observed state of a tracker item means for an action with this status.
// Never a change: a proposal is for the person to accept, a finding is for the person to settle.
export function judge(status: ActionStatus, state: ObservedState, closedDate?: string): Verdict {
  if (state === "unreachable") return { finding: "unreachable" };
  if (status === "Completed" || status === "Not Implemented") return judgeSettled(status, state);
  return judgePending(state, closedDate);
}

function judgePending(state: ObservedState, closedDate?: string): Verdict {
  if (state === "done") return { proposal: closedDate === undefined ? { status: "Completed" } : { status: "Completed", completed_date: closedDate } };
  if (state === "dropped") return { proposal: { status: "Not Implemented" } };
  if (state === "closed") return { finding: "closed-unclear" };
  return {};
}

function judgeSettled(status: "Completed" | "Not Implemented", state: ObservedState): Verdict {
  if (state === "open") return { finding: "still-open" };
  if (state === "closed") return {};
  const agreeing = status === "Completed" ? "done" : "dropped";
  return state === agreeing ? {} : { finding: "disagree" };
}
