import type { Metadata } from "next";
import { VerifyEmailPanel } from "@/components/account/verify-email-panel";
import { FormPage } from "@/components/account/parts";

export const dynamic = "force-dynamic";
// The address carries a one-time token: never leak it through the Referer header or search indexes.
export const metadata: Metadata = {
  title: "Confirm your e-mail",
  robots: { index: false },
  referrer: "no-referrer",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) || null;
  return (
    <FormPage title="Confirm your e-mail address">
      <VerifyEmailPanel token={token} />
    </FormPage>
  );
}
