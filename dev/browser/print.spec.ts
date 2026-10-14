// The print checks: under print media emulation the report hides its links back to the index,
// shows a link in its parent's colour with nothing in it underlined or in the link colour, and
// neither scrolls sideways nor puts an element past the right edge at PRINT_WIDTH. In the two
// layout tests the media is emulated and the report loaded and measured first; a check not
// asserted at PRINT_WIDTH is then recorded as an annotation and the test ends; otherwise the test
// is marked as an expected failure where one is known and compared. So a report that did not load
// or a measurement that throws fails, and only the `expect` can be the expected failure.

import { expect, test } from "@playwright/test";
import { expectedFailure, PRINT_WIDTH } from "./matrix.ts";
import { openReport, pastRightEdge, recordNotAsserted, sidewaysScroll } from "./report.ts";

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

// A link and every element inside it are checked, since a rule on a descendant (an underlined <code>
// in a chain reference) can make printed text read as a link while the <a> itself passes. A link
// must take its parent's colour. A descendant is not held to that: many carry a colour of their own
// by design (a priority badge, a tile's muted label), so neither its parent's colour nor the nearest
// link's is a fair expectation, and either comparison would fail on correct output. What would make a
// descendant read as a link is an underline or the screen's link colour, so a descendant must have
// no underline and, where its colour differs from its parent's, must not be the link colour. The
// link colour is read from a probe styled with var(--link), so the check follows the template.
test("print: a link has no underline and takes its parent's colour", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const { linkColor, elements } = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--link)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return {
      linkColor: color,
      elements: [...document.querySelectorAll("a, a *")].map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: element.textContent.trim().slice(0, 30),
        line: getComputedStyle(element).textDecorationLine,
        color: getComputedStyle(element).color,
        parentColor: element.parentElement === null ? "" : getComputedStyle(element.parentElement).color,
      })),
    };
  });
  const links = elements.filter((element) => element.tag === "a");
  const inside = elements.filter((element) => element.tag !== "a");
  expect(links.length).toBeGreaterThan(0);
  expect(inside.length).toBeGreaterThan(0);
  expect(links.filter((link) => link.line !== "none" || link.color !== link.parentColor)).toEqual([]);
  expect(inside.filter((element) => element.line !== "none" || (element.color !== element.parentColor && element.color === linkColor))).toEqual([]);
});

test("print: the page does not scroll sideways", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const scroll = await sidewaysScroll(page);
  if (recordNotAsserted("scroll", PRINT_WIDTH, scroll)) return;
  const known = expectedFailure("scroll", PRINT_WIDTH);
  test.fail(known !== undefined, known?.reason);
  expect(scroll).toBe(0);
});

test("print: nothing extends past the right edge", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await openReport(page, PRINT_WIDTH);
  const past = await pastRightEdge(page);
  if (recordNotAsserted("edge", PRINT_WIDTH, past)) return;
  const known = expectedFailure("edge", PRINT_WIDTH);
  test.fail(known !== undefined, known?.reason);
  expect(past).toEqual([]);
});
