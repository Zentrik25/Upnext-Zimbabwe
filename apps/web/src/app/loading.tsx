import { Container } from "@/components/layout";
import { LoadingRegion, SkeletonListingRows, SkeletonPageHeading } from "@/components/ui";

export default function Loading() {
  return (
    <Container className="py-8">
      <LoadingRegion label="the page">
        <SkeletonPageHeading />
        <SkeletonListingRows count={4} />
      </LoadingRegion>
    </Container>
  );
}
