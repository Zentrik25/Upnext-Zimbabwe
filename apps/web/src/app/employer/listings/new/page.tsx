import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListingForm } from "@/components/employer/listing-form";
import { EmployerHeading } from "@/components/employer/parts";
import { Container } from "@/components/layout";
import { listLocations } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Post a listing", robots: { index: false } };

type Props = { searchParams: Promise<{ org?: string }> };

export default async function NewListingPage({ searchParams }: Props) {
  const { org } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Femployer");
  if (!org || !/^[0-9a-f-]{36}$/i.test(org)) redirect("/employer");
  const locations = await listLocations();
  return (
    <Container className="pt-6 pb-[65px]">
      <p className="text-ctl">
        <Link href="/employer" className="text-accent underline">
          ← Employer dashboard
        </Link>
      </p>
      <div className="mt-3">
        <EmployerHeading title="Post a listing" />
      </div>
      <p className="mt-1 text-base text-muted">
        Save a draft at any time. When you submit, editors review it before it is public.
      </p>
      <div className="mt-5 max-w-[640px]">
        <ListingForm organisationId={org} locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
      </div>
    </Container>
  );
}
