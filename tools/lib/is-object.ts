// The object check the tools that read JSON share.

/** Whether a value is an object other than an array or null, such as a parsed JSON object or a thrown error. */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
