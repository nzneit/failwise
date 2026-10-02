/** Build a JSON pointer (RFC 6901). No segments gives the whole-document pointer "". */
export function ptr(...segments: (string | number)[]): string {
  return segments
    .map((segment) => "/" + String(segment).replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("");
}

/** The chain row a pointer belongs to, or null when it points outside `chains[]`.
 *  Matched segment by segment, so "/chains/10" is row 10 and never row 1
 *  (the quality score depends on that distinction). */
export function chainIndex(pointer: string): number | null {
  const parts = pointer.split("/");
  if (parts.length < 3 || parts[0] !== "" || parts[1] !== "chains") return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(parts[2])) return null;
  return Number(parts[2]);
}
