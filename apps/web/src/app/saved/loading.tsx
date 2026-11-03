import { SeekerListLoading } from "@/components/ui/page-skeletons";

export default function Loading() {
  return (
    <SeekerListLoading
      current="saved"
      label="your saved opportunities"
      intro="h-[67px] sm:h-[22px]"
      rows={3}
    />
  );
}
