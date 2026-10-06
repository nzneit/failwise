// What the report comparison (tools/compare.ts) knows without touching the machine: the parts of a
// rendered report, which of them are owed a comparison, the class of one view from Playwright's
// JSON report (same, changed, or unverified when it cannot be judged either way), the summary
// line of a changed view read from Playwright's message, and the text of build/compare/summary.md.
// The class never depends on the wording of a message; only the summary line does.

import { rowStem, SECTION_PARTS, type Engine } from "../../dev/browser/matrix.ts";
import type { ReportedTest } from "./browser.ts";

/** A colour code of a terminal, as Playwright puts in its messages: ESC, "[", digits and ";", then "m". */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** The parts of a rendered report, in report order: each name of SECTION_PARTS with a `<section id="<name>"`,
 *  then "key" and "index" when the report contains `<table class="index"` (a prefix, so a table that carries
 *  further attributes counts), then one rowStem per `<article class="row" id="...">`, its id entity-decoded
 *  (&lt; &gt; &quot; &#39;, then &amp;) before it is reduced. `rows` maps each row stem to the decoded ids
 *  that reduce to it, a repeated id listed each time. */
export interface Parts {
  stems: string[];
  rows: Map<string, string[]>;
}

/** An attribute value as the browser reads it: the four entities the renderer writes, then `&amp;`. */
function decoded(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

export function partsOf(html: string): Parts {
  const sections = SECTION_PARTS.filter((name) => html.includes(`<section id="${name}"`));
  const chains = html.includes('<table class="index"') ? ["key", "index"] : [];
  const ids = [...html.matchAll(/<article class="row" id="([^"]*)"/g)].map((match) => decoded(match[1]));
  const rows = new Map<string, string[]>();
  for (const id of ids) {
    const stem = rowStem(id);
    rows.set(stem, [...(rows.get(stem) ?? []), id]);
  }
  return { stems: [...sections, ...chains, ...ids.map(rowStem)], rows };
}

export interface PartPlan {
  owed: string[]; // on both sides, in the after side's order; includes collided stems
  photographed: string[]; // owed, less the collided
  added: string[]; // after side only
  removed: string[]; // before side only
  /** A row stem that more than one row reduces to on one side, or that the two sides reach from different
   *  ids; with the after side's ids for it, then the before side's not already listed, a repeated id listed
   *  each time. */
  collided: Map<string, string[]>;
}

/** The ids of an owed row stem when it collided, else null. */
function collision(before: string[], after: string[]): string[] | null {
  if (before.length === 1 && after.length === 1 && before[0] === after[0]) return null;
  return [...after, ...before.filter((id) => !after.includes(id))];
}

export function planParts(before: Parts, after: Parts): PartPlan {
  // A stem repeats when two rows reduce to it; each part is owed, added or removed once.
  const beforeStems = [...new Set(before.stems)];
  const afterStems = [...new Set(after.stems)];
  const owed = afterStems.filter((stem) => beforeStems.includes(stem));
  const collided = new Map<string, string[]>();
  for (const stem of owed.filter((one) => after.rows.has(one))) {
    const ids = collision(before.rows.get(stem) ?? [], after.rows.get(stem) ?? []);
    if (ids !== null) collided.set(stem, ids);
  }
  return {
    owed,
    photographed: owed.filter((stem) => !collided.has(stem)),
    added: afterStems.filter((stem) => !beforeStems.includes(stem)),
    removed: beforeStems.filter((stem) => !afterStems.includes(stem)),
    collided,
  };
}

export type Verdict =
  | { kind: "same" }
  | { kind: "changed"; expected: string; actual: string; diff: string; detail: string }
  | { kind: "unverified"; reason: string };

/** The path of the attachment whose name ends `-<kind>.png`, or undefined. */
function imageOf(test: ReportedTest, kind: "expected" | "actual" | "diff"): string | undefined {
  return test.attachments.find((attachment) => attachment.name.endsWith(`-${kind}.png`))?.path;
}

/** A failed test's class: changed when it carries the three images, else unverified. */
function failed(test: ReportedTest): Verdict {
  const expected = imageOf(test, "expected");
  const actual = imageOf(test, "actual");
  const diff = imageOf(test, "diff");
  if (expected === undefined || actual === undefined || diff === undefined) {
    return { kind: "unverified", reason: "failed without the three images" };
  }
  return { kind: "changed", expected, actual, diff, detail: changeDetail(test.message) };
}

/** One view's class: unverified without a reference or a second result, same when the second pass passed, changed
 *  when it failed with the three images, else unverified. `referenced` is whether the first pass's test of the view is "expected" and its
 *  reference file exists. */
export function judge(referenced: boolean, second: ReportedTest | undefined): Verdict {
  if (!referenced) return { kind: "unverified", reason: "the first pass wrote no reference" };
  if (second === undefined) return { kind: "unverified", reason: "no result in the second pass" };
  if (second.status === "expected") return { kind: "same" };
  if (second.status === "unexpected") return failed(second);
  return { kind: "unverified", reason: `status ${second.status}` };
}

/** "57668 pixels differ, 327×2957 px before, 351×1930 px after", "2524 pixels differ",
 *  "327×230 px before, 327×231 px after" (Playwright gives the sizes without a count when only the size
 *  differs), or "changed", read from Playwright's message with its ANSI codes removed. Not exported: judge
 *  is its one user. */
function changeDetail(message: string): string {
  const plain = message.replace(ANSI, "");
  const count = /(\d+) pixels \(ratio [\d.]+ of all image pixels\) are different/.exec(plain);
  const sizes = /Expected an image (\d+)px by (\d+)px, received (\d+)px by (\d+)px/.exec(plain);
  const parts = [
    ...(count === null ? [] : [`${count[1]} pixels differ`]),
    ...(sizes === null ? [] : [`${sizes[1]}×${sizes[2]} px before, ${sizes[3]}×${sizes[4]} px after`]),
  ];
  return parts.length === 0 ? "changed" : parts.join(", ");
}

export interface Summary {
  base: string;
  commit: string;
  dirty: boolean;
  hashes: { before: string; after: string };
  same: boolean; // the two hashes are equal, so no view was photographed
  engines: readonly Engine[];
  views: number;
  changed: string[]; // "<engine> <view> <part>: <detail>"
  added: string[];
  removed: string[];
  unverified: string[]; // "<engine> <view> <part>: <reason>"
}

/** A section of the summary: its heading, then its lines as a list; null when it has no line. */
function listed(heading: string, lines: string[], preface: string[] = []): string | null {
  if (lines.length === 0) return null;
  return [`## ${heading}`, ...preface, lines.map((line) => `- ${line}`).join("\n")].join("\n\n");
}

export function summaryText(summary: Summary): string {
  const { hashes, same } = summary;
  const head = [
    `- Before: ${summary.commit}, where HEAD left ${summary.base}`,
    `- After: the working tree, ${summary.dirty ? "with uncommitted changes" : "with no uncommitted change"}`,
    `- before.html SHA-256: ${hashes.before}`,
    `- after.html SHA-256: ${hashes.after}`,
    ...(same ? ["- The two reports are byte for byte the same, so no view was photographed."] : []),
    `- Engines: ${summary.engines.join(", ")}`,
    `- Views owed: ${summary.views}`,
  ];
  const sections = [
    "# Report comparison",
    head.join("\n"),
    listed(`Changed views: ${summary.changed.length}`, summary.changed.length === 0 ? ["none"] : summary.changed),
    listed("Parts added", summary.added),
    listed("Parts removed", summary.removed),
    listed(`Unverified views: ${summary.unverified.length}`, summary.unverified, ["The comparison is incomplete."]),
    summary.views === 0 ? "## Nothing compared\n\nThe comparison is incomplete.\n\nNo part of the report is on both sides, so nothing was compared." : null,
  ];
  return sections.filter((section) => section !== null).join("\n\n") + "\n";
}
