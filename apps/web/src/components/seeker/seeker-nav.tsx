import { Container } from "@/components/layout";
import { Tabs } from "@/components/ui";

const ITEMS = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard" },
  { id: "for-you", href: "/for-you", label: "Recommended" },
  { id: "saved", href: "/saved", label: "Saved" },
  { id: "profile", href: "/profile", label: "Profile" },
  { id: "alerts", href: "/alerts", label: "Alerts" },
  { id: "settings", href: "/account", label: "Settings" },
] as const;

export type SeekerSection = (typeof ITEMS)[number]["id"];

/** The one navigation strip shared by every jobseeker page: the dashboard is these places and nothing else (no application tracking: UPNEXT never receives applications). */
export function SeekerNav({ current }: { current: SeekerSection }) {
  return (
    <Container>
      <Tabs
        label="Your UPNEXT"
        items={ITEMS.map((item) => ({ href: item.href, label: item.label, current: item.id === current }))}
      />
    </Container>
  );
}
