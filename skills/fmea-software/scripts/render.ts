import { join } from "node:path";
import { ScriptError, formatError } from "./lib/codes.ts";
import type { Chain, Element, FmeaDocument, Ratings, Factor } from "./lib/types.ts";
import type { PriorityTable } from "./lib/table.ts";
import { loadTable } from "./lib/table.ts";
import { checkSchema } from "./lib/schema.ts";
import { checkPriorities } from "./lib/invariants.ts";
import { escapeHtml, escapeJsonForScript } from "./lib/escape.ts";
import { parseArgs } from "./lib/args.ts";
import { assertExtension, assertWritable, readJsonFile, readTextFile, writeFileAtomic } from "./lib/io.ts";
import { isEntry, run } from "./lib/cli.ts";
import { buildReportModel } from "./lib/report-model.ts";
import type { ActionRow, Attention, CheckGroup, GroupLocation, PlacedFinding, RankStyle, ReportModel, RowMark, RowModel, Tiles, Where } from "./lib/report-model.ts";

export { sortChains } from "./lib/report-model.ts";

export const TEMPLATE_PATH: string = join(import.meta.dirname, "..", "assets", "report-template.html");

const FACTORS: Factor[] = ["S", "O", "D"];
const SLOTS = ["title", "header", "ground-rules", "assumptions", "reviews", "structure", "chains", "actions", "lints", "provenance", "data"] as const;

const KEY_TEXT: Record<"sod" | "priority" | "rpn" | RowMark | "warning", string> = {
  sod: "Severity, Occurrence and Detection, each rated 1 to 10 against the scales. Higher is worse: more harm, more likely, caught later or not at all.",
  priority: "Priority, highest first, looked up from S, O and D in the priority table. Rows are sorted by it.",
  rpn: "S × O × D, kept for comparison with older sheets. It is not used to rank rows.",
  provisional: "At least one rating on the row was suggested during the analysis and has not been re-scored by a named reviewer, so the row's priority is not final.",
  stale: "The design or the scales changed after the row was rated; the row is due to be rated again.",
  handoff: "A cause is an attacker; the row is handed to threat modelling.",
  blocker: "The row, or the analysis as a whole, fails an automated check and cannot be relied on until it is fixed. See Automated checks.",
  warning: "An automated check found something for a reviewer to judge; it may be acceptable as it stands.",
};
const TILE_LABEL = { priorities: "Rows by priority", ratings: "Ratings not yet reviewed", checks: "Automated checks", actions: "Actions", score: "Quality score" };
const SCORE_LINE = "share of rows with no blocker";
const ATTENTION_TITLE = "Needs attention";
const NEXT_ACTIONS_LABEL = "Next actions due";
const ATTENTION_WHY = {
  blockers: "A blocker is an automated check that must pass before the row, or the analysis as a whole, can be relied on. Fix it, then validate again.",
  stale: "A stale row was rated before the design or the scales changed. Its ratings describe the earlier state until it is rated again.",
  provisional: "A provisional rating was suggested during the analysis and no named reviewer has re-scored it yet. The priority of these rows is not final until one does.",
  handoffs: "A handoff row has an attacker as a cause. It is recorded here and handed to threat modelling, which owns the countermeasure.",
  nextActions: "The open actions with the earliest target dates, three at most. All actions are listed under Actions.",
};
const NOTHING_NEEDS_ATTENTION = "Nothing needs attention: no blocker, no stale row, no provisional rating, no handoff and no open action.";
const CONTENTS: [string, string][] = [
  ["ground-rules", "Ground rules"], ["assumptions", "Assumptions"], ["reviews", "Review record"], ["structure", "Structure"],
  ["chains", "Failure chains"], ["actions", "Actions"], ["lints", "Automated checks"], ["provenance", "Provenance"],
];

function e(s: string): string { return escapeHtml(s); }

