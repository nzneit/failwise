// The tracker-neutral item built for each action of an analysis. Pure: no tracker, no network.

import { createHash } from "node:crypto";
import { ptr } from "../pointer.ts";
import type { Action, Cause, Chain, Control, Element, Fn, FmeaDocument, Rating, TrackerConfig } from "../types.ts";
import type { Block, Section, TrackedItem } from "./provider.ts";

export interface ActionRef { key: string; pointer: string; chain: Chain; action: Action; handoff: boolean }

const TITLE_LIMIT = 100;
// The schema's `plainId` pattern (schemas/fmea.schema.json), kept identical to it.
export const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** `<meta id>/<chain id>/<action id>`: the plain-id grammar has no "/", so the key splits back. */
export function itemKey(metaId: string, chainId: string, actionId: string): string {
  return `${metaId}/${chainId}/${actionId}`;
}

/** The three ids of a key, or null when it is not three plain ids. */
export function splitKey(key: string): [string, string, string] | null {
  const parts = key.split("/");
  if (parts.length !== 3 || !parts.every((p) => PLAIN_ID.test(p))) return null;
  return [parts[0], parts[1], parts[2]];
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The first 12 hexadecimal characters of the SHA-256 of the description, whitespace collapsed. */
export function textHash(description: string): string {
  return createHash("sha256").update(collapse(description)).digest("hex").slice(0, 12);
}

/** Every action, with its key, its pointer and its row's handoff flag, in document order. */
export function actionRefs(doc: FmeaDocument): ActionRef[] {
  const refs: ActionRef[] = [];
  doc.chains.forEach((chain, i) => {
    chain.actions.forEach((action, j) => {
      refs.push({
        key: itemKey(doc.meta.id, chain.id, action.id),
        pointer: ptr("chains", i, "actions", j),
        chain,
        action,
        handoff: chain.handoff !== undefined,
      });
    });
  });
  return refs;
}

function titleOf(description: string, fallback: string): string {
  const text = collapse(description);
  if (text === "") return fallback;
  const points = Array.from(text);
  if (points.length <= TITLE_LIMIT) return text;
  const head = points.slice(0, TITLE_LIMIT);
  const space = head.lastIndexOf(" ");
  const cut = space > 0 ? head.slice(0, space) : head;
  return cut.join("") + "…";
}

function priorityFact(chain: Chain): string {
  const { S, O, D } = chain.ratings;
  const line = `${chain.priority.value} (S ${S.value}, O ${O.value}, D ${D.value})`;
  const provisional = [S, O, D].some((r) => r.review.status === "provisional");
  return provisional ? `${line}, resting on provisional ratings` : line;
}

/** The first passage of "Done when" for an action whose status is Decision pending. */
export const DONE_DECISION = "This action is a decision. It is done when the decision is recorded where the action says. Then close this item.";
/** The first passage of "Done when" for every other action. */
export const DONE_OTHER = "Carry out the action above, then close this item.";
/** The second passage of "Done when", on every item. */
export const DONE_CLOSE = "A close as done proposes Completed in the analysis. A close as not done proposes Not Implemented. A person confirms each proposal. After a Completed, the chain can be rated again.";
const NO_CONTROL = "The chain records no control.";

const fact = (label: string, value: string): Block => ({ kind: "fact", label, value });
const list = (label: string, items: string[]): Block => ({ kind: "list", label, items });
const text = (words: string): Block => ({ kind: "text", text: words });

/** An enum id as words: each "_" a space. */
const words = (id: string): string => id.replaceAll("_", " ");

function elementFact(element: Element): string {
  const security = element.security_relevant ? ", security-relevant" : "";
  return `${element.name} (${words(element.kind)}, ${words(element.boundary)}${security})`;
}

/** The function and the element of the chain. A missing one prints its id, and its dependent blocks are left out. */
function whereSection(doc: FmeaDocument, chain: Chain): Section {
  const fn: Fn | undefined = doc.functions.find((f) => f.id === chain.function);
  if (fn === undefined) return { heading: "Where", blocks: [fact("Function", chain.function)] };
  const element = doc.elements.find((e) => e.id === fn.element);
  const blocks = [fact("Element", element === undefined ? fn.element : elementFact(element)), fact("Function", fn.statement)];
  if (fn.conditions.length > 0) blocks.push(list("Conditions", fn.conditions));
  blocks.push(fact("For whom", fn.for_whom));
  return { heading: "Where", blocks };
}

function causeItem(cause: Cause): string {
  const tags = [...(cause.origin === undefined ? [] : [`origin: ${cause.origin}`]), ...(cause.adversarial === true ? ["adversarial"] : [])];
  return tags.length === 0 ? cause.text : `${cause.text} (${tags.join(", ")})`;
}

function controlItem(control: Control): string {
  const { kind, ref } = control.evidence;
  const evidence = kind === "none" ? "no evidence" : ref === undefined ? `evidence: ${words(kind)}` : `evidence: ${words(kind)}, ${ref}`;
  return `${control.kind}, ${control.status}: ${control.description} (${evidence})`;
}

function failureSection(chain: Chain): Section {
  const blocks = [fact("Failure mode", chain.failure_mode)];
  if (chain.trigger !== undefined) blocks.push(fact("Trigger", chain.trigger));
  blocks.push(
    fact("Local effect", chain.effects.local),
    fact("Next-level effect", chain.effects.next_level),
    fact("End effect", chain.effects.end),
    list("Causes", chain.causes.map(causeItem)),
    chain.controls.length > 0 ? list("Controls", chain.controls.map(controlItem)) : text(NO_CONTROL),
  );
  return { heading: "The failure", blocks };
}

function reviewOf(rating: Rating): string {
  const { status, by, date } = rating.review;
  if (status === "provisional") return "provisional";
  const name = status === "rescored" ? "re-scored" : "authored";
  return `${name}${by === undefined ? "" : ` by ${by}`}${date === undefined ? "" : ` on ${date}`}`;
}

function ratingValue(rating: Rating): string {
  const evidence = `evidence: ${words(rating.evidence_kind)}${rating.evidence_ref === undefined ? "" : `, ${rating.evidence_ref}`}`;
  return `${rating.rationale} (${evidence}; ${reviewOf(rating)})`;
}

function prioritySection(chain: Chain): Section {
  const { S, O, D } = chain.ratings;
  return {
    heading: "Priority",
    blocks: [
      fact("Chain priority", priorityFact(chain)),
      fact("Table", chain.priority.table),
      fact(`S ${S.value}`, ratingValue(S)),
      fact(`O ${O.value}`, ratingValue(O)),
      fact(`D ${D.value}`, ratingValue(D)),
    ],
  };
}

function staleValue(chain: Chain): string {
  const { reason, since_version } = chain.stale;
  return `${reason ?? "flagged"}${since_version === undefined ? "" : ` since version ${since_version}`}`;
}

function actionSection(chain: Chain, action: Action): Section {
  const blocks = [fact("Owner", action.owner), fact("Target date", action.target_date), fact("Status when created", action.status)];
  const others = chain.actions.filter((a) => a !== action);
  if (others.length > 0) blocks.push(list("Other actions on this chain", others.map((a) => `${a.id}: ${a.status}`)));
  if (chain.handoff !== undefined) blocks.push(fact("Threat-model handoff", chain.handoff.reason));
  if (chain.stale.flag) blocks.push(fact("Stale", staleValue(chain)));
  const incident = action.source_incident ?? chain.source_incident;
  if (incident !== undefined) blocks.push(fact("Source incident", incident));
  return { heading: "This action", blocks };
}

function doneSection(action: Action): Section {
  return { heading: "Done when", blocks: [text(action.status === "Decision pending" ? DONE_DECISION : DONE_OTHER), text(DONE_CLOSE)] };
}

/** The item for one action: the same content for every tracker (§7). */
export function buildItem(doc: FmeaDocument, config: TrackerConfig, ref: ActionRef): TrackedItem {
  const { chain, action } = ref;
  const sections = [whereSection(doc, chain), failureSection(chain), prioritySection(chain), actionSection(chain, action), doneSection(action)];
  const origin = { analysis: doc.meta.name, version: doc.meta.version, chain: chain.id, action: action.id };
  return {
    key: ref.key,
    text: textHash(action.description),
    label: config.label,
    due: action.target_date,
    content: {
      title: titleOf(action.description, `${chain.id}/${action.id}`),
      action: action.description,
      sections,
      origin: config.record_url === undefined ? origin : { ...origin, url: `${config.record_url}#row-${chain.id}` },
    },
  };
}
