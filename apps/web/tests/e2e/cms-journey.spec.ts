import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { demoCode } from "./exec";

/**
 * Browser-level review of the editorial workspace (/workspace, D-46) with the fictional demo staff accounts.
 * Needs `seed_demo --force` run with UPNEXT_DEMO_PASSWORD set to the same value as E2E_DEMO_PASSWORD
 * (throwaway local/CI stacks only; never real credentials) and E2E_EXEC for the two-step demo codes (exec.ts).
 * Run with E2E_CMS=1.
 * Set E2E_SCREENSHOT_DIR to keep screenshots as review evidence.
 */
test.skip(process.env.E2E_CMS !== "1", "needs the demo staff accounts (E2E_CMS=1)");
test.describe.configure({ mode: "serial" });

const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "";
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TITLE = `Field Officer ${Date.now().toString(36)}`;
const TAG = TITLE.split(" ").pop() ?? "x";
const BASE = process.env.BASE_URL ?? "http://localhost:8080";

const accounts = {
  contributor: "contributor@demo.upnext.example",
  editor: "editor@demo.upnext.example",
  second: "second-editor@demo.upnext.example",
  admin: "admin@demo.upnext.example",
} as const;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function login(browser: Browser, who: keyof typeof accounts, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, baseURL: BASE });
  const page = await context.newPage();
  await page.goto("/sign-in?next=%2Fworkspace");
  await page.locator("#email").fill(accounts[who]);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  // Staff must pass the second step (two-step verification) before any staff page.
  await expect(page).toHaveURL(/\/workspace\/two-step/);
  await page.locator("#code").fill(demoCode(accounts[who]));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  return { context, page };
}

/** Starts an action (its form opens), optionally fills it, and submits. */
async function run(page: Page, label: string, fill?: () => Promise<void>) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  if (fill) await fill();
  await page.locator(`form[aria-label="${label}"] button[type=submit]`).click();
}

/** Fills the job editor (D-55) with a complete, valid listing (unique addresses via `tag`). */
async function fillDraft(page: Page, tag: string) {
  await page
    .locator("#summary")
    .fill("Support community water projects and site visits for a water authority in Harare.");
  await page
    .locator("#responsibilities")
    .fill(
      "Example Water Authority is recruiting a **Field Officer** to support community water projects across the province.\n\n- Visit sites\n- Prepare reports",
    );
  await page.locator("#employment_type").selectOption("contract");
  const day = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  await page.locator("#deadline_day").fill(day);
  await page.locator("#apply-url").fill(`https://water.example.org/vacancies/field-officer-${tag}`);
  await page.getByLabel("Search locations").fill("Harare");
  await page.getByRole("option", { name: "Harare", exact: true }).click();
  await page.locator("#source_kind").selectOption("issuer_website");
  await page.locator("#source_url").fill(`https://water.example.org/vacancies/${tag}`);
}

/** Opens the new-opportunity form and sets the three things a draft needs: category, title, organisation. */
async function createDraft(page: Page, organisation: string, title: string) {
  await page.goto("/workspace/opportunities/new");
  await page.locator("#category").selectOption({ label: "Jobs" });
  await page.locator("#title").fill(title);
  await page.locator("#organisation").fill(organisation);
  await page.getByRole("option", { name: organisation, exact: true }).click();
}

/** Saves the draft (the first save creates it; the address becomes .../edit), then opens its listing page. */
async function saveAndView(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Saved at/ })).toBeVisible();
  await expect(page).toHaveURL(/\/workspace\/opportunities\/[0-9a-f-]{36}\/edit$/);
  await page.goto(page.url().replace(/\/edit$/, ""));
  await expect(page).toHaveURL(/\/workspace\/opportunities\/[0-9a-f-]{36}$/);
}

const state: { editUrl: string; listingUrl: string; slug: string } = {
  editUrl: "",
  listingUrl: "",
  slug: "",
};
const contexts: BrowserContext[] = [];
test.afterAll(async () => {
  await Promise.all(contexts.map((c) => c.close()));
});

test("1. a Contributor starts a draft and fills it in", async ({ browser }) => {
  const { context, page } = await login(browser, "contributor");
  contexts.push(context);
  await shot(page, "cms-01-dashboard-contributor");
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0); // administrators only
  await expect(page.getByRole("link", { name: "Review queue" })).toHaveCount(0); // editors only
  await page.goto("/workspace/opportunities");
  await shot(page, "cms-02-listings-contributor");
  await createDraft(page, "Example Water Authority", TITLE);
  await shot(page, "cms-03-draft-editor");
  await fillDraft(page, TAG);
  await shot(page, "cms-05-draft-editor-filled");
  await saveAndView(page);
  state.listingUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await shot(page, "cms-06-listing-after-save");
});

