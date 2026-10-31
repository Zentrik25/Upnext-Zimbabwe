import {
  LoadingRegion,
  SkeletonButton,
  SkeletonInput,
  SkeletonLine,
  SkeletonListingRows,
} from "@/components/ui/skeleton";

/** The search group (field + category) at its real size: one outlined box from 640px, stacked controls below. */
export function SearchSkeleton() {
  return (
    <LoadingRegion label="search" heading={false} className="max-w-[790px]">
      <div className="h-[42px] rounded-control border border-control-border bg-surface max-sm:hidden" />
      <div className="grid gap-[7px] sm:hidden">
        <div className="h-field rounded-control border border-control-border bg-surface" />
        <div className="h-field rounded-control border border-control-border bg-surface" />
      </div>
    </LoadingRegion>
  );
}

/** The filter form: heading, five labelled selects, the apply button and the clear link. */
export function FiltersSkeleton() {
  return (
    <LoadingRegion label="filters" heading={false}>
      <div className="grid gap-3 max-md:grid-cols-2">
        <div className="flex h-[24px] items-center max-md:col-span-2">
          <SkeletonLine className="h-[20px] w-1/3" />
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonInput key={index} field="h-[41px]" />
        ))}
        <SkeletonButton className="w-full max-md:col-span-2" />
        <SkeletonLine className="my-[15px] h-[14px] w-[96px] max-md:col-span-2" />
      </div>
    </LoadingRegion>
  );
}

/** The result count and a page of listing rows, in the real list's box. */
export function ResultsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <LoadingRegion label="opportunities" heading={false}>
      <div className="mb-2 flex h-[20px] items-center">
        <SkeletonLine className="w-[140px]" />
      </div>
      <div className="border-t border-line">
        <SkeletonListingRows count={count} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SkeletonButton className="w-[104px]" />
      </div>
    </LoadingRegion>
  );
}
