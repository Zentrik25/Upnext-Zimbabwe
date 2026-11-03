import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsView } from "@/components/workspace/analytics/analytics-view";
import { can, requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const session = await requireStaff("/workspace/analytics");
  if (!can(session, "analytics.read")) notFound();
  return (
    <AnalyticsView
      full
      title="Analytics"
      description="Page views and apply clicks for published listings, from UPNEXT's own counters. No visitor is identified."
    />
  );
}
