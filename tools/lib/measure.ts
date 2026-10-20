// The two counts the documentation check uses, defined the way `wc -w` and `wc -l` count them.
// Spec section 6: words are the whitespace-separated tokens `wc -w` counts, pipe characters and
// fenced code included; lines are the newline count `wc -l` reports.

/** The whitespace-separated tokens of `text`, with no empty token. */
export function countWords(text: string): number {
  return text.split(/\s+/u).filter((token) => token !== "").length;
}

/** The number of newline characters in `text`, as `wc -l` reports it. */
export function countLines(text: string): number {
  return (text.match(/\n/g) ?? []).length;
}
