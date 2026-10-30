import type { ReactNode } from "react";
import { Chrome } from "@/components/workspace/chrome";
import { requireStaff } from "@/lib/staff";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await requireStaff("/workspace");
  return <Chrome session={session}>{children}</Chrome>;
}
