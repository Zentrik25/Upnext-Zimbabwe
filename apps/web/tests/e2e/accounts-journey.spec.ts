import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { lastEmail, linkIn } from "./exec";

/**
 * Seeker account journey against a throwaway stack: register, confirm by e-mail, sign in, save, manage the
 * account, reset the password. Needs E2E_ACCOUNTS=1, E2E_EXEC (see exec.ts) and demo listings (seed_demo).
 * Set E2E_SCREENSHOT_DIR to keep screenshots as review evidence.
 */
test.skip(process.env.E2E_ACCOUNTS !== "1", "needs the mail spool of a test stack (E2E_ACCOUNTS=1)");
test.describe.configure({ mode: "serial" });

const SHOTS = process.env.E2E_SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const STAMP = Date.now().toString(36);
const EMAIL = `seeker.${STAMP}@example.org`;
const NAME = "Tendai Moyo";
const PASSWORD = `first passphrase ${STAMP}`;
const NEW_PASSWORD = `second passphrase ${STAMP}`;
const THIRD_PASSWORD = `third passphrase ${STAMP}`;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function signIn(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("E-mail address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
  ).toEqual([]);
}

test("1. a visitor sees sign-in prompts, and private pages send them to sign in", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign in to save/ }).first()).toHaveAttribute(
    "href",
    /\/sign-in\?next=/,
  );
  await page.goto("/saved");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsaved/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount/);
});

test("2. registration validates, answers the same for any address, and blocks sign-in until confirmed", async ({
  page,
}) => {
  await page.goto("/register");
  await shot(page, "acct-01-register");
  await page.getByLabel("Name").fill(NAME);
  await page.getByLabel("E-mail address").fill(EMAIL);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  // browser validation (minlength) stops a too-short password before the server is asked
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel("Password").fill("password1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Error:")).toBeVisible();
  await shot(page, "acct-02-register-error");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your e-mail")).toBeVisible();
  await shot(page, "acct-03-register-accepted");
  await axeClean(page);

  await signIn(page, EMAIL, PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toContainText(
    "Confirm your e-mail address first",
  );
  await expect(page.getByRole("button", { name: "Send the link again" })).toBeVisible();
  await shot(page, "acct-04-signin-unverified");
});

