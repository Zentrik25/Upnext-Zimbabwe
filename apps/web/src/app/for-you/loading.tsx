import { Container } from "@/components/layout";
import { LoadingRegion, SkeletonListingRows, SkeletonPageHeading } from "@/components/ui";

export default function Loading() {
  return (
    <Container className="py-8">
      <LoadingRegion label="your recommendations">
        <SkeletonPageHeading />
        <SkeletonListingRows count={5} />
      </LoadingRegion>
    </Container>
  );
}
