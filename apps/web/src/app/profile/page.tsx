import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout";
import { ProfileForm } from "@/components/seeker/profile-form";
import { SeekerNav } from "@/components/seeker/seeker-nav";
import { EmptyState } from "@/components/ui";
import { listCategories, listLocations, listSectors } from "@/lib/catalog";
import { getCurrentUser, getProfile } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Fprofile");
  const [profile, categories, sectors, locations] = await Promise.all([
    getProfile(),
    listCategories(),
    listSectors(),
    listLocations(),
  ]);
  return (
    <>
      <section aria-labelledby="profile-title" className="border-b border-line py-[22px]">
        <Container>
          <h1 id="profile-title" className="text-section font-strong tracking-section">
            Your profile
          </h1>
          <p className="mt-1 text-base text-muted">
            Optional. Tell us what you are looking for and we will order opportunities for you. You can search
            and browse without filling anything in. Your name ({user.display_name}) is changed in{" "}
            <Link href="/account" className="text-accent underline">
              your account
            </Link>
            .
          </p>
        </Container>
      </section>
      <SeekerNav current="profile" />
      <Container className="pt-[18px] pb-[65px]">
        {profile === null ? (
          <div role="alert">
            <EmptyState title="Your profile is unavailable">
              The service could not be reached. Try again shortly.
            </EmptyState>
          </div>
        ) : (
          <ProfileForm profile={profile} categories={categories} sectors={sectors} locations={locations} />
        )}
      </Container>
    </>
  );
}