test("3. the e-mailed link confirms the address (explicit click, token removed from the URL) and then sign-in works", async ({
  page,
}) => {
  const mail = await lastEmail(EMAIL, "email_verification");
  expect(mail.subject).toContain("Confirm");
  const link = linkIn(mail.body);
  await page.goto(link);
  await expect(page.getByRole("button", { name: "Confirm e-mail address" })).toBeVisible();
  await expect(page).toHaveURL(/\/verify-email$/); // token no longer in the address bar
  await shot(page, "acct-05-verify");
  await page.getByRole("button", { name: "Confirm e-mail address" }).click();
  await expect(page.getByText("E-mail address confirmed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Saved" })).toHaveCount(0); // confirming does not sign anyone in
  await shot(page, "acct-06-verified");

  await page.goto(link); // the link works once
  await page.getByRole("button", { name: "Confirm e-mail address" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toContainText("invalid or has expired");

  await signIn(page, EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Saved" })).toBeVisible();
  await shot(page, "acct-07-account");
});

test("4. a signed-in person can save and unsave from the list, the detail page and the saved page", async ({
  page,
}) => {
  await signIn(page, EMAIL, PASSWORD, "/opportunities");
  await expect(page).toHaveURL(/\/opportunities$/);
  const first = page.getByTestId("results").getByRole("article").first();
  const title = (await first.getByRole("heading").innerText()).trim();
  const heart = first.getByRole("button", { name: `Save ${title}` });
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await shot(page, "acct-08-list-saved");
  await page.reload();
  await expect(
    page
      .getByTestId("results")
      .getByRole("article")
      .first()
      .getByRole("button", { name: `Save ${title}` }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("results").getByRole("link", { name: title }).first().click();
  await expect(page.getByRole("button", { name: `Save ${title}` })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#main").getByText("Saved", { exact: true })).toBeVisible();
  await shot(page, "acct-09-detail-saved");

  await page.goto("/saved");
  await expect(page.getByTestId("saved-count")).toHaveText("1 saved listing");
  await expect(
    page.getByTestId("saved-results").getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await shot(page, "acct-10-saved-page");
  await axeClean(page);
  await page.getByRole("button", { name: `Save ${title}` }).click();
  await expect(page.getByText("You have not saved anything yet")).toBeVisible();
  await shot(page, "acct-11-saved-empty");
  await axeClean(page);
});

test("5. account settings: name, password, sessions, deletion request", async ({ page, browser }) => {
  await signIn(page, EMAIL, PASSWORD);
  await page.getByLabel("Name").fill("Tendai M. Moyo");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Tendai M\. Moyo/ })).toBeVisible();

  const other = await browser.newContext();
  const second = await other.newPage();
  await signIn(second, EMAIL, PASSWORD);
  await expect(second).toHaveURL(/\/account$/);

  await page.reload();
  // earlier tests of this journey left their own sessions signed in, so there are several
  const sessions = page.getByRole("list", { name: "Sessions" });
  await expect(sessions.getByRole("listitem")).not.toHaveCount(1);
  await expect(page.getByText("(this browser)")).toBeVisible();
  await shot(page, "acct-12-sessions");
  const others = sessions.getByRole("button", { name: /^Sign out/ });
  while ((await others.count()) > 0) {
    const before = await sessions.getByRole("listitem").count();
    await others.first().click();
    await expect(sessions.getByRole("listitem")).toHaveCount(before - 1);
  }
  await second.goto("/account");
  await expect(second).toHaveURL(/\/sign-in\?next=%2Faccount/); // the revoked session is gone
  await other.close();

  await page.getByLabel("Current password").fill("not my password at all");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toContainText("not correct");
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed. Your other sessions were signed out.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible(); // this session survived

  await page.getByRole("button", { name: "Delete my account…" }).click();
  await page.getByLabel("Password").last().fill("not my password at all");
  await page.getByRole("button", { name: "Request deletion" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toContainText("not correct");
  await page.getByLabel("Password").last().fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Request deletion" }).click();
  await expect(page.getByText(/Deletion requested on/)).toBeVisible();
  await shot(page, "acct-13-deletion-requested");
  await axeClean(page);
  await page.getByRole("button", { name: "Cancel the request" }).click();
  await expect(page.getByRole("button", { name: "Delete my account…" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("6. forgotten password: uniform answer, one-time link, all sessions ended, old password dead", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("E-mail address").fill("nobody." + STAMP + "@example.org");
  await page.getByRole("button", { name: "Send reset link" }).click();
  const unknown = await page.getByRole("status").innerText();
  await page.goto("/forgot-password");
  await page.getByLabel("E-mail address").fill(EMAIL);
  await page.getByRole("button", { name: "Send reset link" }).click();
  expect(await page.getByRole("status").innerText()).toBe(unknown);
  await shot(page, "acct-14-forgot-sent");

  const mail = await lastEmail(EMAIL, "password_reset");
  const link = linkIn(mail.body);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password$/);
  await shot(page, "acct-15-reset");
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/reset-password$/); // minlength stops it in the browser
  await page.getByLabel("New password").fill(THIRD_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();
  await axeClean(page);

  await signIn(page, EMAIL, NEW_PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toContainText(
    "Incorrect e-mail or password.",
  );
  await signIn(page, EMAIL, THIRD_PASSWORD);
  await expect(page).toHaveURL(/\/account$/);

  await page.goto(link); // the link was used: the form opens, but submitting it is refused
  await page.getByLabel("New password").fill(`${THIRD_PASSWORD} again`);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toContainText("invalid or has expired");
});

test("7. sign-in only follows safe return addresses", async ({ page }) => {
  for (const next of ["https://evil.example/", "//evil.example", "/staff/", "/api/v1/me"]) {
    await signIn(page, EMAIL, THIRD_PASSWORD, next);
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole("button", { name: "Sign out" }).first().click();
  }
});

test("8. the account pages fit every width and are accessible", async ({ page }) => {
  for (const path of ["/register", "/sign-in", "/forgot-password"]) {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
      await shot(page, `acct-resp-${path.slice(1)}-${width}`);
    }
    await axeClean(page);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await signIn(page, EMAIL, THIRD_PASSWORD);
  await shot(page, "acct-16-account-390");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  await axeClean(page);
});
