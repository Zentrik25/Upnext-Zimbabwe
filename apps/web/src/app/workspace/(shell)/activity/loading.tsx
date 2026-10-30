import { WorkspaceListLoading } from "@/components/ui/page-skeletons";

export default function Loading() {
  return <WorkspaceListLoading label="the activity log" filters={false} columns={4} />;
}
