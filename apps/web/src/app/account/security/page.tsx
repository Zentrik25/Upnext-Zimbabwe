import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordPanel } from "@/components/account/account-panels";
import { AccountSection } from "@/components/account/settings-parts";
import { TwoStepPanel } from "@/components/account/two-step-panel";
import { EmptyState } from "@/components/ui";
import { getCurrentUser, getTwoStep } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Password & security", robots: { index: false } };

export default async function SecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Faccount%2Fsecurity");
  const twoStep = await getTwoStep();
  return (
    <AccountSection
      title="Password & security"
      description="Change your password and add a second step to signing in."
    >
      <PasswordPanel />
      {twoStep ? (
        <TwoStepPanel
          enabled={twoStep.enabled}
          codesLeft={twoStep.recovery_codes_left}
          staff={twoStep.staff}
        />
      ) : (
        <div role="alert">
          <EmptyState as="h2" title="Two-step verification is unavailable">
            The service could not be reached. Reload the page to try again.
          </EmptyState>
        </div>
      )}
    </AccountSection>
  );
}
