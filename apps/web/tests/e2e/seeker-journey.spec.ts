import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fillRegistration } from "./register";
import { lastEmail, linkIn, manage } from "./exec";

/**
 * Jobseeker journey (Phase 6B) against a throwaway stack: browse as a visitor, register, create a profile, see
 * For you follow it, save and remove, set up alerts, generate (never send) an alert, change and delete the
 * profile, and check that another account cannot read it. Needs E2E_SEEKER=1, E2E_ACCOUNTS=1 (mail spool),
 * E2E_EXEC (see exec.ts) and demo listings (seed_demo) with demo tools.
 * Set E2E_SCREENSHOT_DIR to keep screenshots as review evidence.
 */
test.skip(process.env.E2E_SEEKER !== "1", "needs the mail spool of a test stack (E2E_SEEKER=1)");
test.describe.configure({ mode: "serial" });

const SHOTS = process.env.E2E_SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const STAMP = Date.now().toString(36);
const EMAIL = `jobseeker.${STAMP}@example.org`;
const OTHER = `employer.viewer.${STAMP}@example.org`;
const NAME = "Rudo Chikwanha";
const PASSWORD = `copper meadow ${STAMP} lantern`;
const WIDTHS = [320, 390, 768, 1440];
const TOP_TITLE = "Graduate Electrical Engineer";

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("E-mail address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function register(page: Page, email: string, name: string) {
  await page.goto("/register");
  await fillRegistration(page, { name, email, password: PASSWORD });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your e-mail")).toBeVisible();
  const mail = await lastEmail(email, "email_verification");
  await page.goto(linkIn(mail.body));
  await page.getByRole("button", { name: "Confirm e-mail address" }).click();
  await expect(page.getByText("E-mail address confirmed")).toBeVisible();
}

/** The forms are controlled React inputs: a click before hydration is reverted, so wait until React owns the form. */
async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("#main form");
    return form !== null && Object.keys(form).some((key) => key.startsWith("__reactProps"));
  });
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

test("1. a visitor searches and browses without an account; personal pages send them to sign in", async ({
  page,
}) => {
  await page.goto("/opportunities");
  await expect(page.getByTestId("results").getByRole("article").first()).toBeVisible();
  await page.getByRole("searchbox").fill("engineer");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByTestId("results").getByRole("link", { name: TOP_TITLE }).first()).toBeVisible();
  await page.getByTestId("results").getByRole("link", { name: TOP_TITLE }).first().click();
  await expect(page.getByRole("heading", { name: TOP_TITLE, level: 1 })).toBeVisible();
  await expect(page.getByTestId("apply")).toBeVisible();
  // the header offers no For you link to visitors, and the personal pages ask for a sign-in
  await expect(page.getByRole("link", { name: "For you" })).toHaveCount(0);
  for (const path of ["/dashboard", "/for-you", "/profile", "/alerts"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  }
  // the unsubscribe page is the one personal page that needs no sign-in
  await page.goto("/alerts/unsubscribe");
  await expect(page.getByText("This link is incomplete")).toBeVisible();
});

test("2. registration and confirmation lead to a private profile that is optional", async ({ page }) => {
  await register(page, EMAIL, NAME);
  await signIn(page, EMAIL, "/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your UPNEXT", level: 1 })).toBeVisible();
  // nothing is required: an empty profile still gets the newest open opportunities
  await expect(page.getByTestId("dash-profile-line")).toHaveText("Nothing added yet. It is optional.");
  await expect(page.getByTestId("dash-alert-line")).toHaveText("Off.");
  await expect(page.getByTestId("dash-foryou").getByRole("article").first()).toBeVisible();
  await shot(page, "seeker-01-dashboard-empty");
  await axeClean(page, "dashboard (empty)");
  const nav = page.getByRole("navigation", { name: "Your UPNEXT" });
  await expect(nav.getByRole("link")).toHaveText(["Overview", "For you", "Saved", "Profile", "Alerts"]);

  await page.goto("/for-you");
  await expect(page.getByTestId("foryou-note")).toContainText("You have not chosen any preferences yet");
  await expect(page.getByTestId("why")).toHaveCount(0); // no reasons are invented
  await shot(page, "seeker-02-foryou-empty");
});

