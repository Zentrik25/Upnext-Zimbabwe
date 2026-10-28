import { Container } from "@/components/layout";
import { LoadingRegion, SkeletonPageHeading, SkeletonPanel } from "@/components/ui";

export default function Loading() {
  return (
    <Container className="py-8">
      <LoadingRegion label="the employer portal">
        <SkeletonPageHeading />
        <div className="grid max-w-[640px] gap-4">
          <SkeletonPanel lines={3} />
          <SkeletonPanel lines={4} />
        </div>
      </LoadingRegion>
    </Container>
  );
}
