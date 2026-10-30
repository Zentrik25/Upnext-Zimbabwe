import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogForm } from "@/components/workspace/catalog-form";
import { requireStaff, staffJson } from "@/lib/staff";
import type { CatalogRecord } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Reference data" };
type Props = { params: Promise<{ kind: string; id: string }> };

export default async function EditRecordPage({ params }: Props) {
  const { kind, id } = await params;
  if (!/^[a-z-]{1,40}$/.test(kind) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireStaff(`/workspace/manage/${kind}/${id}`);
  const result = await staffJson<CatalogRecord>(`catalog/${kind}/${id}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error("The record could not be loaded.");
  }
  const record = result.data;
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href={`/workspace/manage/${kind}`} className="text-accent underline">
          ← {record.kind.label}
        </Link>
      </p>
      <h1 className="m-0 mt-3 mb-4 text-section font-light tracking-section [overflow-wrap:anywhere]">
        {record.title}
      </h1>
      <CatalogForm kind={kind} fields={record.fields} record={record} readOnly={!record.can_edit} />
    </>
  );
}
