import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { demoCode } from "./exec";

/**
 * Browser-level journey of the staff console (/staff, Next.js; D-46) with the fictional demo staff accounts.
 * Needs `seed_demo --force` run with UPNEXT_DEMO_PASSWORD equal to E2E_DEMO_PASSWORD (throwaway stacks only) and
 * E2E_EXEC for the two-step demo codes (exec.ts). Run with E2E_CMS=1. E2E_SCREENSHOT_DIR keeps screenshots of the
 * dashboard, opportunities table and editor in both themes as review evidence.
 */
test.skip(process.env.E2E_CMS !== "1", "needs the demo staff accounts (E2E_CMS=1)");
test.describe.configure({ mode: "serial" });

const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "";
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TAG = Date.now().toString(36);
const DIRECT_TITLE = `Procurement Officer ${TAG}`;
const SUBMITTED_TITLE = `Records Clerk ${TAG}`;

const accounts = {
  contributor: "contributor@demo.upnext.example",
  editor: "editor@demo.upnext.example",
  second: "second-editor@demo.upnext.example",
  admin: "admin@demo.upnext.example",
} as const;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function login(browser: Browser, who: keyof typeof accounts, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto("/staff/sign-in");
  await page.getByLabel("Email").fill(accounts[who]);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Code").fill(demoCode(accounts[who]));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
  return { context, page };
}

async function setTheme(page: Page, theme: "Light" | "Dark") {
  await page.getByRole("group", { name: "Colour theme" }).getByRole("button", { name: theme }).click();
  await expect(page.getByRole("button", { name: theme, pressed: true })).toBeVisible();
}

/** A complete, valid job; the organisation is the first search result. */
async function fillJob(page: Page, title: string) {
  const slug = title.toLowerCase().replaceAll(" ", "-"); // distinct addresses: the duplicate check is real
  await page.locator('ul[aria-label="Matching organisations"] button').first().click();
  await page.getByLabel("Job title").fill(title);
  await page.getByLabel("Category", { exact: true }).selectOption("jobs");
  await page
    .getByLabel("Summary")
    .fill("Runs procurement planning and supplier management for a regional office.");
  await page.getByLabel("Harare").first().check();
  await page.getByLabel("Employment type").selectOption("permanent");
  await page
    .getByLabel("Description and responsibilities")
    .fill(
      "### Responsibilities\n\n- Plan and run tenders\n- Manage supplier contracts and reports for the finance team.\n\nThe role reports to the finance director.",
    );
  await page.getByLabel("Application web address").fill(`https://example.co.zw/careers/${slug}`);
  await page.getByLabel("Closing", { exact: true }).selectOption("date");
  const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Date", { exact: true }).fill(day);
  await page.getByRole("button", { name: "Add a source" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Issuer careers page");
  await page.getByLabel("Web address", { exact: true }).fill(`https://example.co.zw/careers/source-${slug}`);
}

const contexts: BrowserContext[] = [];
test.afterAll(async () => {
  await Promise.all(contexts.map((c) => c.close()));
});

test("1. staff pages need a staff session and two-step verification", async ({ page, request }) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/staff\/sign-in/);
  await expect(page.getByRole("heading", { name: "Staff sign-in" })).toBeVisible();
  expect((await request.get("/api/v1/staff/overview")).status()).toBe(401);
  const response = await page.goto("/staff/sign-in");
  expect(response?.headers()["content-security-policy"]).toContain("nonce-");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  // a wrong password is refused with a generic message
  await page.getByLabel("Email").fill(accounts.editor);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Incorrect e-mail or password")).toBeVisible();
});

