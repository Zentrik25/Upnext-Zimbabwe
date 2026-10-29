import { LoadingRegion, SkeletonBlock, SkeletonPageHeading, SkeletonPanel } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion label="Loading the workspace">
      <SkeletonPageHeading />
      <div className="mt-4 grid gap-4">
        <SkeletonBlock className="h-[160px]" />
        <SkeletonPanel />
      </div>
    </LoadingRegion>
  );
}
