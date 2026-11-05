import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fillRegistration } from "./register";
import { lastEmail, linkIn, manage } from "./exec";

/**
 * Employer portal journey (Phase 6A) against a throwaway stack: register, confirm, claim an organisation, staff
 * verify it, company profile, post a listing, editors review it, the public sees it, counters appear.
 * Needs E2E_EMPLOYER=1, E2E_ACCOUNTS=1 (mail spool), E2E_EXEC and seeded demo staff (seed_demo) with demo tools.
 */
test.skip(process.env.E2E_EMPLOYER !== "1", "needs a throwaway stack with demo tools (E2E_EMPLOYER=1)");
test.describe.configure({ mode: "serial" });

const STAMP = Date.now().toString(36);
const EMAIL = `employer.${STAMP}@example.org`;
const PASSWORD = `harvest lantern ${STAMP} brook`;
const ORG = `Zambezi Mining ${STAMP}`;
const TITLE = `Mining Engineer ${STAMP}`;
const SECOND_TITLE = `Safety Officer ${STAMP}`;
const WIDTHS = [320, 390, 768, 1440];

// Whatever happens, the listing this run published is withdrawn so other specs see the demo data they expect.
test.afterAll(() => {
  try {
    manage(`demo_employer_review --withdraw-listing "${TITLE}"`);
  } catch {
    /* it was never published, or already withdrawn */
  }
});

async function signIn(page: Page, next?: string) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("E-mail address").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function axeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `axe ${label}`,
  ).toEqual([]);
}

async function noOverflow(page: Page, label: string) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    `horizontal scroll ${label}`,
  ).toBeLessThanOrEqual(0);
}

function closingDay(): string {
  const d = new Date(Date.now() + 60 * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function fillListing(page: Page, title: string, extra = "") {
  await page.getByLabel("Job title").fill(title);
  await page
    .getByLabel("Job overview")
    .fill("Plan and supervise underground works at a fictional mine near Kwekwe.");
  await page
    .getByLabel("Key responsibilities")
    .fill(
      `This is a fictional vacancy used only in browser tests. ${extra} The engineer plans and supervises work.`,
    );
  await page.getByLabel("Location", { exact: true }).fill("Harare");
  await page.getByLabel("Job type").selectOption("permanent");
  await page.getByLabel(/^Closing date/).fill(closingDay());
  await page
    .getByLabel("Application website")
    .fill(`https://careers.example.org/${STAMP}/${title.split(" ")[0]!.toLowerCase()}`);
}

test("1. the public pages for employers exist, say what happens and need no account", async ({ page }) => {
  await page.goto("/employers");
  await expect(page.getByRole("heading", { level: 1, name: "For employers" })).toBeVisible();
  await expect(page.getByText("We never receive or track applications")).toBeVisible();
  await expect(page).toHaveTitle(/For Employers \| UPNEXT Careers/); // priority destination 7 (D-69)
  await expect(page.getByRole("link", { name: "For employers" }).last()).toBeVisible(); // footer link
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/employers");
    await axeClean(page, `/employers @${width}`);
    await noOverflow(page, `/employers @${width}`);
  }
  await page.goto("/employer");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Femployer/);
});

test("2. an employer registers, confirms the address and signs in to an empty dashboard", async ({
  page,
}) => {
  await page.goto("/employers/register");
  await fillRegistration(page, { name: "Rudo Chikwanha", email: EMAIL, password: PASSWORD });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your e-mail")).toBeVisible();
  const mail = await lastEmail(EMAIL, "email_verification");
  await page.goto(linkIn(mail.body));
  await page.getByRole("button", { name: "Confirm e-mail address" }).click();
  await expect(page.getByText("E-mail address confirmed")).toBeVisible();
  await signIn(page, "/employer");
  await expect(page).toHaveURL(/\/employer$/);
  await expect(page.getByRole("heading", { level: 1, name: "Employer Dashboard" })).toBeVisible();
  await expect(page.getByText("You do not act for an organisation yet")).toBeVisible();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/employer");
    await axeClean(page, `/employer @${width}`);
    await noOverflow(page, `/employer @${width}`);
  }
});

test("3. a claim grants nothing until staff verify the organisation", async ({ page }) => {
  await signIn(page, "/employer/claim");
  await page.getByLabel("Organisation name").fill(ORG);
  await page.getByLabel("Your role").fill("HR manager");
  await page
    .getByLabel(/How can we confirm/)
    .fill(`Our official address is hr@zambezi.example.org (browser test ${STAMP}).`);
  await page.getByRole("button", { name: "Send claim for review" }).click();
  await expect(page).toHaveURL(/\/employer$/);
  await expect(page.getByTestId("claims")).toContainText(ORG);
  await expect(page.getByTestId("claims")).toContainText("Waiting for review");
  await expect(page.getByRole("link", { name: "Create Opportunity" })).toHaveCount(0);
  // staff verify it (the demo editor, through the real service)
  manage(`demo_employer_review --approve-claim ${EMAIL}`);
  await page.reload();
  await expect(page.getByTestId("active-organisation")).toContainText(ORG);
  await expect(page.getByRole("link", { name: "Create Opportunity" }).first()).toBeVisible();
  await expect(page.getByTestId("stat-total")).toHaveText("0"); // real counts, nothing invented
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page, `dashboard with organisation @${width}`);
  }
});

