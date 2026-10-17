import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Browser-level review of the Django Admin editorial CMS (/staff/) with the fictional demo staff accounts.
 * Needs `seed_demo --force` run with UPNEXT_DEMO_PASSWORD set to the same value as E2E_DEMO_PASSWORD
 * (throwaway local/CI stacks only; never real credentials). Run with E2E_CMS=1.
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
  await page.goto("/staff/login/?next=/staff/");
  await page.getByLabel("Email").or(page.locator("#id_username")).first().fill(accounts[who]);
  await page.locator("#id_password").fill(PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByRole("heading", { name: "Editorial workspace" })).toBeVisible();
  return { context, page };
}

/** Select2 (admin autocomplete) helper. */
async function pick(page: Page, selector: string, text: string) {
  await page.locator(`${selector} + .select2 .select2-selection`).click();
  await page.locator(".select2-search__field").fill(text);
  await page
    .locator(".select2-results__option--highlighted, .select2-results__option[aria-selected]")
    .first()
    .waitFor();
  await page.locator(".select2-results__option").filter({ hasText: text }).first().click();
}

/** Fills the revision editor with a complete, valid listing (unique addresses via `tag`). */
async function fillDraft(page: Page, tag: string) {
  await page
    .locator("#id_summary")
    .fill("Support community water projects and site visits for a water authority in Harare.");
  await page
    .locator("#id_description_md")
    .fill(
      "Example Water Authority is recruiting a **Field Officer** to support community water projects across the province.\n\n- Visit sites\n- Prepare reports",
    );
  await page.locator("#id_employment_type").selectOption("contract");
  await page.locator("#id_work_mode").selectOption("on_site");
  const day = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  await page.locator("#id_deadline_date").fill(day);
  await page.locator("#id_deadline_time").fill("16:30");
  await page.locator("#id_deadline_timezone").fill("Africa/Harare");
  await page.locator("#id_application_url").fill(`https://water.example.org/vacancies/field-officer-${tag}`);
  await pick(page, "#id_locations-0-location", "Harare");
  await page.locator("#id_locations-0-is_primary").check();
  await page.locator("#id_sources-0-kind").selectOption("issuer_website");
  await page.locator("#id_sources-0-name").fill("Example Water Authority vacancies page");
  await page.locator("#id_sources-0-url").fill(`https://water.example.org/vacancies/${tag}`);
  await page.locator("#id_sources-0-observed_on").fill(new Date().toISOString().slice(0, 10));
  await page.locator("#id_sources-0-is_primary").check();
}

const state: { editUrl: string; listingUrl: string; slug: string } = {
  editUrl: "",
  listingUrl: "",
  slug: "",
};
let contexts: BrowserContext[] = [];
test.afterAll(async () => {
  await Promise.all(contexts.map((c) => c.close()));
});

test("1. a Contributor starts a draft and fills it in", async ({ browser }) => {
  const { context, page } = await login(browser, "contributor");
  contexts.push(context);
  await shot(page, "cms-01-index-contributor");
  await expect(page.getByRole("link", { name: /Audit events/ })).toHaveCount(0); // administrators only
  await page.goto("/staff/opportunities/opportunity/");
  await shot(page, "cms-02-listings-contributor");
  await page.goto("/staff/opportunities/opportunity/add/");
  await shot(page, "cms-03-start-listing");
  await page.getByLabel("Category").selectOption({ label: "Jobs" });
  await page.getByLabel("Organisation").selectOption({ label: "Example Water Authority" });
  await page.getByLabel("Title").fill(TITLE);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Draft created")).toBeVisible();
  state.editUrl = page.url();
  await shot(page, "cms-04-draft-editor-empty");

  await fillDraft(page, TAG);
  await shot(page, "cms-05-draft-editor-filled");
  await page
    .getByRole("button", { name: /^Save$/ })
    .first()
    .click()
    .catch(async () => page.locator("input[name=_save]").click());
  await expect(page).toHaveURL(/\/opportunity\/[0-9a-f-]+\/change\/$/);
  state.listingUrl = page.url();
  await shot(page, "cms-06-listing-after-save");
});

