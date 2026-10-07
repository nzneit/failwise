// Text from the analysis made plain, shared by the GitHub and Jira renderers (s1). Pure text.

/** A space for a C0 control character (the tab, a lone carriage return and a line feed included) or DEL. */
function spaceControl(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  return code <= 0x1f || code === 0x7f ? " " : ch;
}

/** The text on one line: a CRLF, then every other control character, becomes one space, and the ends are trimmed. */
export function plain(text: string): string {
  return Array.from(text.replace(/\r\n/g, " "), spaceControl).join("").trim();
}
