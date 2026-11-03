import type { Metadata } from "next";
import Link from "next/link";
import { FormPage } from "@/components/account/parts";
import { UnsubscribePanel } from "@/components/seeker/unsubscribe-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Stop job alerts",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  return (
    <FormPage title="Stop job alerts">
      {token ? (
        <UnsubscribePanel token={token} />
      ) : (
        <p className="text-base">
          This link is incomplete. Open the link in your alert e-mail, or{" "}
          <Link href="/alerts" className="text-accent underline">
            sign in to change your alerts
          </Link>
          .
        </p>
      )}
    </FormPage>
  );
}
