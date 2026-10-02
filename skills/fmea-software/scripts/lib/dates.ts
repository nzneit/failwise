const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** A calendar date, `YYYY-MM-DD`, that really exists. The schema declares `format: "date"`,
 *  which draft 2020-12 treats as an annotation only, so the check lives here. */
export function isCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m === null) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  const limit = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day >= 1 && day <= limit;
}

/** An RFC 3339 timestamp: a calendar date, `T`, `hh:mm:ss` with optional fraction, then `Z`
 *  or a numeric offset. Seconds may be 60 (leap second). Used for `computed.validated_at`. */
export function isRfc3339DateTime(s: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(s);
  if (m === null) return false;
  if (!isCalendarDate(m[1])) return false;
  if (Number(m[2]) > 23) return false;
  if (Number(m[3]) > 59) return false;
  if (Number(m[4]) > 60) return false;
  if (m[5] !== "Z" && (Number(m[6]) > 23 || Number(m[7]) > 59)) return false;
  return true;
}

export function nowIso(): string {
  return new Date().toISOString();
}
