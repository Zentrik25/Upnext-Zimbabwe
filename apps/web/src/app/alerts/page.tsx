import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout";
import { AlertForm } from "@/components/seeker/alert-form";
import { SeekerNav } from "@/components/seeker/seeker-nav";
import { EmptyState } from "@/components/ui";
import { listCategories, listLocations } from "@/lib/catalog";
import { getCurrentUser, getJobAlert } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Job alerts", robots: { index: false } };

export default async function AlertsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Falerts");
  const [alert, categories, locations] = await Promise.all([
    getJobAlert(),
    listCategories(),
    listLocations(),
  ]);
  return (
    <>
      <section aria-labelledby="alerts-title" className="border-b border-line py-[22px]">
        <Container>
          <h1
            id="alerts-title"
            className="text-[28px] font-strong leading-[1.15] tracking-section sm:text-section"
          >
            Job alerts
          </h1>
          <p className="mt-1 text-base text-muted">
            An e-mail with new opportunities in the categories and places you choose, daily or weekly. Off
            unless you turn it on.
          </p>
        </Container>
      </section>
      <SeekerNav current="alerts" />
      <Container className="pt-[18px] pb-[65px]">
        {alert === null ? (
          <div role="alert">
            <EmptyState as="h2" title="Alert settings are unavailable">
              The service could not be reached. Try again shortly.
            </EmptyState>
          </div>
        ) : (
          <AlertForm alert={alert} categories={categories} locations={locations} />
        )}
      </Container>
    </>
  );
}
