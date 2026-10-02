// What the browser checks measure on the rendered report. The runner passes the report's
// absolute path in FAILWISE_REPORT.

import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { SCROLL_CONTAINERS, VIEWPORT_HEIGHT } from "./matrix.ts";

/** Sets the viewport to `width` by VIEWPORT_HEIGHT and loads the report. Throws when FAILWISE_REPORT is unset. */
export async function openReport(page: Page, width: number): Promise<void> {
  const report = process.env.FAILWISE_REPORT;
  if (report === undefined || report === "") throw new Error("FAILWISE_REPORT is unset: run the checks through tools/check-browser.ts");
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.goto(pathToFileURL(report).href);
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
