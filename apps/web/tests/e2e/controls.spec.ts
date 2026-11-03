import { expect, test } from "@playwright/test";

// D-29: buttons, inputs, selects and textareas share a 4px radius; their sizes are unchanged.
const WIDTHS = [320, 390, 768, 1440];

for (const width of WIDTHS) {
  test.describe(`controls at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const path of ["/", "/opportunities", "/sign-in", "/register"]) {
      test(`4px radius on every control of ${path}`, async ({ page }) => {
        await page.goto(path);
        const result = await page.evaluate(() => {
          const sel =
            "button, select, textarea, input:not([type=checkbox], [type=radio], [type=hidden]), a.rounded-control";
          const rows: { tag: string; radii: string[]; height: number; joinedMiddle: boolean }[] = [];
          for (const el of document.querySelectorAll(sel)) {
            const r = (el as HTMLElement).getBoundingClientRect();
            if (r.width === 0) continue;
            const cs = getComputedStyle(el);
            rows.push({
              tag: el.tagName,
              radii: [
                cs.borderTopLeftRadius,
                cs.borderTopRightRadius,
                cs.borderBottomRightRadius,
                cs.borderBottomLeftRadius,
              ],
              height: r.height,
              joinedMiddle: el.tagName === "SELECT" && !!el.closest("[role=search]"),
            });
          }
          return rows;
        });
        expect(result.length).toBeGreaterThan(0);
        for (const row of result) {
          // Joined search group (>= 651px) keeps its inner edges square; every control has a 4px outer corner.
          if (!(row.joinedMiddle && width > 650)) expect(row.radii.some((v) => v === "4px")).toBe(true);
          expect(row.radii.every((v) => v === "4px" || v === "0px")).toBe(true);
          if (width <= 650) expect(row.radii).toEqual(["4px", "4px", "4px", "4px"]);
          expect(row.height).toBeGreaterThanOrEqual(33);
        }
      });
    }
  });
}

test("checkboxes and radios are not rounded", async ({ page }) => {
  await page.goto("/register");
  const radii = await page.evaluate(() =>
    [...document.querySelectorAll("input[type=checkbox], input[type=radio]")].map(
      (e) => getComputedStyle(e).borderTopLeftRadius,
    ),
  );
  for (const r of radii) expect(r).toBe("0px");
});
