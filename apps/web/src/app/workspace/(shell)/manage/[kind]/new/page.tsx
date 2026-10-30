import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogForm } from "@/components/workspace/catalog-form";
import { requireStaff, staffJson } from "@/lib/staff";
import type { CatalogList } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Add" };
type Props = { params: Promise<{ kind: string }> };

export default async function NewRecordPage({ params }: Props) {
  const { kind } = await params;
  if (!/^[a-z-]{1,40}$/.test(kind)) notFound();
  await requireStaff(`/workspace/manage/${kind}/new`);
  const result = await staffJson<CatalogList>(`catalog/${kind}?page_size=1`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error("The form could not be loaded.");
  }
  const { kind: spec, fields, can_add: canAdd } = result.data;
  if (!canAdd) notFound();
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href={`/workspace/manage/${kind}`} className="text-accent underline">
          ← {spec.label}
        </Link>
      </p>
      <h1 className="m-0 mt-3 mb-4 text-section font-light tracking-section">
        Add to {spec.label.toLowerCase()}
      </h1>
      <CatalogForm kind={kind} fields={fields} />
    </>
  );
}
