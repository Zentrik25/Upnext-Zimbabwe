import { SkeletonImage, SkeletonLine } from "@/components/ui/skeleton";

/** Tiles for browsing pictures (the Media Library): an image area and a caption, at the size of the real tiles. */
export function SkeletonMediaGrid({ count = 12 }: { count?: number }) {
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="grid gap-2 rounded-card border border-border-panel p-1">
          <SkeletonImage className="aspect-[16/10]" />
          <SkeletonLine className="w-2/3" />
        </li>
      ))}
    </ul>
  );
}
