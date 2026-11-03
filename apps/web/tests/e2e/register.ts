import type { Page } from "@playwright/test";

/** Fills the registration form (the same on /register and /employers/register); does not submit. */
export async function fillRegistration(
  page: Page,
  v: { name: string; email: string; password: string; confirm?: string; agree?: boolean },
) {
  await page.getByLabel("Full name").fill(v.name);
  await page.getByLabel("E-mail address").fill(v.email);
  await page.getByLabel("Phone number").fill("078 123 4567");
  await page.getByLabel("Password", { exact: true }).fill(v.password);
  await page.getByLabel("Confirm password").fill(v.confirm ?? v.password);
  if (v.agree !== false) await page.getByLabel(/I agree to the/).check();
}
