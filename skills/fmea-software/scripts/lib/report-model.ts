// The report model: everything the HTML report shows, derived from the document as plain data.
// No HTML and no escaping here; `render.ts` emits and escapes. Chains are addressed by their
// position in `chains[]`.

import type { Chain, Factor, FmeaDocument, Ratings } from "./types.ts";
import type { PriorityTable } from "./table.ts";
import { vocabularyRank } from "./table.ts";

const FACTORS: Factor[] = ["S", "O", "D"];

// The rating blocks a row carries: `ratings` always, and `post_ratings` once the row has been
// re-scored after a completed action. Both count, for the header's provisional line and for the
// row's provisional mark alike, so a post-action priority is never shown without the caveat that
// the ratings under it are unreviewed (§5 step 5, §9).
export function ratingBlocks(chain: Chain): Ratings[] {
  return chain.post_ratings ? [chain.ratings, chain.post_ratings] : [chain.ratings];
}

export function provisionalCount(chain: Chain): number {
  let n = 0;
  for (const ratings of ratingBlocks(chain)) {
    for (const f of FACTORS) if (ratings[f].review.status === "provisional") n++;
  }
  return n;
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
