import type { Metadata } from "next";
import type { ReactNode } from "react";

// The staff workspace is never indexed and never cached (D-49).
export const metadata: Metadata = {
  title: { default: "Staff workspace", template: "%s | UPNEXT staff" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
