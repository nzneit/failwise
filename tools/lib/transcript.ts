// The stream-json reader the eval tools share: a run's transcript.jsonl as `claude -p
// --output-format stream-json --verbose` writes it, one message per line, and the coded failure
// line every eval tool ends a refusal with. tools/eval-invocations.ts lists the skill's script
// calls with it and tools/eval-context.ts records the run's context; their tests pin it.

export type Block = { type?: unknown; id?: unknown; name?: unknown; input?: unknown; tool_use_id?: unknown; content?: unknown; is_error?: unknown };
export type Message = {
  type?: unknown;
  subtype?: unknown;
  tool_use_id?: unknown;
  parent_tool_use_id?: unknown;
  claude_code_version?: unknown;
  plugins?: unknown;
  skills?: unknown;
  memory_paths?: { auto?: unknown };
  message?: { content?: unknown; usage?: unknown };
};

export function blocksOf(m: Message): Block[] {
  const content = m.message?.content;
  return Array.isArray(content) ? content.filter((b): b is Block => typeof b === "object" && b !== null) : [];
}

/** A tool result's content as text: a string as is, text blocks joined. */
export function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((b) => (typeof b === "object" && b !== null && typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : "")).join("");
}

/** Line n of the stream as a message, or null for a blank line or a JSON value that is not an object. */
export function parseLine(line: string, n: number): Message | null {
  if (line.trim() === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`line ${n} is not JSON`);
  }
  return typeof value === "object" && value !== null ? (value as Message) : null;
}

/** One coded line on stderr (§9), whitespace runs collapsed, and the exit status it carries. */
export function refuse(code: "USAGE" | "IO_READ", message: string): 1 | 3 {
  process.stderr.write(`error ${code}: ${message.replace(/\s+/g, " ").trim()}\n`);
  return code === "USAGE" ? 1 : 3;
}