test("4. a company profile is public only after an editor approves it", async ({ page }) => {
  await signIn(page, "/employer");
  await page.getByRole("link", { name: /Company profile/ }).click();
  await expect(page.getByText("There is no public profile yet.")).toBeVisible();
  await page.getByLabel("Tagline (optional)").fill("Digging responsibly");
  await page
    .getByLabel("About the organisation")
    .fill(
      "Zambezi Mining is a fictional company used only in browser tests. It describes itself in plain words.",
    );
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText(/Sent for review/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/A change is waiting for review/)).toBeVisible();
  await expect(page.getByTestId("profile-live")).toHaveCount(0);
  manage(`demo_employer_review --approve-profile "${ORG}"`);
  await page.reload();
  await expect(page.getByTestId("profile-live")).toContainText("Digging responsibly");
  await page.getByRole("link", { name: "View the public page" }).click();
  await expect(page.getByRole("heading", { level: 1, name: ORG })).toBeVisible();
  await expect(page.getByText("Verified organisation")).toBeVisible();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await axeClean(page, `public profile @${width}`);
    await noOverflow(page, `public profile @${width}`);
  }
});

test("4b. signing in with no return address lands on the employer dashboard, never the Account page", async ({
  page,
}) => {
  await signIn(page); // no ?next=
  await expect(page).toHaveURL(/\/employer$/);
  await expect(page.getByRole("heading", { level: 1, name: "Employer Dashboard" })).toBeVisible();
  // already signed in: the sign-in page sends them straight back, with no loop
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/employer$/);
  // the Account page stays reachable for profile and settings
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account settings", exact: true })).toBeVisible();
  // an open redirect is refused: the hostile address is ignored and the dashboard is used
  await page.goto("/sign-in?next=https%3A%2F%2Fevil.example%2F");
  await expect(page).toHaveURL(/\/employer$/);
  // a staff-only return address is not honoured for an employer
  await page.goto("/sign-in?next=%2Fworkspace");
  await expect(page).toHaveURL(/\/employer$/);
});

const READER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

test("5. a listing goes through editors before the public sees it, and counters appear", async ({
  page,
  browser,
}) => {
  await signIn(page, "/employer");
  await page.getByRole("link", { name: "Create Opportunity" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Create Opportunity" })).toBeVisible();
  await expect(page.getByTestId("organisation-fixed")).toContainText(ORG); // no organisation field to fill
  await fillListing(page, TITLE);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/employer\/listings\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(page.getByText("In review").first()).toBeVisible();
  await expect(page.getByTestId("listing-readonly")).toContainText("Waiting for an editor");
  await expect(page.getByTestId("opportunity-form")).toHaveCount(0); // frozen while in review
  const listingUrl = page.url();

  // not public yet. Views from automated browsers are deliberately not counted (D-65), so the readers in this
  // test present an ordinary browser User-Agent and hide the automation flag, as a person's browser would.
  const visitor = await browser.newContext({ userAgent: READER_AGENT });
  await visitor.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  const anon = await visitor.newPage();
  await anon.goto(`/opportunities?q=${encodeURIComponent(TITLE)}`);
  await expect(anon.getByText(TITLE)).toHaveCount(0);

  manage(`demo_employer_review --publish-listing "${TITLE}"`);
  await page.goto("/employer");
  const row = page.getByTestId("employer-listing").filter({ hasText: TITLE });
  await expect(row).toContainText("Active");

  // the public page shows the employer's profile link; viewing it is counted, nothing identifies the visitor
  await page.goto(listingUrl);
  await page.getByRole("link", { name: "View the public listing" }).click();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByRole("link", { name: ORG })).toHaveAttribute("href", /\/employers\//);
  await expect(page.getByText(TITLE).first()).toBeVisible();
  const publicUrl = page.url();
  await anon.goto(publicUrl);
  await expect(anon.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await visitor.close();

  await expect(async () => {
    await page.goto("/employer");
    // the Views column of the listing's own row (type, location, status, then views and apply clicks)
    const views = page.getByTestId("employer-listing").filter({ hasText: TITLE }).locator("td").nth(3);
    await expect(views).toHaveText(/^[1-9]/);
    await expect(page.getByTestId("total-views")).toHaveText(/^[1-9]/);
  }).toPass({ timeout: 15000 });
  await expect(page.getByTestId("tracking-note")).toContainText("never receives applications");
});

test("6. a returned listing shows the editor's reason and can be reopened and resubmitted", async ({
  page,
}) => {
  await signIn(page, "/employer");
  await page.getByRole("link", { name: "Create Opportunity" }).first().click();
  await fillListing(page, SECOND_TITLE, "A second fictional vacancy.");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("In review").first()).toBeVisible();
  manage(`demo_employer_review --reject-listing "${SECOND_TITLE}"`);
  await page.reload();
  await expect(page.getByTestId("decision")).toContainText("the closing date needs to be clearer");
  await page.getByTestId("action-reopen").click();
  await expect(page.getByTestId("opportunity-form")).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("In review").first()).toBeVisible();
});

test("7. an employer cannot reach staff pages or other people's pages", async ({ page }) => {
  await signIn(page, "/employer");
  await expect(page).toHaveURL(/\/employer$/);
  // someone else's id looks exactly like an id that does not exist
  await page.goto("/employer/listings/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await page.goto("/employer/organisations/00000000-0000-4000-8000-000000000000/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/employer$/); // not staff: sent to their own dashboard, never shown a staff page
});
