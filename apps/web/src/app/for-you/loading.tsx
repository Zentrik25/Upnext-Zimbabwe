import { SeekerListLoading } from "@/components/ui/page-skeletons";

export default function Loading() {
  return <SeekerListLoading current="for-you" label="your recommendations" intro="h-[90px] sm:h-[45px]" />;
}