function list(items: string[], emptyText: string): string {
  if (items.length === 0) return `<p class="empty">${e(emptyText)}</p>`;
  return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

/** A table in a frame that scrolls sideways on its own, takes focus and carries a label no other frame shares (§4.1). */
function frameHtml(label: string, tableHtml: string): string {
  return `<div class="frame" tabindex="0" role="region" aria-label="${e(label)}">${tableHtml}</div>`;
}

/** A table's caption as a paragraph above its frame; the table names itself from it with aria-labelledby. */
function captionHtml(id: string, text: string): string {
  return `<p class="caption" id="${e(id)}">${e(text)}</p>`;
}

function badgeHtml(value: string, style: RankStyle): string {
  return `<span class="pri pri-${style}">${e(value)}</span>`;
}

function markHtml(name: RowMark | "warning" | "trigger" | "adversarial"): string {
  if (name === "trigger" || name === "adversarial") return `<span class="mark mark-${name}">${name}</span>`;
  return `<span class="mark mark-${name}" title="${e(KEY_TEXT[name])}">${name}</span>`;
}

function rowLinkHtml(chainId: string): string {
  return `<a href="#row-${e(chainId)}"><code>${e(chainId)}</code></a>`;
}

function labelHtml(label: string, raw: boolean): string {
  return raw ? `<code>${e(label)}</code>` : e(label);
}

function whereHtml(where: Where): string {
  if (where.kind === "unknown-row") return `unknown row <code>${e(where.pointer)}</code>`;
  if (where.kind === "document") return `document <code>${e(where.pointer)}</code>`;
  return where.label === null ? rowLinkHtml(where.chainId) : `${rowLinkHtml(where.chainId)} ${labelHtml(where.label, where.raw)}`;
}

function tilesHtml(t: Tiles): string {
  const counts = t.priorities.map((p) => `<span class="pcount">${badgeHtml(p.value, p.style)}${p.count}</span>`).join("");
  const actionsBig = t.actions.of === null ? e(t.actions.headline) : `${e(t.actions.headline)} <small>${e(t.actions.of)}</small>`;
  const actionsSub = t.actions.line === null ? "" : `<span class="sub">${e(t.actions.line)}</span>`;
  const score = t.qualityScore === null ? "&mdash;" : `${t.qualityScore} <small>of 100</small>`;
  return `<div class="tiles">` +
    `<a class="tile" href="#chains"><span class="lbl">${e(TILE_LABEL.priorities)}</span><span class="pcounts">${counts}</span><span class="sub">${e(t.chainsLine)}</span></a>` +
    `<a class="tile" href="#chains"><span class="lbl">${e(TILE_LABEL.ratings)}</span><span class="big">${t.ratings.provisional} <small>of ${t.ratings.total}</small></span><span class="sub">${e(t.ratings.line)}</span></a>` +
    `<a class="tile${t.checks.alert ? " alert" : ""}" href="#lints"><span class="lbl">${e(TILE_LABEL.checks)}</span><span class="big">${e(t.checks.blockers)}</span><span class="sub">${e(t.checks.warnings)}</span></a>` +
    `<a class="tile" href="#actions"><span class="lbl">${e(TILE_LABEL.actions)}</span><span class="big">${actionsBig}</span>${actionsSub}</a>` +
    `<a class="tile" href="#lints"><span class="lbl">${e(TILE_LABEL.score)}</span><span class="big">${score}</span><span class="sub">${e(SCORE_LINE)}</span></a>` +
    `</div>`;
}

function attentionItemHtml(what: string, mark: RowMark | null, entries: string[], separator: string, why: string): string {
  const markPart = mark === null ? "" : `<br>${markHtml(mark)}`;
  return `<div class="attn-item"><div class="what">${e(what)}${markPart}</div><div>${entries.join(separator)} <span class="why">${e(why)}</span></div></div>`;
}

const DOT = " &middot; ";

function blockerEntries(lines: PlacedFinding[]): string[] {
  return lines.map((f) => `${whereHtml(f.where)} &mdash; ${e(f.message)}`);
}

function staleEntries(rows: { chainId: string; reason: string | null }[]): string[] {
  return rows.map((r) => (r.reason === null ? rowLinkHtml(r.chainId) : `${rowLinkHtml(r.chainId)} ${e(r.reason)}`));
}

function provisionalEntries(rows: { chainId: string; factors: string[] }[]): string[] {
  return rows.map((r) => `${rowLinkHtml(r.chainId)} ${e(r.factors.join(", "))}`);
}

function handoffEntries(rows: { chainId: string; failureMode: string }[]): string[] {
  return rows.map((r) => `${rowLinkHtml(r.chainId)} ${e(r.failureMode)}`);
}

function nextActionEntries(rows: ActionRow[]): string[] {
  return rows.map(({ chainId, action }) => `${e(action.target_date)} ${rowLinkHtml(chainId)} ${e(action.id)}, ${e(action.owner)}`);
}

function attentionItems(a: Attention): string[] {
  const items: string[] = [];
  if (a.blockers) items.push(attentionItemHtml(a.blockers.label, "blocker", blockerEntries(a.blockers.lines), "<br>", ATTENTION_WHY.blockers));
  if (a.stale) items.push(attentionItemHtml(a.stale.label, "stale", staleEntries(a.stale.rows), DOT, ATTENTION_WHY.stale));
  if (a.provisional) items.push(attentionItemHtml(a.provisional.label, "provisional", provisionalEntries(a.provisional.rows), DOT, ATTENTION_WHY.provisional));
  if (a.handoffs) items.push(attentionItemHtml(a.handoffs.label, "handoff", handoffEntries(a.handoffs.rows), DOT, ATTENTION_WHY.handoffs));
  if (a.nextActions.length > 0) items.push(attentionItemHtml(NEXT_ACTIONS_LABEL, null, nextActionEntries(a.nextActions), DOT, ATTENTION_WHY.nextActions));
  return items;
}

function attentionHtml(a: Attention): string {
  const items = attentionItems(a);
  const body = items.length === 0 ? `<p class="attn-none">${e(NOTHING_NEEDS_ATTENTION)}</p>` : items.join("");
  return `<div class="attn"><h2 class="attn-title">${e(ATTENTION_TITLE)}</h2>${body}</div>`;
}

function contentsHtml(): string {
  return `<p class="toc"><b>Contents</b>${CONTENTS.map(([id, label]) => `<a href="#${e(id)}">${e(label)}</a>`).join("")}</p>`;
}

function headerHtml(doc: FmeaDocument, model: ReportModel): string {
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
  return `<h1>${e(m.name)}</h1>\n<dl class="header">${rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${v}</dd>`).join("")}</dl>\n${tilesHtml(model.tiles)}\n${attentionHtml(model.attention)}\n${contentsHtml()}`;
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

function marksHtml(marks: readonly RowMark[]): string {
  return marks.map(markHtml).join(" ");
}

function keyHtml(vocabulary: ReportModel["vocabulary"]): string {
  const badges = vocabulary.map((v) => badgeHtml(v.value, v.style)).join(" ");
  const marks: (RowMark | "warning")[] = ["provisional", "stale", "handoff", "blocker", "warning"];
  const entries: [string, string][] = [
    ["<b>S</b>, <b>O</b>, <b>D</b>", KEY_TEXT.sod],
    [badges, KEY_TEXT.priority],
    ["<b>RPN</b>", KEY_TEXT.rpn],
    ...marks.map((m): [string, string] => [markHtml(m), KEY_TEXT[m]]),
  ];
  return `<div class="key"><h3 class="key-title">How to read this table</h3><dl>${entries.map(([dt, dd]) => `<dt>${dt}</dt><dd>${e(dd)}</dd>`).join("")}</dl></div>`;
}

function actionsCellHtml(cell: RowModel["actionsCell"]): string {
  if (cell.due === null) return `<td class="nw muted">${e(cell.text)}</td>`;
  return `<td class="nw">${e(cell.text)}<br><span class="muted">due ${e(cell.due)}</span></td>`;
}

function indexRowHtml(row: RowModel): string {
  const c = row.chain;
  const marks = row.marks.length === 0 ? "" : `<br>${marksHtml(row.marks)}`;
  return `<tr><td>${badgeHtml(c.priority.value, row.style)}</td><td class="nw">${rowLinkHtml(c.id)}${marks}</td><td><code>${e(row.element)}</code></td>` +
    `<td>${e(c.failure_mode)}</td><td>${e(c.effects.end)}</td>` +
    `<td class="num">${c.ratings.S.value}</td><td class="num">${c.ratings.O.value}</td><td class="num">${c.ratings.D.value}</td><td class="num">${c.priority.rpn}</td>` +
    `${actionsCellHtml(row.actionsCell)}</tr>`;
}

const INDEX_CAPTION = "Rows are sorted by the pre-action priority, then by severity; a row keeps its place after actions. A row id links to the row's full section below.";

function indexHtml(rows: RowModel[]): string {
  const sod = FACTORS.map((f) => `<th class="num"><abbr title="${e(KEY_TEXT.sod)}">${f}</abbr></th>`).join("");
  const head = `<thead><tr><th><abbr title="${e(KEY_TEXT.priority)}">Priority</abbr></th><th>Row</th><th>Element</th><th>Failure mode</th><th>End effect</th>` +
    `${sod}<th class="num"><abbr title="${e(KEY_TEXT.rpn)}">RPN</abbr></th><th>Actions</th></tr></thead>`;
  return captionHtml("index-caption", INDEX_CAPTION) +
    frameHtml("Index of failure chains", `<table class="index" aria-labelledby="index-caption">${head}<tbody>${rows.map(indexRowHtml).join("")}</tbody></table>`);
}

function part(label: string, body: string): string {
  return `<div><span class="lbl">${e(label)}</span>${body}</div>`;
}

function rowHeaderHtml(row: RowModel): string {
  const c = row.chain;
  const marks = row.marks.length === 0 ? "" : ` &middot; ${marksHtml(row.marks)}`;
  const post = c.post_priority && row.postStyle !== null
    ? `<br><span class="muted">after actions:</span> ${badgeHtml(c.post_priority.value, row.postStyle)} <span class="muted">RPN ${c.post_priority.rpn}</span>`
    : "";
  return `<header>${badgeHtml(c.priority.value, row.style)}<h3><code>${e(c.id)}</code>&nbsp; ${e(c.failure_mode)}</h3><div class="meta"><code>${e(row.element)}</code><br>` +
    `S <b>${c.ratings.S.value}</b> &middot; O <b>${c.ratings.O.value}</b> &middot; D <b>${c.ratings.D.value}</b> &middot; <span class="muted">RPN ${c.priority.rpn}</span>${marks}${post}</div></header>`;
}

function findingHtml(finding: PlacedFinding): string {
  const where = finding.where;
  const label = where.kind === "row" && where.label !== null ? `${labelHtml(where.label, where.raw)} &mdash; ` : "";
  const cls = finding.severity === "blocker" ? "finding" : "finding warn";
  return `<p class="${cls}">${markHtml(finding.severity)} &nbsp;${label}${e(finding.message)} <span class="muted"><code>${e(finding.rule)}</code></span></p>`;
}

function effectsHtml(chain: Chain): string {
  const box = (cls: string, label: string, text: string): string => `<div class="${cls}"><span class="lbl">${e(label)}</span>${e(text)}</div>`;
  const arrow = `<div class="arrow">&rarr;</div>`;
  return `<div class="fx">${box("box", "Local", chain.effects.local)}${arrow}${box("box", "Next level", chain.effects.next_level)}${arrow}${box("box end", "End", chain.effects.end)}</div>`;
}

function causesHtml(row: RowModel): string {
  const items = row.chain.causes.map((c, i) => {
    const origin = c.origin ? ` <span class="muted">[${e(c.origin)}]</span>` : "";
    const adversarial = c.adversarial ? ` ${markHtml("adversarial")}` : "";
    const trigger = row.triggerCauses.includes(i) ? ` ${markHtml("trigger")}` : "";
    return `${e(c.text)}${origin}${adversarial}${trigger}`;
  });
  return part("Causes", list(items, "No causes recorded."));
}

function controlsHtml(chain: Chain): string {
  const items = chain.controls.map((c) => `<b>${e(c.kind)}</b> &mdash; ${e(c.description)} <span class="muted">(${e(c.status)}, evidence ${e(c.evidence.kind)}${c.evidence.ref ? ` <code>${e(c.evidence.ref)}</code>` : ""})</span>`);
  return part("Controls", list(items, "No controls recorded."));
}

function reviewHtml(review: Ratings[Factor]["review"]): string {
  if (review.status === "provisional") return markHtml("provisional");
  return review.by && review.date ? `${e(review.status)} by ${e(review.by)} on ${e(review.date)}` : e(review.status);
}

function ratingsTableHtml(label: string, ratings: Ratings, before?: Ratings): string {
  const rows = FACTORS.map((f) => {
    const r = ratings[f];
    const was = before && before[f].value !== r.value ? ` <span class="muted">(was ${before[f].value})</span>` : "";
    return `<tr><th>${f}</th><td class="num">${r.value}${was}</td><td>${e(r.rationale)}</td><td>${e(r.evidence_kind)}${r.evidence_ref ? ` <code>${e(r.evidence_ref)}</code>` : ""}</td><td>${reviewHtml(r.review)}</td></tr>`;
  }).join("");
  return frameHtml(label, `<table><tr><th>Factor</th><th class="num">Value</th><th>Rationale</th><th>Evidence</th><th>Review</th></tr>${rows}</table>`);
}

function postRatingsHtml(chain: Chain): string {
  if (!chain.post_ratings) return "";
  const label = chain.post_priority ? `Post-action ratings — priority ${chain.post_priority.value}, RPN ${chain.post_priority.rpn}` : "Post-action ratings";
  return part(label, ratingsTableHtml(`Ratings of ${chain.id} after actions`, chain.post_ratings, chain.ratings));
}

function rowActionsHtml(chain: Chain): string {
  const items = chain.actions.map((a) => {
    const completed = a.completed_date ? `, completed ${e(a.completed_date)}` : "";
    const incident = a.source_incident ? `, incident <code>${e(a.source_incident)}</code>` : "";
    return `<code>${e(a.id)}</code> ${e(a.description)} <span class="muted">(${e(a.owner)}, ${e(a.status)}, target ${e(a.target_date)}${completed}${incident})</span>`;
  });
  return part("Actions", list(items, "No actions on this row."));
}

function gridHtml(row: RowModel): string {
  const c = row.chain;
  return [
    c.handoff ? part("Handoff", `<b>${e(c.handoff.to)}</b> &mdash; ${e(c.handoff.reason)} <span class="muted">(adversary cause: ${e(c.handoff.adversary_cause)})</span>`) : "",
    part("Function", e(row.statement)),
    c.source_incident ? part("Seeded from incident", `<code>${e(c.source_incident)}</code>`) : "",
    part("Effects", effectsHtml(c)),
    row.trigger === null ? "" : part("Trigger", e(row.trigger)),
    `<div class="two">${causesHtml(row)}${controlsHtml(c)}</div>`,
    part("Ratings", ratingsTableHtml(`Ratings of ${c.id}`, c.ratings)),
    postRatingsHtml(c),
    rowActionsHtml(c),
    c.history.length === 0 ? "" : part("Row history", list(c.history.map((h) => `v${h.version} ${e(h.date)} &mdash; ${e(h.change)}`), "")),
  ].join("");
}

function rowSectionHtml(row: RowModel): string {
  const stale = row.staleNotice === null ? "" : `<p class="stale-notice">${e(row.staleNotice)}</p>`;
  return `<article class="row" id="row-${e(row.chain.id)}">${rowHeaderHtml(row)}${row.findings.map(findingHtml).join("")}${stale}` +
    `<div class="grid">${gridHtml(row)}</div><p class="back"><a href="#chains">&uarr; index</a></p></article>`;
}

function chainsHtml(model: ReportModel): string {
  if (model.rows.length === 0) return `<p class="empty">No chains.</p>`;
  return keyHtml(model.vocabulary) + indexHtml(model.rows) + model.rows.map(rowSectionHtml).join("");
}

const ACTIONS_CAPTION = "Open actions first, by target date; closed actions last.";

function actionRowHtml({ chainId, action, open }: ActionRow): string {
  const completed = action.completed_date ? `<td class="nw">${e(action.completed_date)}</td>` : "<td>&mdash;</td>";
  return `${open ? "<tr>" : '<tr class="done">'}<td class="nw">${e(action.target_date)}</td><td>${rowLinkHtml(chainId)}</td><td><code>${e(action.id)}</code></td>` +
    `<td>${e(action.description)}</td><td>${e(action.owner)}</td><td>${e(action.status)}</td>${completed}</tr>`;
}

function actionsHtml(actions: ActionRow[]): string {
  if (actions.length === 0) return `<p class="empty">No actions.</p>`;
  const head = `<thead><tr><th>Target</th><th>Row</th><th>Action</th><th>Description</th><th>Owner</th><th>Status</th><th>Completed</th></tr></thead>`;
  return captionHtml("actions-caption", ACTIONS_CAPTION) +
    frameHtml("Actions", `<table aria-labelledby="actions-caption">${head}<tbody>${actions.map(actionRowHtml).join("")}</tbody></table>`);
}

const CHECKS_INTRO: [string, string, string] = [
  "Each time the analysis is saved, a validator script checks it against the skill's rules and records what it finds here. A ",
  " must be fixed before the row it names, or the analysis as a whole, can be relied on. A ",
  " is for a reviewer to judge and may be acceptable as it stands.",
];
const SCORE_NOTE = "— the share of chain rows with no blocker, or 0 when a blocker concerns the analysis as a whole rather than a row, or the analysis has no rows. The weighting is the skill's own.";
const CHECKS_CAPTION = "Blockers first. Findings with the same rule and message share a line; each row location links to its row.";

function locationHtml(location: GroupLocation): string {
  if (location.kind === "unknown-row") return `unknown row <code>${e(location.pointer)}</code>`;
  if (location.kind === "document") return `document <code>${e(location.pointer)}</code>`;
  if (location.labels.length === 0) return rowLinkHtml(location.chainId);
  return `${rowLinkHtml(location.chainId)} ${location.labels.map((l) => labelHtml(l.text, l.raw)).join(", ")}`;
}

function checkRowHtml(group: CheckGroup): string {
  const count = group.count > 1 ? ` <span class="muted">${e(`×${group.count}`)}</span>` : "";
  return `<tr><td>${markHtml(group.severity)}</td><td><code>${e(group.rule)}</code>${count}</td>` +
    `<td class="nw">${group.locations.map(locationHtml).join("<br>")}</td><td>${e(group.message)}</td></tr>`;
}

function checksHtml(groups: CheckGroup[], qualityScore: number | null): string {
  if (qualityScore === null) return `<p class="empty">No computed block.</p>`;
  const [before, middle, after] = CHECKS_INTRO;
  const intro = `<p>${e(before)}${markHtml("blocker")}${e(middle)}${markHtml("warning")}${e(after)}</p>`;
  const score = `<p><strong>Quality score: ${qualityScore} of 100</strong> <span class="muted">${e(SCORE_NOTE)}</span></p>`;
  if (groups.length === 0) return `${intro}${score}<p class="empty">No findings.</p>`;
  const head = `<thead><tr><th>Severity</th><th>Rule</th><th>Where</th><th>Finding</th></tr></thead>`;
  return intro + score + captionHtml("checks-caption", CHECKS_CAPTION) +
    frameHtml("Automated checks", `<table aria-labelledby="checks-caption">${head}<tbody>${groups.map(checkRowHtml).join("")}</tbody></table>`);
}

function provenanceHtml(doc: FmeaDocument): string {
  const rows: string[] = [];
  for (const chain of doc.chains) {
    for (const ref of chain.catalog_refs) {
      const record = /C[0-9]{3}/.exec(ref.provenance);
      rows.push(`<tr><td>${rowLinkHtml(chain.id)}</td><td><code>${e(ref.id)}</code></td><td><code>${e(ref.provenance)}</code></td><td>${record ? `<code>${e(record[0])}</code>` : "&mdash;"}</td></tr>`);
    }
  }
  if (rows.length === 0) return `<p class="empty">No catalog references.</p>`;
  return frameHtml("Provenance", `<table><thead><tr><th>Row</th><th>Catalog row</th><th>Tag</th><th>Record</th></tr></thead><tbody>${rows.join("")}</tbody></table>`);
}

export function renderHtml(doc: FmeaDocument, table: PriorityTable, template: string): string {
  const model = buildReportModel(doc, table);
  const values: Record<(typeof SLOTS)[number], string> = {
    title: e(doc.meta.name),
    header: headerHtml(doc, model),
    "ground-rules": list(doc.meta.ground_rules.map(e), "No ground rules recorded."),
    assumptions: list(doc.meta.assumptions.map((a) => `${e(a.text)} <span class="empty">(${e(a.owner)}, ${e(a.status)})</span>`), "No assumptions recorded."),
    reviews: list(doc.meta.reviews.map((r) => `${e(r.date)} &mdash; ${r.reviewers.map(e).join(", ")} &mdash; ${e(r.outcome)}`), "No reviews recorded."),
    structure: structureHtml(doc.elements),
    chains: chainsHtml(model),
    actions: actionsHtml(model.actions),
    lints: checksHtml(model.groups, model.tiles.qualityScore),
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
