// The tracker-neutral item built for each action of an analysis. Pure: no tracker, no network.

import { createHash } from "node:crypto";
import { ptr } from "../pointer.ts";
import type { Action, Chain, FmeaDocument, TrackerConfig } from "../types.ts";
import type { Fact, TrackedItem } from "./provider.ts";

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

/** The item for one action: the same content for every tracker (§7). */
export function buildItem(doc: FmeaDocument, config: TrackerConfig, ref: ActionRef): TrackedItem {
  const { chain, action } = ref;
  const facts: Fact[] = [
    { label: "Failure mode", value: chain.failure_mode },
    { label: "End effect", value: chain.effects.end },
    { label: "Causes", value: chain.causes.map((c) => c.text).join("; ") },
    { label: "Row priority", value: priorityFact(chain) },
    { label: "Owner", value: action.owner },
    { label: "Target date", value: action.target_date },
    { label: "Status when created", value: action.status },
  ];
  const origin = { analysis: doc.meta.name, chain: chain.id, action: action.id };
  return {
    key: ref.key,
    text: textHash(action.description),
    label: config.label,
    due: action.target_date,
    content: {
      title: titleOf(action.description, `${chain.id}/${action.id}`),
      action: action.description,
      facts,
      origin: config.record_url === undefined ? origin : { ...origin, url: `${config.record_url}#row-${chain.id}` },
    },
  };
}