test("2. submit for review; the author cannot approve", async ({ browser }) => {
  const { context, page } = await login(browser, "contributor");
  contexts.push(context);
  await page.goto(state.listingUrl);
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await run(page, "Submit for review");
  await expect(page.getByText("Done: Submit for review")).toBeVisible();
  await expect(page.getByRole("main")).toContainText("In review");
  await shot(page, "cms-08-listing-in-review");
  // the frozen revision cannot be edited any more
  await expect(page.getByRole("link", { name: "Edit the draft" })).toHaveCount(0);
  await page.goto(`${state.listingUrl}/edit`);
  await expect(page).toHaveURL(state.listingUrl); // sent back to the read-only page
});

test("3. self-approval is refused even for someone who holds an editor role", async ({ browser }) => {
  const { context, page } = await login(browser, "second"); // holds Editor and Contributor
  contexts.push(context);
  await createDraft(page, "Example Health Alliance", `${TITLE} (self-review attempt)`);
  await fillDraft(page, `${TAG}-self`);
  await saveAndView(page);
  const listing = page.url();
  await run(page, "Submit for review");
  await expect(page.getByText("Done: Submit for review")).toBeVisible();
  // The person holds the Editor role, but this is their own work: no approve/reject is offered ...
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await shot(page, "cms-10a-own-submission-no-approve-offered");
  // ... and forcing the request is refused by the service layer
  const id = listing.split("/").pop() ?? "";
  const csrf = (await context.cookies()).find((c) => /csrf/.test(c.name))?.value ?? "";
  const forced = await page.request.post(`/api/v1/staff/opportunities/${id}/actions/approve`, {
    // Over HTTPS Django also requires a same-origin Referer; a browser sends one, page.request does not.
    headers: { "X-CSRFToken": csrf, Referer: listing },
    data: { row_version: 0, source_reviewed: true, duplicates_reviewed: true, content_matches_source: true },
  });
  expect(forced.status()).toBe(403);
  expect(((await forced.json()) as { error: { code: string } }).error.code).toBe("action_unavailable");
  await shot(page, "cms-10-self-approval-refused");
});

test("4. an independent Editor approves; a stale form is refused", async ({ browser }) => {
  const a = await login(browser, "editor");
  const b = await login(browser, "second");
  contexts.push(a.context, b.context);
  await a.page.goto("/workspace/opportunities?queue=review");
  await shot(a.page, "cms-11-review-queue");
  await expect(a.page.getByText(TITLE).first()).toBeVisible();
  await a.page.goto(state.listingUrl);
  await shot(a.page, "cms-12-editor-views-listing");
  // open the reject form in A (this page will go stale) ...
  await a.page.getByRole("button", { name: "Reject", exact: true }).first().click();
  await shot(a.page, "cms-13-reject-form");
  // ... while B approves
  await b.page.goto(state.listingUrl);
  await b.page.getByRole("button", { name: "Approve", exact: true }).first().click();
  await b.page.locator('form[aria-label="Approve"] button[type=submit]').click(); // incomplete checklist
  await shot(b.page, "cms-14-approve-incomplete");
  await expect(b.page.getByText("This field is required").first()).toBeVisible();
  for (const name of ["source_reviewed", "duplicates_reviewed", "content_matches_source"])
    await b.page.locator(`#act-approve-${name}`).check();
  await shot(b.page, "cms-15-approve-form");
  await b.page.locator('form[aria-label="Approve"] button[type=submit]').click();
  await expect(b.page.getByText("Done: Approve")).toBeVisible();
  await shot(b.page, "cms-16-approved");
  // A submits the stale reject form
  await a.page.locator("#act-reject-reason_code").fill("source_unclear");
  await a.page.locator("#act-reject-reason").fill("The cited source does not show the deadline.");
  await a.page.locator('form[aria-label="Reject"] button[type=submit]').click();
  await expect(a.page.getByRole("alert").first()).toContainText(
    /changed while this page was open|not available to you right now/i,
  );
  await shot(a.page, "cms-17-stale-form-refused");
});

