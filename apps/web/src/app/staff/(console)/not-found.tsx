import Link from "next/link";
import { EmptyNote, PageHeader } from "@/components/staff/primitives";

export default function StaffNotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyNote>
        This page does not exist, or your role does not include it.{" "}
        <Link href="/staff" className="text-accent underline">
          Back to the dashboard
        </Link>
      </EmptyNote>
    </>
  );
}
