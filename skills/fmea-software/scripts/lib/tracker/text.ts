// Text from the analysis made plain, shared by the GitHub and Jira renderers (s1). Pure text.

/** A space for a C0 control character (the tab, a lone carriage return and a line feed included),
 *  DEL, a C1 control character (U+0080 to U+009F) or a Unicode line or paragraph separator (U+2028,
 *  U+2029), the set `cleanDetail` in track.ts treats as controls. */
function spaceControl(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029 ? " " : ch;
}

/** The text on one line: a CRLF, then every other control character or line separator, becomes one space, and the ends are trimmed. */
export function plain(text: string): string {
  return Array.from(text.replace(/\r\n/g, " "), spaceControl).join("").trim();
}
