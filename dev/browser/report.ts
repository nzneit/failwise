// What the browser checks measure on the rendered report. The runner passes the report's
// absolute path in FAILWISE_REPORT.

import { pathToFileURL } from "node:url";
import { test, type Locator, type Page } from "@playwright/test";
import { LONG_TOKEN, notAsserted, rowStem, SCROLL_CONTAINERS, SECTION_PARTS, TOKEN_EXEMPT, VIEWPORT_HEIGHT, type CheckId } from "./matrix.ts";

/** Sets the viewport to `width` by VIEWPORT_HEIGHT and loads the report. Throws when FAILWISE_REPORT is unset,
 *  and when the page loaded has no <main> with an element in it, so neither measurement can pass on
 *  a blank or wrong page. */
export async function openReport(page: Page, width: number): Promise<void> {
  const report = process.env.FAILWISE_REPORT;
  if (report === undefined || report === "") throw new Error("FAILWISE_REPORT is unset: run the checks through tools/check-browser.ts");
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.goto(pathToFileURL(report).href);
  const loaded = await page.evaluate(() => document.querySelector("main")?.firstElementChild != null);
  if (!loaded) throw new Error(`the report did not load: ${report} has no <main> with an element in it`);
}

/** How many pixels the document is wider than the viewport; 0 when it fits. */
export async function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(0, root.scrollWidth - root.clientWidth);
  });
}

/** Each element as tag#id.class. Run in the page, on a handle to the elements, so every check names elements alike. */
function tagLabels(elements: Element[]): string[] {
  return elements.map((element) => {
    const id = element.id === "" ? "" : `#${element.id}`;
    const classes = [...element.classList].map((name) => `.${name}`).join("");
    return `${element.tagName.toLowerCase()}${id}${classes}`;
  });
}

/** Up to ten elements under <main> whose box passes the viewport's right edge, each as tag#id.class. */
export async function pastRightEdge(page: Page): Promise<string[]> {
  const passing = await page.evaluateHandle((containers) => {
    const edge = document.documentElement.clientWidth;
    const inContainer = (element: Element): boolean =>
      containers.some((selector) => element.parentElement?.closest(selector) != null);
    const passes = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.right - edge > 0.5 && !inContainer(element);
    };
    return [...document.querySelectorAll("main *")].filter(passes).slice(0, 10);
  }, [...SCROLL_CONTAINERS]);
  return passing.evaluate(tagLabels);
}

/** Appends a space and LONG_TOKEN, as text, to every element under <main> that has a text node of its own with
 *  something other than white space in it, whose computed white-space lets text wrap, and that matches no
 *  selector of TOKEN_EXEMPT. Returns how many elements it wrote into. */
export async function plantLongToken(page: Page): Promise<number> {
  return page.evaluate(({ token, exempt }) => {
    const ownText = (element: Element): boolean =>
      [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
    const wraps = (element: Element): boolean => !["nowrap", "pre"].includes(getComputedStyle(element).whiteSpace);
    const targets = [...document.querySelectorAll("main *")].filter(
      (element) => ownText(element) && wraps(element) && !exempt.some((selector) => element.matches(selector)),
    );
    for (const element of targets) element.append(` ${token}`);
    return targets.length;
  }, { token: LONG_TOKEN, exempt: TOKEN_EXEMPT.map((entry) => entry.selector) });
}

/** Up to ten faults of the report's frames: "table outside a frame: <tag#id.class>" for a table whose parent
 *  element is not a `.frame`; "frame overflow-x <value>: <aria-label>" for a frame whose computed overflow-x is
 *  not `overflow`; and, when `atRest`, "table past its frame by <n>px: <aria-label>" for a table whose box's
 *  right edge passes its frame's box's right edge by more than 0.5 px. */
export async function frameFaults(page: Page, overflow: "auto" | "visible", atRest: boolean): Promise<string[]> {
  const unframed = await page.evaluateHandle(() =>
    [...document.querySelectorAll("table")].filter((table) => table.parentElement?.matches(".frame") !== true),
  );
  const outside = (await unframed.evaluate(tagLabels)).map((label) => `table outside a frame: ${label}`);
  const framed = await page.evaluate(({ overflow, atRest }) => {
    const faults: string[] = [];
    for (const frame of document.querySelectorAll(".frame")) {
      const name = frame.getAttribute("aria-label") ?? "";
      const value = getComputedStyle(frame).overflowX;
      if (value !== overflow) faults.push(`frame overflow-x ${value}: ${name}`);
      const tables = atRest ? frame.querySelectorAll(":scope > table") : [];
      for (const table of tables) {
        const past = table.getBoundingClientRect().right - frame.getBoundingClientRect().right;
        if (past > 0.5) faults.push(`table past its frame by ${past.toFixed(1)}px: ${name}`);
      }
    }
    return faults;
  }, { overflow, atRest });
  return [...outside, ...framed].slice(0, 10);
}

/** Whether `check` at `width` is measured but not asserted. When it is, records the entry's reason and
 *  the measurement as a "not asserted" annotation, and the test ends without comparing. */
export function recordNotAsserted(check: CheckId, width: number, measured: unknown): boolean {
  const open = notAsserted(check, width);
  if (open === undefined) return false;
  test.info().annotations.push({ type: "not asserted", description: `${open.reason}; measured: ${JSON.stringify(measured)}` });
  return true;
}

/** The element the part `stem` is photographed from: `#<stem>` for a name of SECTION_PARTS; `.key` for "key";
 *  for "index", the index's frame `.frame:has(> table.index)` when it matches, else `table.index`; for a stem that
 *  starts "row-", the `article.row` whose rowStem(id) equals it, and an Error when none does. */
export async function partLocator(page: Page, stem: string): Promise<Locator> {
  if ((SECTION_PARTS as readonly string[]).includes(stem)) return page.locator(`#${stem}`);
  if (stem === "key") return page.locator(".key");
  if (stem === "index") {
    const frame = page.locator(".frame:has(> table.index)");
    return (await frame.count()) > 0 ? frame : page.locator("table.index");
  }
  if (stem.startsWith("row-")) {
    const rows = page.locator("article.row");
    const ids = await rows.evaluateAll((elements) => elements.map((element) => element.id));
    const at = ids.findIndex((id) => rowStem(id) === stem);
    if (at >= 0) return rows.nth(at);
  }
  throw new Error(`the report has no part "${stem}"`);
}

/** Hides everything in the page but `part`, its ancestors and what is inside it, so the part sits alone at the
 *  top of the page and its image does not depend on what comes before it. Each sibling of the part, and of every
 *  ancestor of the part up to <body>, gets `display: none !important`. */
export async function isolatePart(part: Locator): Promise<void> {
  await part.evaluate((element) => {
    for (let node: Element | null = element; node !== null && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && sibling instanceof HTMLElement) sibling.style.setProperty("display", "none", "important");
      }
    }
  });
}
