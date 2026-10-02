// The print checks: under print media emulation the report hides its links back to the index,
// shows links without underline in their parent's colour, and neither scrolls sideways nor puts an
// element past the right edge at PRINT_WIDTH. The report is loaded and measured before a test is
// marked as an expected failure, so a report that did not load or a measurement that throws fails,
// and only the `expect` can be the expected failure.

import { expect, test } from "@playwright/test";
import { expectedFailure, PRINT_WIDTH } from "./matrix.ts";
import { openReport, pastRightEdge, sidewaysScroll } from "./report.ts";

test("print: the links back to the index are not displayed", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const { rows, displays } = await page.evaluate(() => ({
    rows: document.querySelectorAll("article.row").length,
    displays: [...document.querySelectorAll(".back")].map((element) => getComputedStyle(element).display),
  }));
  if (rows > 0) expect(displays.length).toBeGreaterThan(0);
  expect(displays.filter((display) => display !== "none")).toEqual([]);
});

test("print: a link has no underline and takes its parent's colour", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a")].map((link) => ({
      text: link.textContent.trim().slice(0, 30),
      line: getComputedStyle(link).textDecorationLine,
      color: getComputedStyle(link).color,
      parentColor: link.parentElement === null ? "" : getComputedStyle(link.parentElement).color,
    })),
  );
  expect(links.length).toBeGreaterThan(0);
  expect(links.filter((link) => link.line !== "none" || link.color !== link.parentColor)).toEqual([]);
});

test("print: the page does not scroll sideways", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const scroll = await sidewaysScroll(page);
  const known = expectedFailure("scroll", PRINT_WIDTH);
  test.fail(known !== undefined, known?.reason);
  expect(scroll).toBe(0);
});

test("print: nothing extends past the right edge", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const past = await pastRightEdge(page);
  const known = expectedFailure("edge", PRINT_WIDTH);
  test.fail(known !== undefined, known?.reason);
  expect(past).toEqual([]);
});
