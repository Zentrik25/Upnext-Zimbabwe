import { Container } from "@/components/layout";
import { LoadingRegion, SkeletonBlock, SkeletonLine, SkeletonListingRows } from "@/components/ui";

/** The search page: a filter column beside the results (stacked on narrow screens). */
export default function Loading() {
  return (
    <Container className="py-8">
      <LoadingRegion label="opportunities">
        <SkeletonLine className="mb-4 h-[28px] w-1/3 max-sm:w-2/3" />
        <SkeletonBlock className="mb-5 h-[44px]" />
        <div className="grid grid-cols-[260px_1fr] gap-6 max-md:grid-cols-1">
          <div className="grid h-max gap-3 max-md:hidden">
            <SkeletonBlock className="h-[120px]" />
            <SkeletonBlock className="h-[120px]" />
          </div>
          <div>
            <SkeletonListingRows count={8} />
          </div>
        </div>
      </LoadingRegion>
    </Container>
  );
}
