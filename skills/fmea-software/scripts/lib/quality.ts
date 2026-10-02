import type { Lint } from "./types.ts";
import { chainIndex } from "./pointer.ts";

/** The share of chain rows carrying no blocker lint, as an integer 0 to 100.
 *
 *  Two rules sit beside the arithmetic. A blocker whose pointer lies outside `chains[]` —
 *  `chainIndex` returns null — is a fault of the document as a whole rather than of one row, so
 *  no share of the rows can be clean of it and the score is 0: a document that records neither
 *  ground rules nor assumptions must not read as perfect because its rows happen to be tidy.
 *  A blocker whose pointer names a row index the document does not have is ignored, there being
 *  no row for it to dirty. */
export function qualityScore(chainCount: number, lints: Lint[]): number {
  if (chainCount === 0) return 0;
  const dirty = new Set<number>();
  for (const l of lints) {
    if (l.severity !== "blocker") continue;
    const i = chainIndex(l.pointer);
    if (i === null) return 0;
    if (i < 0 || i >= chainCount) continue;
    dirty.add(i);
  }
  const clean = chainCount - dirty.size;
  return Math.round((100 * clean) / chainCount);
}
