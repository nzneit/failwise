export const ENGINES = ["chromium", "firefox", "webkit"] as const;
export type Engine = (typeof ENGINES)[number];

/** The viewport widths every layout check runs at: a small phone (320 px, the width of the reflow criterion), a phone, a tablet, a laptop and a desktop. */
export const WIDTHS = [320, 375, 768, 1280, 1920] as const;
export type View = (typeof WIDTHS)[number] | "print";
/** Every view the comparison photographs a part at: each width, then print. */
export const VIEWS: readonly View[] = [...WIDTHS, "print"];
export const VIEWPORT_HEIGHT = 900;
/** The width the print checks open the report at: a landscape page less its margins, in CSS pixels. */
export const PRINT_WIDTH = 965;

export type CheckId = "scroll" | "edge" | "axe";
export interface ExpectedFailure { check: CheckId; width: number; reason: string }

/** The checks known to fail on today's report, each with the reason it fails. */
export const EXPECTED_FAILURES: readonly ExpectedFailure[] = [
  { check: "scroll", width: 320, reason: "the report has no phone layout yet; the narrow-screen design gives it one" },
  { check: "edge", width: 320, reason: "the report has no phone layout yet; the narrow-screen design gives it one" },
  { check: "scroll", width: 375, reason: "the report has no phone layout yet; the narrow-screen design gives it one" },
  { check: "edge", width: 375, reason: "the report has no phone layout yet; the narrow-screen design gives it one" },
];

/** The expected failure of `check` at `width`, or undefined when that check must pass. */
export function expectedFailure(check: CheckId, width: number): ExpectedFailure | undefined {
  return EXPECTED_FAILURES.find((known) => known.check === check && known.width === width);
}

/** A check whose result depends on the reader's fonts, so it is measured and reported but cannot fail the run. */
export type NotAsserted = ExpectedFailure;

/** The checks measured and named on every passing run but not asserted, each with the reason. */
export const NOT_ASSERTED: readonly NotAsserted[] = [
  {
    check: "scroll",
    width: 768,
    reason: "the contents line cannot wrap between its links, so its last link, Provenance, widens the page by an amount that depends on the reader's fonts; left to the narrow-screen design",
  },
  {
    check: "edge",
    width: 768,
    reason: "the contents line cannot wrap between its links, so its last link, Provenance, passes the right edge by an amount that depends on the reader's fonts; left to the narrow-screen design",
  },
];

/** The not-asserted entry of `check` at `width`, or undefined when the check is asserted. */
export function notAsserted(check: CheckId, width: number): NotAsserted | undefined {
  return NOT_ASSERTED.find((open) => open.check === check && open.width === width);
}

/** Selectors of elements that may scroll sideways inside themselves: the frames every table of the report sits in. */
export const SCROLL_CONTAINERS: readonly string[] = [".frame"];

/** The ids of the report's sections photographed one by one: every <section> but the chains. */
export const SECTION_PARTS = ["header", "ground-rules", "assumptions", "reviews", "structure", "actions", "lints", "provenance"] as const;
/** The tallest a part image may be, in pixels; a taller part is written in consecutive pieces. */
export const MAX_PART_HEIGHT = 1600;

/** A row id without its "row-" prefix, every character outside A-Z a-z 0-9 . _ - replaced by "-". */
function reducedName(id: string): string {
  return id.replace(/^row-/, "").replace(/[^A-Za-z0-9._-]/g, "-");
}

/** The file stem of a row section: its 1-based position, two digits, then its element id without "row-",
 *  every character outside A-Z a-z 0-9 . _ - replaced by "-". rowFileStem(1, "row-ch-2") is "row-01-ch-2". */
export function rowFileStem(position: number, id: string): string {
  return `row-${String(position).padStart(2, "0")}-${reducedName(id)}`;
}

/** A row's file stem in the comparison: "row-" and its element id without "row-", every character outside
 *  A-Z a-z 0-9 . _ - replaced by "-", with no position, so rows match by id. rowStem("row-ch-2") is "row-ch-2". */
export function rowStem(id: string): string {
  return `row-${reducedName(id)}`;
}
