import type { Metadata } from "next";
import type { ReactNode } from "react";

// The staff console is never indexed or previewed (SEO-03); it has its own shell, so no public header or footer.
export const metadata: Metadata = {
  title: { default: "Staff", template: "%s | Staff | UPNEXT Careers" },
  robots: { index: false, follow: false, nocache: true },
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return children;
}
