// What the browser checks measure on the rendered report. The runner passes the report's
// absolute path in FAILWISE_REPORT.

import { pathToFileURL } from "node:url";
import { test, type Page } from "@playwright/test";
import { notAsserted, SCROLL_CONTAINERS, VIEWPORT_HEIGHT, type CheckId } from "./matrix.ts";

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

/** Up to ten elements under <main> whose box passes the viewport's right edge, each as tag#id.class. */
export async function pastRightEdge(page: Page): Promise<string[]> {
  return page.evaluate((containers) => {
    const edge = document.documentElement.clientWidth;
    const inContainer = (element: Element): boolean =>
      containers.some((selector) => element.parentElement?.closest(selector) != null);
    const passes = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.right - edge > 0.5 && !inContainer(element);
    };
    const label = (element: Element): string => {
      const id = element.id === "" ? "" : `#${element.id}`;
      const classes = [...element.classList].map((name) => `.${name}`).join("");
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    return [...document.querySelectorAll("main *")].filter(passes).slice(0, 10).map(label);
  }, [...SCROLL_CONTAINERS]);
}

/** Whether `check` at `width` is measured but not asserted. When it is, records the entry's reason and
 *  the measurement as a "not asserted" annotation, and the test ends without comparing. */
export function recordNotAsserted(check: CheckId, width: number, measured: unknown): boolean {
  const open = notAsserted(check, width);
  if (open === undefined) return false;
  test.info().annotations.push({ type: "not asserted", description: `${open.reason}; measured: ${JSON.stringify(measured)}` });
  return true;
}
