/** Entity-escape a string for insertion into HTML text or an attribute value. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape serialized JSON for a `<script type="application/json">` block. `<` and `>` would let a
 *  field value close the block; `&` guards against entity-decoding contexts; U+2028 and U+2029 are
 *  line terminators in JavaScript source. Each becomes a six-character `\uXXXX` escape, which JSON
 *  string syntax accepts, so the block still parses back to the same document. */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