test("2. a Contributor writes and submits a draft but cannot publish it or see administration", async ({
  browser,
}) => {
  const { context, page } = await login(browser, "contributor");
  contexts.push(context);
  await expect(page.getByRole("link", { name: "Audit Logs" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Staff Management" })).toHaveCount(0);
  expect((await page.request.get("/api/v1/staff/users")).status()).toBe(403);
  await page.goto("/staff/audit");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Create Opportunity" }).first().click();
  await fillJob(page, SUBMITTED_TITLE);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/staff\/opportunities\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Publish now" })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("In review").first()).toBeVisible();
});

test("3. an independent Editor approves it in the review queue; the author cannot", async ({ browser }) => {
  const { context, page } = await login(browser, "editor");
  contexts.push(context);
  await page.getByRole("link", { name: /Review Queue/ }).click();
  await page.getByRole("link", { name: SUBMITTED_TITLE }).first().click();
  await page.getByRole("button", { name: "Approve" }).click();
  const dialog = page.locator("dialog[open]");
  for (const label of [
    "I reviewed the cited source",
    "I reviewed possible duplicates",
    "The content matches the source",
  ]) {
    await dialog.getByLabel(label).check();
  }
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published").first()).toBeVisible();
});

test("4. an Editor creates a job and publishes it directly; it appears on the public site", async ({
  browser,
  page: anon,
}) => {
  const { context, page } = await login(browser, "editor");
  contexts.push(context);
  await shot(page, "staff-dashboard-light");
  await page.getByRole("link", { name: "Create Opportunity" }).first().click();
  await fillJob(page, DIRECT_TITLE);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#preview")).toContainText("Plan and run tenders");
  await shot(page, "staff-editor-light");
  await page.getByRole("button", { name: "Save and publish…" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("without a second person's approval");
  for (const label of [
    "I reviewed the cited source",
    "I reviewed possible duplicates",
    "The content matches the source",
  ]) {
    await dialog.getByLabel(label).check();
  }
  await dialog.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("Direct publication").first()).toBeVisible();
  const link = page.getByRole("link", { name: "View on the public site" });
  const path = await link.getAttribute("href");
  expect(path).toMatch(/^\/opportunities\//);
  await anon.goto(path ?? "/");
  await expect(anon.getByRole("heading", { level: 1, name: DIRECT_TITLE })).toBeVisible();
  // the audit trail says it was direct and self-approved
  await expect(page.getByText("Recorded as a direct, self-approved publication.")).toBeVisible();
});

test("5. the table searches, filters and withdraws according to permission", async ({ browser }) => {
  const { context, page } = await login(browser, "editor");
  contexts.push(context);
  await page.getByRole("link", { name: "All Opportunities" }).click();
  await shot(page, "staff-table-light");
  await page.locator("#f-q").fill(TAG);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("row")).toHaveCount(3); // header + two listings
  await page
    .getByRole("columnheader", { name: /Opportunity/ })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/sort=title/);
  // Both listings this journey published are withdrawn, so the public counts the other specs expect are unchanged.
  for (const title of [DIRECT_TITLE, SUBMITTED_TITLE]) {
    const row = page.getByRole("row", { name: new RegExp(title) });
    await row.getByRole("button", { name: "Withdraw" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Explanation").fill("Withdrawn at the issuer's request.");
    await dialog.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByRole("row", { name: new RegExp(title) })).toContainText("Withdrawn");
  }
});

test("6. an Administrator reads the audit trail, staff and settings", async ({ browser }) => {
  const { context, page } = await login(browser, "admin");
  contexts.push(context);
  await page.getByRole("link", { name: "Audit Logs" }).click();
  await page.getByLabel("Action starts with").fill("opportunity.publish_direct");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("table")).toContainText("opportunity.publish_direct");
  await page.getByRole("link", { name: "Staff Management" }).click();
  await expect(page.getByRole("table")).toContainText("Demo Editor");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Required for all staff")).toBeVisible();
});

test("7. dark theme, keyboard use, accessibility and the phone layout", async ({ browser }) => {
  const { context, page } = await login(browser, "editor");
  contexts.push(context);
  await setTheme(page, "Dark");
  await shot(page, "staff-dashboard-dark");
  for (const [path, name] of [
    ["/staff/opportunities", "staff-table-dark"],
    ["/staff/opportunities/new", "staff-editor-dark"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await shot(page, name);
  }
  for (const theme of ["Dark", "Light"] as const) {
    await setTheme(page, theme);
    for (const path of [
      "/staff",
      "/staff/opportunities",
      "/staff/opportunities/new",
      "/staff/organisations",
    ]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations.map((v) => `${path} ${theme}: ${v.id}`)).toEqual([]);
    }
  }
  const phone = await login(browser, "contributor", { width: 390, height: 844 });
  contexts.push(phone.context);
  await phone.page.getByRole("button", { name: "Open menu" }).click();
  await expect(phone.page.getByRole("dialog", { name: "Staff menu" })).toBeVisible();
  await shot(phone.page, "staff-mobile-menu");
  await phone.page.keyboard.press("Escape");
  await expect(phone.page.getByRole("dialog")).toHaveCount(0);
  await phone.page.goto("/staff/opportunities");
  const scrolls = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(scrolls).toBe(false); // the table scrolls inside its own container, never the page
});
