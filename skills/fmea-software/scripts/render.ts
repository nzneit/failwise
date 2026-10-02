import { join } from "node:path";
import { ScriptError, formatError } from "./lib/codes.ts";
import type { Action, Chain, Element, FmeaDocument, Lint, Priority, Ratings, Factor } from "./lib/types.ts";
import type { PriorityTable } from "./lib/table.ts";
import { loadTable, vocabularyRank } from "./lib/table.ts";
import { checkSchema } from "./lib/schema.ts";
import { checkPriorities } from "./lib/invariants.ts";
import { escapeHtml, escapeJsonForScript } from "./lib/escape.ts";
import { parseArgs } from "./lib/args.ts";
import { assertExtension, assertWritable, readJsonFile, readTextFile, writeFileAtomic } from "./lib/io.ts";
import { isEntry, run } from "./lib/cli.ts";

export const TEMPLATE_PATH: string = join(import.meta.dirname, "..", "assets", "report-template.html");

const FACTORS: Factor[] = ["S", "O", "D"];
const SLOTS = ["title", "header", "ground-rules", "assumptions", "reviews", "structure", "chains", "actions", "lints", "provenance", "data"] as const;

function e(s: string): string { return escapeHtml(s); }

function list(items: string[], emptyText: string): string {
  if (items.length === 0) return `<p class="empty">${e(emptyText)}</p>`;
  return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

function headerHtml(doc: FmeaDocument, provisional: number, total: number): string {
  const m = doc.meta;
  const rows: [string, string][] = [
    ["Version", String(m.version)],
    ["Branch", e(m.branch)],
    ["Scope", e(m.scope)],
    ["In boundary", m.boundary.included.map(e).join("; ")],
    ["Out of boundary", m.boundary.excluded.length === 0 ? "&mdash;" : m.boundary.excluded.map(e).join("; ")],
    ["Security boundary", e(m.boundary.security)],
    ["Scales version", String(m.scales.version)],
    ["Priority table", `<code>${e(m.scales.priority_table)}</code>`],
    ["Created", e(m.created)],
    ["Updated", e(m.updated)],
  ];
  return `<h1>${e(m.name)}</h1>\n<dl class="header">${rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${v}</dd>`).join("")}</dl>\n<p class="provisional-count">${provisional} of ${total} ratings provisional</p>`;
}

function structureHtml(elements: Element[]): string {
  const children = (parent: string | null): Element[] => elements.filter((el) => el.parent === parent);
  const node = (el: Element): string => {
    const dep = el.dependency
      ? ` <span class="empty">(${e(el.dependency.strength)} dependency${el.dependency.sla ? `, SLA ${e(el.dependency.sla)}` : ""}${el.dependency.limits ? `, limits ${e(el.dependency.limits)}` : ""})</span>`
      : "";
    const kids = children(el.id);
    return `<li><code>${e(el.id)}</code> &mdash; ${e(el.name)} <span class="empty">[${e(el.kind)}]</span>${dep}${el.description ? `<div>${e(el.description)}</div>` : ""}${kids.length > 0 ? `<ul class="tree">${kids.map(node).join("")}</ul>` : ""}</li>`;
  };
  const roots = children(null);
  if (roots.length === 0) return `<p class="empty">No elements.</p>`;
  return `<ul class="tree">${roots.map(node).join("")}</ul>`;
}

// The rating blocks a row carries: `ratings` always, and `post_ratings` once the row has been
// re-scored after a completed action. Both count, for the header's provisional line and for the
// row's provisional mark alike, so a post-action priority is never shown without the caveat that
// the ratings under it are unreviewed (§5 step 5, §9).
function ratingBlocks(chain: Chain): Ratings[] {
  return chain.post_ratings ? [chain.ratings, chain.post_ratings] : [chain.ratings];
}

function provisionalCount(chain: Chain): number {
  let n = 0;
  for (const ratings of ratingBlocks(chain)) {
    for (const f of FACTORS) if (ratings[f].review.status === "provisional") n++;
  }
  return n;
}

function marksHtml(chain: Chain): string {
  let out = "";
  if (chain.stale.flag) out += `<span class="mark mark-stale">stale</span>`;
  if (chain.handoff) out += `<span class="mark mark-handoff">handoff</span>`;
  if (provisionalCount(chain) > 0) out += `<span class="mark mark-provisional">provisional</span>`;
  return out;
}

// `priority` is the block computed from these ratings, given only for the post-action ratings:
// the letter and the RPN save the reader a table lookup (§6). The pre-action priority already
// has its own column in the chain table, so the pre-action block passes none.
function ratingsHtml(ratings: Ratings, caption: string, priority?: Priority): string {
  const rows = FACTORS.map((f) => {
    const r = ratings[f];
    const review = r.review.by && r.review.date ? `${e(r.review.status)} by ${e(r.review.by)} on ${e(r.review.date)}` : e(r.review.status);
    return `<tr><th>${f}</th><td class="num">${r.value}</td><td>${e(r.rationale)}</td><td>${e(r.evidence_kind)}${r.evidence_ref ? ` <code>${e(r.evidence_ref)}</code>` : ""}</td><td>${review}</td></tr>`;
  }).join("");
  const line = priority ? `<p>Priority ${e(priority.value)} &mdash; RPN ${priority.rpn}</p>` : "";
  return `<h3>${e(caption)}</h3>${line}<table><tr><th>Factor</th><th>Value</th><th>Rationale</th><th>Evidence</th><th>Review</th></tr>${rows}</table>`;
}

function chainDetailHtml(chain: Chain): string {
  const causes = list(chain.causes.map((c) => `${e(c.text)}${c.origin ? ` <span class="empty">[${e(c.origin)}]</span>` : ""}${c.adversarial ? ` <span class="mark mark-adversarial">adversarial</span>` : ""}`), "No causes recorded.");
  const controls = list(chain.controls.map((c) => `<strong>${e(c.kind)}</strong> &mdash; ${e(c.description)} <span class="empty">(${e(c.status)}, evidence ${e(c.evidence.kind)}${c.evidence.ref ? ` <code>${e(c.evidence.ref)}</code>` : ""})</span>`), "No controls recorded.");
  const actions = list(chain.actions.map((a) => `<code>${e(a.id)}</code> ${e(a.description)} <span class="empty">(${e(a.owner)}, ${e(a.status)}, target ${e(a.target_date)}${a.completed_date ? `, completed ${e(a.completed_date)}` : ""})</span>`), "No actions on this row.");
  const history = list(chain.history.map((h) => `v${h.version} ${e(h.date)} &mdash; ${e(h.change)}`), "No row history.");
  return [
    `<h3>Trigger</h3>${chain.trigger && chain.trigger.trim() !== "" ? `<p>${e(chain.trigger)}</p>` : `<p class="empty">No trigger recorded.</p>`}`,
    `<h3>Causes</h3>${causes}`,
    `<h3>Controls</h3>${controls}`,
    ratingsHtml(chain.ratings, "Ratings"),
    chain.post_ratings ? ratingsHtml(chain.post_ratings, "Post-action ratings", chain.post_priority) : "",
    `<h3>Actions</h3>${actions}`,
    chain.handoff ? `<h3>Handoff</h3><p>${e(chain.handoff.to)} &mdash; ${e(chain.handoff.reason)} <span class="empty">(adversary cause: ${e(chain.handoff.adversary_cause)})</span></p>` : "",
    `<h3>Row history</h3>${history}`,
  ].join("");
}

export function sortChains(doc: FmeaDocument, table: PriorityTable): Chain[] {
  return [...doc.chains].sort((a, b) => {
    const rank = vocabularyRank(table, a.priority.value) - vocabularyRank(table, b.priority.value);
    if (rank !== 0) return rank;
    const sev = b.ratings.S.value - a.ratings.S.value;
    if (sev !== 0) return sev;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function chainsHtml(doc: FmeaDocument, table: PriorityTable): string {
  const fnById = new Map(doc.functions.map((f) => [f.id, f]));
  const rows = sortChains(doc, table).map((chain) => {
    const fn = fnById.get(chain.function);
    const element = fn ? fn.element : "";
    const statement = fn ? fn.statement : "";
    const head = `<tr><td><code>${e(chain.id)}</code>${marksHtml(chain)}</td><td><code>${e(element)}</code></td><td>${e(statement)}</td><td>${e(chain.failure_mode)}</td>` +
      `<td>${e(chain.effects.local)}</td><td>${e(chain.effects.next_level)}</td><td>${e(chain.effects.end)}</td>` +
      `<td class="num">${chain.ratings.S.value}</td><td class="num">${chain.ratings.O.value}</td><td class="num">${chain.ratings.D.value}</td>` +
      `<td>${e(chain.priority.value)}</td><td class="num">${chain.priority.rpn}</td></tr>`;
    const detail = `<tr><td colspan="12"><details><summary>Row detail for ${e(chain.id)}</summary>${chainDetailHtml(chain)}</details></td></tr>`;
    return head + detail;
  }).join("");
  if (doc.chains.length === 0) return `<p class="empty">No chains.</p>`;
  return `<table><caption>Rows are sorted by the pre-action priority, then by severity; a row keeps its place after actions.</caption><tr><th>Row</th><th>Element</th><th>Function</th><th>Failure mode</th><th>Local effect</th><th>Next level</th><th>End effect</th><th>S</th><th>O</th><th>D</th><th>Priority</th><th>RPN</th></tr>${rows}</table>`;
}

function actionsHtml(doc: FmeaDocument): string {
  const rows: string[] = [];
  for (const chain of doc.chains) {
    for (const a of chain.actions as Action[]) {
      rows.push(`<tr><td><code>${e(chain.id)}</code></td><td><code>${e(a.id)}</code></td><td>${e(a.description)}</td><td>${e(a.owner)}</td><td>${e(a.status)}</td><td>${e(a.target_date)}</td><td>${a.completed_date ? e(a.completed_date) : "&mdash;"}</td></tr>`);
    }
  }
  if (rows.length === 0) return `<p class="empty">No actions.</p>`;
  return `<table><tr><th>Row</th><th>Action</th><th>Description</th><th>Owner</th><th>Status</th><th>Target</th><th>Completed</th></tr>${rows.join("")}</table>`;
}

function lintsHtml(doc: FmeaDocument): string {
  const computed = doc.computed;
  if (!computed) return `<p class="empty">No computed block.</p>`;
  const head = `<p><strong>Quality score: ${computed.quality_score}</strong> <span class="empty">(the share of chain rows with no blocker lint, or 0 when a blocker sits outside the chain rows; the weighting is the skill's own)</span></p>`;
  if (computed.lints.length === 0) return `${head}<p class="empty">No lint findings.</p>`;
  const rows = computed.lints.map((l: Lint) => `<tr><td><code>${e(l.rule)}</code></td><td class="sev-${e(l.severity)}">${e(l.severity)}</td><td><code>${e(l.pointer)}</code></td><td>${e(l.message)}</td></tr>`).join("");
  return `${head}<table><tr><th>Rule</th><th>Severity</th><th>Pointer</th><th>Message</th></tr>${rows}</table>`;
}

