import type { FmeaDocument, Lint, Ratings, Factor, Severity } from "./types.ts";
import { ptr } from "./pointer.ts";
import type { PriorityTable } from "./table.ts";
import { checkTableProperties } from "./table.ts";

export interface MachineRule { id: string; severity: Severity; check: (doc: FmeaDocument) => Lint[] }

const FACTORS: Factor[] = ["S", "O", "D"];

function lint(rule: string, severity: Severity, pointer: string, message: string): Lint {
  return { rule, severity, pointer, message };
}

export const MACHINE_RULES: MachineRule[] = [
  {
    // A high Occurrence backed only by judgement is unreviewable unless the row says what sets the failure off.
    id: "occurrence-estimate-without-trigger",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      for (let i = 0; i < doc.chains.length; i++) {
        const c = doc.chains[i];
        const trigger = typeof c.trigger === "string" ? c.trigger.trim() : "";
        if (c.ratings.O.evidence_kind === "estimate" && c.ratings.O.value >= 7 && trigger === "") {
          out.push(lint("occurrence-estimate-without-trigger", "warning", ptr("chains", i, "ratings", "O"),
            "Occurrence is 7 or more on an estimate with no trigger recorded"));
        }
      }
      return out;
    },
  },
  {
    // Detection 1 claims the failure is caught immediately; that claim needs a control that exists and has evidence.
    id: "detection-1-without-evidenced-control",
    severity: "blocker",
    check(doc) {
      const out: Lint[] = [];
      for (let i = 0; i < doc.chains.length; i++) {
        const c = doc.chains[i];
        const evidenced = c.controls.some((ctl) => ctl.kind === "detection" && ctl.status === "existing" && ctl.evidence.kind !== "none");
        if (c.ratings.D.value === 1 && !evidenced) {
          out.push(lint("detection-1-without-evidenced-control", "blocker", ptr("chains", i, "ratings", "D"),
            "Detection is 1 with no existing detection control carrying evidence"));
        }
      }
      return out;
    },
  },
  {
    // A provisional rating is one nobody has reviewed yet; the report marks the row and the user is asked to re-score.
    id: "rating-provisional",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      const scan = (ratings: Ratings, i: number, key: "ratings" | "post_ratings"): void => {
        for (const f of FACTORS) {
          if (ratings[f].review.status === "provisional") {
            out.push(lint("rating-provisional", "warning", ptr("chains", i, key, f), "The rating is still provisional and needs re-scoring"));
          }
        }
      };
      for (let i = 0; i < doc.chains.length; i++) {
        scan(doc.chains[i].ratings, i, "ratings");
        const post = doc.chains[i].post_ratings;
        if (post) scan(post, i, "post_ratings");
      }
      return out;
    },
  },
  {
    // An action carried over from a postmortem loses its trail if the incident is recorded on the row but not on the action.
    id: "seeded-action-without-incident",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      for (let i = 0; i < doc.chains.length; i++) {
        const c = doc.chains[i];
        const seeded = typeof c.source_incident === "string" && c.source_incident.trim() !== "";
        if (!seeded) continue;
        for (let j = 0; j < c.actions.length; j++) {
          const ref = c.actions[j].source_incident;
          if (typeof ref !== "string" || ref.trim() === "") {
            out.push(lint("seeded-action-without-incident", "warning", ptr("chains", i, "actions", j),
              `action on a chain seeded from ${c.source_incident} carries no source_incident`));
          }
        }
      }
      return out;
    },
  },
  {
    // Ground rules and assumptions are what the ratings were made under; a document that records
    // neither cannot be re-read later against the conditions its scores assumed.
    id: "metadata-without-ground-rules",
    severity: "blocker",
    check(doc) {
      const out: Lint[] = [];
      if (doc.meta.ground_rules.length === 0) {
        out.push(lint("metadata-without-ground-rules", "blocker", ptr("meta", "ground_rules"),
          "the document records no ground rules"));
      }
      if (doc.meta.assumptions.length === 0) {
        out.push(lint("metadata-without-ground-rules", "blocker", ptr("meta", "assumptions"),
          "the document records no assumptions"));
      }
      return out;
    },
  },
  {
    // A link the document holds with no target to explain it is stale or pasted from another analysis.
    id: "tracker-link-without-config",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      for (let i = 0; i < doc.chains.length; i++) {
        const actions = doc.chains[i].actions;
        for (let j = 0; j < actions.length; j++) {
          const link = actions[j].tracker;
          if (link !== undefined && doc.meta.tracker?.provider !== link.provider) {
            out.push(lint("tracker-link-without-config", "warning", ptr("chains", i, "actions", j, "tracker"),
              `the action carries a ${link.provider} link but meta.tracker is absent or names another provider`));
          }
        }
      }
      return out;
    },
  },
  {
    // One tracker item standing for two actions means a refresh would move both on one item's state.
    id: "tracker-link-shared",
    severity: "warning",
    check(doc) {
      const out: Lint[] = [];
      const first = new Map<string, string>();
      for (let i = 0; i < doc.chains.length; i++) {
        const c = doc.chains[i];
        for (let j = 0; j < c.actions.length; j++) {
          const link = c.actions[j].tracker;
          if (link === undefined) continue;
          const holder = first.get(link.id);
          if (holder === undefined) {
            first.set(link.id, `${c.id}/${c.actions[j].id}`);
          } else {
            out.push(lint("tracker-link-shared", "warning", ptr("chains", i, "actions", j, "tracker"),
              `the tracker item ${link.key} is already linked from action ${holder}`));
          }
        }
      }
      return out;
    },
  },
];

export function runLints(doc: FmeaDocument, rules: MachineRule[] = MACHINE_RULES): Lint[] {
  const out: Lint[] = [];
  for (const rule of rules) out.push(...rule.check(doc));
  return out;
}

// The loaded table's broken properties (§7), one warning each at the field that names the table:
// a finding of the table, not of a row, so it leaves the quality score as it is. validateDocument
// adds them after the document's own lints; priority.ts prints the same findings as lines.
export function tablePropertyLints(table: PriorityTable): Lint[] {
  return checkTableProperties(table).map((message) => lint("priority-table-property", "warning", ptr("meta", "scales", "priority_table"), message));
}

// The stderr line of a finding that does not fail the run, `<severity> <rule>: <message>`, kept on
// one line as formatError keeps its message, whatever the table id holds.
export function formatLintLine(finding: Lint): string {
  return `${finding.severity} ${finding.rule}: ${finding.message.replace(/\s+/g, " ").trim()}`;
}