test("3. the profile is filled in step by step and saved; the dashboard reflects it", async ({ page }) => {
  await signIn(page, EMAIL, "/profile");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: "Your profile", level: 1 })).toBeVisible();
  await expect(page.getByTestId("profile-privacy")).toContainText("Only you can see this");
  await shot(page, "seeker-03-profile-empty");

  await page.getByLabel("Where you live").selectOption({ label: "Harare" });
  await page.getByLabel("Highest qualification").selectOption({ label: "Bachelor's degree" });
  await page.getByLabel("Experience", { exact: true }).selectOption({ label: "Entry level" });
  await page.getByLabel("Skills", { exact: true }).fill("auto");
  await page.getByRole("button", { name: "Add AutoCAD" }).click();
  await expect(page.getByTestId("skills")).toContainText("AutoCAD");
  await page.getByLabel("Jobs", { exact: true }).check();
  await page.getByLabel("Engineering", { exact: true }).check();
  await page.getByLabel("Permanent", { exact: true }).check();
  await page.getByLabel("On site", { exact: true }).check();
  await page.getByLabel("Harare", { exact: true }).check();
  await shot(page, "seeker-04-profile-filled");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Jobs", { exact: true })).toBeChecked();
  await expect(page.getByTestId("skills")).toContainText("AutoCAD");
  await axeClean(page, "profile");
  await page.goto("/dashboard");
  await expect(page.getByTestId("dash-profile-line")).toHaveText("9 of 9 details added.");
});

test("4. For you follows the preferences and explains every recommendation", async ({ page }) => {
  await signIn(page, EMAIL, "/for-you");
  const results = page.getByTestId("foryou-results");
  await expect(results.getByRole("article").first().getByRole("heading")).toHaveText(TOP_TITLE);
  const why = results.getByRole("article").first().getByTestId("why");
  await expect(why).toContainText("Matches your interest in Jobs.");
  await expect(why).toContainText("In an industry you follow: Engineering.");
  await expect(why).toContainText("Lists skills from your profile: AutoCAD.");
  await expect(why).toContainText("Located in Harare, one of your preferred places.");
  await expect(why).toContainText("Lists a minimum of Bachelor's degree, the same level as your profile.");
  await expect(page.getByTestId("foryou-note")).toContainText("Ordered by how many of your preferences");
  await shot(page, "seeker-05-foryou");
  await expect(page.locator("#main")).not.toContainText(/you qualify|you are eligible|guaranteed/i);
  await axeClean(page, "for you");

  // ordinary search is still there and still finds everything
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await expect(page.getByTestId("results").getByRole("article").first()).toBeVisible();

  // change the preferences: only grants now
  await page.goto("/profile");
  await hydrated(page);
  await page.getByLabel("Jobs", { exact: true }).uncheck();
  await page.getByLabel("Engineering", { exact: true }).uncheck();
  await page.getByLabel("Permanent", { exact: true }).uncheck();
  await page.getByLabel("On site", { exact: true }).uncheck();
  await page.getByLabel("Harare", { exact: true }).uncheck();
  await page.getByLabel("Grants", { exact: true }).check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await page.goto("/for-you");
  // The route streams a loading placeholder first; read the titles only once the recommendations are there.
  await expect(results.getByRole("article").first()).toBeVisible();
  const titles = await results.getByRole("article").getByRole("heading").allInnerTexts();
  expect(titles).toContain("Research Innovation Fund");
  const grant = results.getByRole("article").filter({ hasText: "Research Innovation Fund" });
  await expect(grant.getByTestId("why")).toContainText("Matches your interest in Grants.");
  // the engineer listing stays, but only for what the "About you" details still say (skills, experience,
  // qualification), not for the category or industry that were removed
  const engineer = results.getByRole("article").filter({ hasText: TOP_TITLE });
  await expect(engineer.getByTestId("why")).toContainText("Lists skills from your profile: AutoCAD.");
  await expect(engineer.getByTestId("why")).not.toContainText("Matches your interest in Jobs.");
  await expect(engineer.getByTestId("why")).not.toContainText("one of your preferred places");
  await shot(page, "seeker-06-foryou-grants");

  // reset keeps the about-you details and clears the preferences
  await page.goto("/profile");
  await hydrated(page);
  await page.getByRole("button", { name: "Reset preferences" }).click();
  await page.getByRole("button", { name: "Yes, clear preferences" }).click();
  await expect(page.getByText("Preferences cleared")).toBeVisible();
  await expect(page.getByLabel("Experience", { exact: true })).toHaveValue("entry");
  await expect(page.getByLabel("Grants", { exact: true })).not.toBeChecked();
  await page.goto("/for-you");
  await expect(results.getByRole("article").first().getByRole("heading")).toHaveText(TOP_TITLE);
  await expect(results.getByTestId("why").first()).toContainText("where your profile says you are based");
  expect((await results.getByTestId("why").allInnerTexts()).join(" ")).not.toContain("Matches your interest");
});

