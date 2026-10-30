import { WorkspaceListLoading } from "@/components/ui/page-skeletons";

export default function Loading() {
  return <WorkspaceListLoading label="the content health report" filters={false} columns={4} />;
}
