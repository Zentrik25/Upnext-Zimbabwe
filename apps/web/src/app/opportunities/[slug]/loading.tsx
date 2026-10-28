import { Container } from "@/components/layout";
import { LoadingRegion, SkeletonLine, SkeletonPanel } from "@/components/ui";

/** An opportunity: title and text beside key facts and how to apply (stacked on narrow screens). */
export default function Loading() {
  return (
    <Container className="py-8">
      <LoadingRegion label="the opportunity">
        <div className="grid grid-cols-[1fr_340px] gap-8 max-md:grid-cols-1">
          <div className="grid h-max gap-3">
            <SkeletonLine className="w-1/4" />
            <SkeletonLine className="h-[32px] w-3/4 max-sm:w-full" />
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="mt-4" />
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine className="w-2/3" />
          </div>
          <div className="grid h-max gap-4">
            <SkeletonPanel lines={3} />
            <SkeletonPanel lines={5} />
          </div>
        </div>
      </LoadingRegion>
    </Container>
  );
}