test("5. saving and removing from For you and the dashboard; closed listings are flagged", async ({
  page,
}) => {
  await signIn(page, EMAIL, "/for-you");
  const first = page.getByTestId("foryou-results").getByRole("article").first();
  const title = (await first.getByRole("heading").innerText()).trim();
  await first.getByRole("button", { name: `Save ${title}` }).click();
  await expect(first.getByRole("button", { name: `Save ${title}` })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/saved");
  await expect(page.getByTestId("saved-count")).toHaveText("1 saved listing");
  const row = page.getByTestId("saved-results").getByRole("article").first();
  await expect(row.getByTestId("saved-availability").getByRole("link")).toHaveText(
    "How to apply on the official site",
  );
  await expect(row.getByTestId("saved-availability").getByRole("link")).toHaveAttribute("href", /#apply$/);
  await row.getByTestId("saved-availability").getByRole("link").click();
  await expect(page.getByTestId("apply")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByTestId("dash-saved").getByRole("link", { name: title }).first()).toBeVisible();
  await shot(page, "seeker-07-dashboard-saved");
  await page
    .getByTestId("dash-saved")
    .getByRole("button", { name: `Save ${title}` })
    .click();
  await expect(page.getByText("You have not saved anything yet")).toBeVisible();
});

test("6. alerts are set up with explicit consent, generated locally and never duplicated", async ({
  page,
}) => {
  await signIn(page, EMAIL, "/alerts");
  await hydrated(page);
  await expect(page.getByTestId("alert-state")).toContainText("off");
  // this throwaway stack counts as verified, so the "not being sent yet" notice is absent here
  await expect(page.getByTestId("alerts-unavailable")).toHaveCount(0);
  await shot(page, "seeker-08-alerts-off");

  // consent is never pre-ticked and cannot be skipped
  await expect(page.getByRole("checkbox", { name: /Send me an e-mail/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Turn on job alerts" }).click();
  await expect(page.getByText("Choose at least one category or place")).toBeVisible();
  await page.getByLabel("Jobs", { exact: true }).check();
  await page.getByRole("button", { name: "Turn on job alerts" }).click();
  await expect(page.getByText("Tick the box to agree")).toBeVisible();
  await page.getByLabel("Daily").check();
  await page.getByRole("checkbox", { name: /Send me an e-mail/ }).check();
  await page.getByRole("button", { name: "Turn on job alerts" }).click();
  await expect(page.getByRole("status")).toContainText("opportunities published from now on");
  await expect(page.getByTestId("alert-state")).toContainText("on");
  await shot(page, "seeker-09-alerts-on");
  await axeClean(page, "alerts");
  await page.goto("/dashboard");
  await expect(page.getByTestId("dash-alert-line")).toContainText("On, daily: Jobs");

  // make the alert due and run a pass; the stack writes the message to a file, nothing leaves the machine
  expect(manage(`demo_alert_run --email ${EMAIL}`)).toContain("queued=1");
  const mail = await lastEmail(EMAIL, "job_alert");
  expect(mail.subject).toMatch(/new opportunities matching your UPNEXT Careers alert/);
  expect(mail.body).toContain(TOP_TITLE);
  expect(mail.body).toContain("/opportunities/");
  expect(mail.body).toContain("Stop these e-mails:");
  expect(mail.body).toContain("Change what you receive:");
  expect(mail.body.toLowerCase()).not.toContain("nextjob");
  expect(mail.body).not.toMatch(/Public Health Programme Assistant[\s\S]*Public Health Programme Assistant/);

  // a second pass has nothing new and sends nothing
  expect(manage(`demo_alert_run --email ${EMAIL} --days-back 0`)).toContain("queued=0");
});

test("7. the unsubscribe link in the e-mail works without signing in", async ({ browser }) => {
  const mail = await lastEmail(EMAIL, "job_alert");
  const link = /Stop these e-mails: (\S+)/.exec(mail.body)?.[1];
  expect(link).toBeTruthy();
  const context = await browser.newContext(); // no cookies: nobody is signed in
  const anonymous = await context.newPage();
  await anonymous.goto(link!);
  await expect(anonymous.getByRole("heading", { name: "Stop job alerts", level: 1 })).toBeVisible();
  await shot(anonymous, "seeker-10-unsubscribe");
  await axeClean(anonymous, "unsubscribe");
  await anonymous.getByRole("button", { name: "Stop job alert e-mails" }).click();
  await expect(anonymous.getByText("Job alerts are off")).toBeVisible();
  await context.close();
  expect(() => manage(`demo_alert_run --email ${EMAIL}`)).toThrow(); // no enabled alert is left
});

test("8. deleting the profile removes everything and For you falls back", async ({ page }) => {
  await signIn(page, EMAIL, "/alerts");
  await hydrated(page);
  await expect(page.getByTestId("alert-state")).toContainText("off"); // the unsubscribe took effect
  await page.goto("/profile");
  await hydrated(page);
  await page.getByRole("button", { name: "Delete profile" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete your whole profile?");
  await page.getByRole("button", { name: "Yes, delete my profile" }).click();
  await expect(page.getByText("Your profile was deleted")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Experience", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Delete profile" })).toBeDisabled();
  await page.goto("/dashboard");
  await expect(page.getByTestId("dash-profile-line")).toHaveText("Nothing added yet. It is optional.");
  await page.goto("/for-you");
  await expect(page.getByTestId("foryou-note")).toContainText("You have not chosen any preferences yet");
  await expect(page.getByTestId("why")).toHaveCount(0);
});

test("9. another account cannot read a profile, and there is no way to ask for one", async ({
  page,
  browser,
}) => {
  // give the first person's profile something to protect
  await signIn(page, EMAIL, "/profile");
  await hydrated(page);
  await page.getByLabel("Experience", { exact: true }).selectOption({ label: "Executive" });
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  const mine = await page.request.get("/api/v1/me/profile");
  expect((await mine.json()).experience_level).toBe("executive");

  const context = await browser.newContext();
  const other = await context.newPage();
  await register(other, OTHER, "Someone Else");
  await signIn(other, OTHER, "/dashboard");
  await expect(other).toHaveURL(/\/dashboard$/);
  const theirs = await other.request.get("/api/v1/me/profile");
  expect((await theirs.json()).exists).toBe(false); // their own, empty
  const alerts = await other.request.get("/api/v1/me/alerts");
  expect((await alerts.json()).enabled).toBe(false);
  for (const path of [
    "/api/v1/profiles",
    "/api/v1/employer/profiles",
    "/api/v1/employer/seekers",
    "/api/v1/users",
  ]) {
    expect((await other.request.get(path)).status(), path).toBe(404);
  }
  await context.close();
});

for (const width of WIDTHS) {
  test(`10. the jobseeker pages fit and stay accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, EMAIL, "/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/); // signed in before moving on
    for (const path of ["/dashboard", "/for-you", "/saved", "/profile", "/alerts"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`)); // not bounced to the sign-in page
      await noOverflow(page, `${path} at ${width}`);
      if (width === 320 || width === 1440) await axeClean(page, `${path} at ${width}`);
      await shot(page, `seeker-w${width}-${path.slice(1)}`);
    }
  });
}
