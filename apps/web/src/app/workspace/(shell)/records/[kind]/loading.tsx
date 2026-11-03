import { WorkspaceListLoading } from "@/components/ui/page-skeletons";

export default function Loading() {
  return <WorkspaceListLoading label="the list" filters={false} columns={5} />;
}