test("2. submit for review; the author cannot approve", async ({ browser }) => {
  const { context, page } = await login(browser, "contributor");
  contexts.push(context);
  await page.goto(state.listingUrl);
  await expect(page.getByRole("link", { name: "Submit for review" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Approve" })).toHaveCount(0);
  await page.getByRole("link", { name: "Submit for review" }).click();
  await shot(page, "cms-07-submit-form");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.locator(".messagelist")).toContainText("Done: Submit for review");
  await expect(page.locator("main, #content").first()).toContainText("In review");
  await shot(page, "cms-08-listing-in-review");
  // the frozen revision cannot be edited any more
  const revisionLink = page.getByRole("link", { name: "Open the full revision" }).first();
  await revisionLink.click();
  await shot(page, "cms-09-frozen-revision");
  await expect(page.getByText(/frozen: a change needs a new revision/i)).toBeVisible();
  expect(await page.locator("#id_title").count()).toBe(0); // shown as text, not an input
  await shot(page, "cms-09-frozen-revision");
});

test("3. self-approval is refused even for someone who holds an editor role", async ({ browser }) => {
  const { context, page } = await login(browser, "second"); // holds Editor and Contributor
  contexts.push(context);
  await page.goto("/staff/opportunities/opportunity/add/");
  await page.getByLabel("Category").selectOption({ label: "Jobs" });
  await page.getByLabel("Organisation").selectOption({ label: "Example Health Alliance" });
  await page.getByLabel("Title").fill(`${TITLE} (self-review attempt)`);
  await page.getByRole("button", { name: "Create draft" }).click();
  await fillDraft(page, `${TAG}-self`);
  await page.locator("input[name=_save]").click();
  await expect(page).toHaveURL(/\/opportunity\/[0-9a-f-]+\/change\/$/);
  const listing = page.url();
  await page.getByRole("link", { name: "Submit for review" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.locator(".messagelist")).toContainText("Done: Submit for review");
  // The person holds the Editor role, but this is their own work: no approve/reject is offered ...
  await expect(page.getByRole("link", { name: "Approve" })).toHaveCount(0);
  await shot(page, "cms-10a-own-submission-no-approve-offered");
  // ... and forcing the address is refused with an explanation
  const id = listing.match(/opportunity\/([0-9a-f-]+)\//)?.[1] ?? "";
  const response = await page.goto(`/staff/opportunities/opportunity/${id}/action/approve/`);
  expect(response?.url()).toContain("/change/");
  await expect(page.locator(".messagelist")).toContainText("not available to you right now");
  await shot(page, "cms-10-self-approval-refused");
});

test("4. an independent Editor approves; a stale form is refused", async ({ browser }) => {
  const a = await login(browser, "editor");
  const b = await login(browser, "second");
  contexts.push(a.context, b.context);
  await a.page.goto("/staff/opportunities/opportunity/?queue=review");
  await shot(a.page, "cms-11-review-queue");
  await expect(a.page.getByText(TITLE).first()).toBeVisible();
  await a.page.goto(state.listingUrl);
  await shot(a.page, "cms-12-editor-views-listing");
  // open the reject form in A (this page will go stale) ...
  await a.page.getByRole("link", { name: "Reject" }).click();
  await shot(a.page, "cms-13-reject-form");
  // ... while B approves
  await b.page.goto(state.listingUrl);
  await b.page.getByRole("link", { name: "Approve" }).click();
  await b.page.getByRole("button", { name: "Approve" }).click(); // incomplete checklist
  await shot(b.page, "cms-14-approve-incomplete");
  await expect(b.page.getByText("This field is required").first()).toBeVisible();
  for (const name of ["source_reviewed", "duplicates_reviewed", "content_matches_source"])
    await b.page.locator(`#id_${name}`).check();
  await shot(b.page, "cms-15-approve-form");
  await b.page.getByRole("button", { name: "Approve" }).click();
  await expect(b.page.getByText("Done: Approve")).toBeVisible();
  await shot(b.page, "cms-16-approved");
  // A submits the stale reject form
  await a.page.locator("#id_reason_code").fill("source_unclear");
  await a.page.locator("#id_reason").fill("The cited source does not show the deadline.");
  await a.page.getByRole("button", { name: "Reject" }).click();
  await expect(a.page.locator(".messagelist")).toContainText(
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
  await expect(c.page.getByRole("link", { name: "Publish" })).toHaveCount(0); // Contributor-only author
  await e.page.goto(state.listingUrl);
  await e.page.getByRole("link", { name: "Publish" }).click();
  await shot(e.page, "cms-18-publish-form");
  await e.page.getByRole("button", { name: "Publish" }).click();
  await expect(e.page.getByText("Done: Publish")).toBeVisible();
  await shot(e.page, "cms-19-published");
  const publicPage = await e.context.newPage();
  await publicPage.goto("/opportunities?q=" + encodeURIComponent(TITLE));
  await expect(publicPage.getByRole("link", { name: TITLE, exact: true })).toBeVisible();
  await publicPage.getByRole("link", { name: TITLE, exact: true }).click();
  state.slug = new URL(publicPage.url()).pathname.split("/").pop() ?? "";
  await expect(publicPage.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await shot(publicPage, "cms-20-public-page-after-publish");
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
  await c.page.getByRole("link", { name: "Start an amendment" }).click();
  await c.page.getByRole("button", { name: "Start an amendment" }).click();
  await c.page.getByRole("link", { name: "Edit the draft" }).click();
  await c.page
    .locator("#id_summary")
    .fill("Amended: support community water projects, now including borehole surveys.");
  await c.page.locator("input[name=_save]").click();
  await shot(c.page, "cms-21-amendment-draft");
  await visitor.goto(`/opportunities/${state.slug}`);
  await expect(visitor.getByText("Amended:")).toHaveCount(0); // not public yet
  await c.page.goto(state.listingUrl);
  await c.page.getByRole("link", { name: "Submit for review" }).click();
  await c.page.getByRole("button", { name: "Submit for review" }).click();
  await e.page.goto(state.listingUrl);
  await e.page.getByRole("link", { name: "Approve" }).click();
  for (const name of ["source_reviewed", "duplicates_reviewed", "content_matches_source"])
    await e.page.locator(`#id_${name}`).check();
  await e.page.getByRole("button", { name: "Approve" }).click();
  await e.page.getByRole("link", { name: "Publish" }).click();
  await e.page.getByRole("button", { name: "Publish" }).click();
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
  await e.page.getByRole("link", { name: "Withdraw" }).click();
  await e.page.locator("#id_reason").fill("The issuer withdrew this vacancy before the deadline.");
  await shot(e.page, "cms-23-withdraw-form");
  await e.page.getByRole("button", { name: "Withdraw" }).click();
  await expect(e.page.getByText("Done: Withdraw")).toBeVisible();
  const visitor = await anon.newPage();
  await visitor.goto("/opportunities?q=" + encodeURIComponent(TITLE));
  await expect(visitor.getByRole("link", { name: TITLE, exact: true })).toHaveCount(0);
  await visitor.goto(`/opportunities/${state.slug}`);
  await expect(visitor.getByText(/withdrawn/i).first()).toBeVisible();
  await shot(visitor, "cms-24-withdrawn-public-direct-link");
});

test("8. administrators see the audit trail; mobile layout of the staff pages", async ({ browser }) => {
  const admin = await login(browser, "admin");
  contexts.push(admin.context);
  await admin.page.goto("/staff/audit/auditevent/?q=");
  await shot(admin.page, "cms-25-audit-events");
  await expect(admin.page.getByText("opportunity.publish").first()).toBeVisible();
  const mobile = await login(browser, "editor", { width: 390, height: 844 });
  contexts.push(mobile.context);
  await mobile.page.goto("/staff/opportunities/opportunity/");
  await shot(mobile.page, "cms-26-mobile-listings");
  await mobile.page.goto(state.listingUrl);
  await shot(mobile.page, "cms-27-mobile-listing");
});
