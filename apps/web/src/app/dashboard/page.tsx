import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout";
import { SavedRow } from "@/components/opportunities/saved-row";
import { RecommendedRow } from "@/components/seeker/recommended-row";
import { SeekerNav } from "@/components/seeker/seeker-nav";
import { EmptyState, Panel } from "@/components/ui";
import { getCurrentUser, getForYou, getJobAlert, getProfile, getSaved } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your NextJob", robots: { index: false } };

const FEW = new URLSearchParams({ limit: "3" });

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Fdashboard");
  const [forYou, saved, profile, alert] = await Promise.all([
    getForYou(FEW),
    getSaved(FEW),
    getProfile(),
    getJobAlert(),
  ]);
  const alertLine = !alert
    ? "Unavailable right now."
    : alert.enabled
      ? `On, ${alert.frequency}: ${[...alert.categories.map((c) => c.name), ...alert.locations.map((l) => l.name)].join(", ")}.`
      : "Off.";

  return (
    <>
      <section aria-labelledby="dash-title" className="border-b border-line py-[22px]">
        <Container>
          <h1 id="dash-title" className="text-section font-strong tracking-section">
            Your NextJob
          </h1>
          <p className="mt-1 text-base text-muted">
            Welcome, {user.display_name}.{" "}
            <Link href="/opportunities" className="text-accent underline">
              Search all opportunities
            </Link>
          </p>
        </Container>
      </section>
      <SeekerNav current="dashboard" />
      <Container className="grid gap-8 pt-[18px] pb-[65px]">
        <section aria-labelledby="dash-foryou">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="dash-foryou" className="text-title font-strong">
              Recommended for you
            </h2>
            <Link href="/for-you" className="text-ctl text-accent underline">
              See all
            </Link>
          </div>
          {!forYou.ok ? (
            <EmptyState title="Recommendations are unavailable" className="mt-2">
              Try again shortly.
            </EmptyState>
          ) : forYou.data.data.length === 0 ? (
            <EmptyState title="Nothing open right now" className="mt-2">
              Check back soon.
            </EmptyState>
          ) : (
            <>
              {forYou.data.meta.mode === "newest" ? (
                <p className="mt-1 text-small text-muted">
                  Showing the newest open opportunities.{" "}
                  <Link href="/profile" className="text-accent underline">
                    Add your preferences
                  </Link>{" "}
                  for matches.
                </p>
              ) : null}
              <div className="mt-2 border-t border-line" data-testid="dash-foryou">
                {forYou.data.data.map((row) => (
                  <RecommendedRow key={row.opportunity.id} row={row} returnTo="/dashboard" />
                ))}
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="dash-saved">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="dash-saved" className="text-title font-strong">
              Saved
            </h2>
            <Link href="/saved" className="text-ctl text-accent underline">
              See all
            </Link>
          </div>
          {!saved.ok ? (
            <EmptyState title="Your saved list is unavailable" className="mt-2">
              Try again shortly.
            </EmptyState>
          ) : saved.data.length === 0 ? (
            <EmptyState title="You have not saved anything yet" className="mt-2">
              Use the heart on a listing to keep it here.
            </EmptyState>
          ) : (
            <div className="mt-2 border-t border-line" data-testid="dash-saved">
              {saved.data.map((item) => (
                <SavedRow key={item.opportunity_id} item={item} />
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Panel role="region" aria-labelledby="dash-profile">
            <h2 id="dash-profile" className="text-title font-strong">
              Profile and preferences
            </h2>
            <p className="mt-1 text-base" data-testid="dash-profile-line">
              {profile === null
                ? "Unavailable right now."
                : profile.fields_filled === 0
                  ? "Nothing added yet. It is optional."
                  : `${profile.fields_filled} of ${profile.fields_total} details added.`}
            </p>
            <p className="mt-2">
              <Link href="/profile" className="text-ctl text-accent underline">
                Edit profile
              </Link>
            </p>
          </Panel>
          <Panel role="region" aria-labelledby="dash-alerts">
            <h2 id="dash-alerts" className="text-title font-strong">
              Job alerts
            </h2>
            <p className="mt-1 text-base" data-testid="dash-alert-line">
              {alertLine}
            </p>
            <p className="mt-2">
              <Link href="/alerts" className="text-ctl text-accent underline">
                Change alerts
              </Link>
            </p>
          </Panel>
        </div>
      </Container>
    </>
  );
}