function provenanceHtml(doc: FmeaDocument): string {
  const rows: string[] = [];
  for (const chain of doc.chains) {
    for (const ref of chain.catalog_refs) {
      const record = /C[0-9]{3}/.exec(ref.provenance);
      rows.push(`<tr><td><code>${e(chain.id)}</code></td><td><code>${e(ref.id)}</code></td><td><code>${e(ref.provenance)}</code></td><td>${record ? `<code>${e(record[0])}</code>` : "&mdash;"}</td></tr>`);
    }
  }
  if (rows.length === 0) return `<p class="empty">No catalog references.</p>`;
  return `<table><tr><th>Row</th><th>Catalog row</th><th>Tag</th><th>Record</th></tr>${rows.join("")}</table>`;
}

export function renderHtml(doc: FmeaDocument, table: PriorityTable, template: string): string {
  let total = 0;
  let provisional = 0;
  for (const chain of doc.chains) {
    total += ratingBlocks(chain).length * FACTORS.length;
    provisional += provisionalCount(chain);
  }
  const values: Record<(typeof SLOTS)[number], string> = {
    title: e(doc.meta.name),
    header: headerHtml(doc, provisional, total),
    "ground-rules": list(doc.meta.ground_rules.map(e), "No ground rules recorded."),
    assumptions: list(doc.meta.assumptions.map((a) => `${e(a.text)} <span class="empty">(${e(a.owner)}, ${e(a.status)})</span>`), "No assumptions recorded."),
    reviews: list(doc.meta.reviews.map((r) => `${e(r.date)} &mdash; ${r.reviewers.map(e).join(", ")} &mdash; ${e(r.outcome)}`), "No reviews recorded."),
    structure: structureHtml(doc.elements),
    chains: chainsHtml(doc, table),
    actions: actionsHtml(doc),
    lints: lintsHtml(doc),
    provenance: provenanceHtml(doc),
    data: escapeJsonForScript(JSON.stringify(doc, null, 2)),
  };
  let html = template;
  for (const slot of SLOTS) html = html.split(`<!--@${slot}-->`).join(values[slot]);
  return html;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv, { positional: 1, flags: { out: "string", force: "boolean", "table-file": "string" } });
  const input = parsed.positional[0];
  assertExtension(input, ".json", "the analysis file");
  const out = parsed.flags.out;
  if (typeof out !== "string") throw new ScriptError("USAGE", "render.ts needs --out <report.html>");
  assertExtension(out, ".html", "the report file");
  assertWritable(out, parsed.flags.force === true);
  const raw = readJsonFile(input);
  const tableFile = typeof parsed.flags["table-file"] === "string" ? parsed.flags["table-file"] : undefined;
  const table = loadTable(tableFile);
  const schemaIssues = checkSchema(raw);
  if (schemaIssues.length > 0) {
    for (const issue of schemaIssues) process.stderr.write(formatError(issue.code, `${issue.rule}: ${issue.message}`, issue.pointer) + "\n");
    return 2;
  }
  const doc = raw as FmeaDocument;
  if (!doc.computed) throw new ScriptError("COMPUTED_MISSING", "the document has no computed block; run validate.ts --write first", "/computed");
  // The table-id check is the validator's, not a second copy of it: `checkPriorities` returns that
  // one issue and nothing else when the ids differ, so both CLIs print the same coded line, rule
  // id included. The per-row mismatch rules it returns when the ids agree are validate.ts's to
  // report, and the report never renders them.
  const tableIdMismatch = checkPriorities(doc, table).find((issue) => issue.code === "TABLE_ID_MISMATCH");
  if (tableIdMismatch) {
    process.stderr.write(formatError(tableIdMismatch.code, `${tableIdMismatch.rule}: ${tableIdMismatch.message}`, tableIdMismatch.pointer) + "\n");
    return 2;
  }
  writeFileAtomic(out, renderHtml(doc, table, readTextFile(TEMPLATE_PATH)));
  return 0;
}

if (isEntry(import.meta)) run(main);