test("5. an author cannot publish before approval; the approver publishes; it becomes public", async ({
  browser,
}) => {
  const c = await login(browser, "contributor");
  const e = await login(browser, "editor");
  contexts.push(c.context, e.context);
  await c.page.goto(state.listingUrl);
  await expect(c.page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0); // Contributor-only author
  await e.page.goto(state.listingUrl);
  await e.page.getByRole("button", { name: "Publish", exact: true }).first().click();
  await shot(e.page, "cms-18-publish-form");
  await e.page.locator('form[aria-label="Publish"] button[type=submit]').click();
  await expect(e.page.getByText("Done: Publish")).toBeVisible();
  await shot(e.page, "cms-19-published");
  const publicPage = await e.context.newPage();
  await publicPage.goto("/opportunities?q=" + encodeURIComponent(TITLE));
  await expect(publicPage.getByRole("link", { name: TITLE, exact: true })).toBeVisible();
  await publicPage.getByRole("link", { name: TITLE, exact: true }).click();
  state.slug = new URL(publicPage.url()).pathname.split("/").pop() ?? "";
  await expect(publicPage.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await shot(publicPage, "cms-20-public-page-after-publish");
  // a published listing is indexable, carries a JobPosting and is in the sitemap
  expect(await publicPage.locator('meta[name="robots"]').count()).toBe(0);
  const posting = (await publicPage.locator('script[type="application/ld+json"]').allTextContents())
    .map((t) => JSON.parse(t) as { "@type": string })
    .find((b) => b["@type"] === "JobPosting");
  expect(posting).toBeTruthy();
  const sitemap = await publicPage.request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain(`/opportunities/${state.slug}`);
});

test("6. amend, re-approve and publish: the public sees the live revision until then", async ({
  browser,
}) => {
  const c = await login(browser, "contributor");
  const e = await login(browser, "second");
  const anon = await browser.newContext({ baseURL: BASE });
  contexts.push(c.context, e.context, anon);
  const visitor = await anon.newPage();
  await c.page.goto(state.listingUrl);
  await c.page.getByRole("button", { name: "Start an amendment", exact: true }).first().click();
  await c.page.locator('form[aria-label="Start an amendment"] button[type=submit]').click();
  await expect(c.page.getByRole("link", { name: "Edit the draft" })).toBeVisible();
  await c.page.getByRole("link", { name: "Edit the draft" }).click();
  await c.page
    .locator("#summary")
    .fill("Amended: support community water projects, now including borehole surveys.");
  await saveAndView(c.page);
  await shot(c.page, "cms-21-amendment-draft");
  await visitor.goto(`/opportunities/${state.slug}`);
  await expect(visitor.getByText("Amended:")).toHaveCount(0); // not public yet
  await run(c.page, "Submit for review");
  await expect(c.page.getByText("Done: Submit for review")).toBeVisible();
  await e.page.goto(state.listingUrl);
  await e.page.getByRole("button", { name: "Approve", exact: true }).first().click();
  for (const name of ["source_reviewed", "duplicates_reviewed", "content_matches_source"])
    await e.page.locator(`#act-approve-${name}`).check();
  await e.page.locator('form[aria-label="Approve"] button[type=submit]').click();
  await expect(e.page.getByText("Done: Approve")).toBeVisible();
  await run(e.page, "Publish");
  await expect(e.page.getByText("Done: Publish")).toBeVisible();
  await shot(e.page, "cms-22-amendment-published-history");
  await visitor.goto(`/opportunities/${state.slug}`);
  await expect(visitor.getByText("Amended:")).toBeVisible();
});

test("7. withdraw: gone from active lists, direct link shows a clear notice", async ({ browser }) => {
  const e = await login(browser, "editor");
  const anon = await browser.newContext({ baseURL: BASE });
  contexts.push(e.context, anon);
  await e.page.goto(state.listingUrl);
  await run(e.page, "Withdraw", async () => {
    await e.page
      .locator("#act-withdraw-reason")
      .fill("The issuer withdrew this vacancy before the deadline.");
    await shot(e.page, "cms-23-withdraw-form");
  });
  await expect(e.page.getByText("Done: Withdraw")).toBeVisible();
  const visitor = await anon.newPage();
  await visitor.goto("/opportunities?q=" + encodeURIComponent(TITLE));
  await expect(visitor.getByRole("link", { name: TITLE, exact: true })).toHaveCount(0);
  await visitor.goto(`/opportunities/${state.slug}`);
  await expect(visitor.getByText(/withdrawn/i).first()).toBeVisible();
  await shot(visitor, "cms-24-withdrawn-public-direct-link");
  // withdrawn: readable by address, but not indexed, no JobPosting, and gone from the sitemap
  expect(await visitor.locator('meta[name="robots"]').first().getAttribute("content")).toContain("noindex");
  const types = (await visitor.locator('script[type="application/ld+json"]').allTextContents()).map(
    (t) => (JSON.parse(t) as { "@type": string })["@type"],
  );
  expect(types).not.toContain("JobPosting");
  expect(await (await visitor.request.get("/sitemap.xml")).text()).not.toContain(
    `/opportunities/${state.slug}`,
  );
});

test("8. administrators see the audit trail; mobile layout of the staff pages", async ({ browser }) => {
  const admin = await login(browser, "admin");
  contexts.push(admin.context);
  await admin.page.goto("/workspace/records/audit");
  await shot(admin.page, "cms-25-audit-events");
  await admin.page.goto("/workspace/records/audit?q=");
  await expect(admin.page.getByText("opportunity.publish").first()).toBeVisible();
  const mobile = await login(browser, "editor", { width: 390, height: 844 });
  contexts.push(mobile.context);
  await mobile.page.goto("/workspace/opportunities");
  await shot(mobile.page, "cms-26-mobile-listings");
  await mobile.page.goto(state.listingUrl);
  await shot(mobile.page, "cms-27-mobile-listing");
  expect(
    await mobile.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0); // no sideways scrolling of the page
});
