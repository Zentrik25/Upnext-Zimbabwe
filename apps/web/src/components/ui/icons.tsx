import type { SVGProps } from "react";

/** One small outline icon set (1.75 stroke, currentColor) for forms, tabs and category tiles. Decorative: the
 *  accompanying text always carries the meaning, so every icon is hidden from assistive technology. */
const PATHS = {
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.3-4.3",
  pin: "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Zm0-8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
  briefcase: "M3 8h18v11H3V8Zm6 0V5h6v3M3 13h18",
  building: "M4 21V8l8-5 8 5v13M9 21v-6h6v6M3 21h18M8 11h.01M12 11h.01M16 11h.01",
  cap: "m2 9 10-5 10 5-10 5L2 9Zm4 2.5V16c0 1.2 2.7 3 6 3s6-1.8 6-3v-4.5",
  users:
    "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m17 0v-1a4 4 0 0 0-3-3.9M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm6-6.9a3.5 3.5 0 0 1 0 6.8",
  doc: "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6",
  home: "M3 11 12 4l9 7v9h-6v-6H9v6H3v-9Z",
  bookmark: "M6 3h12v18l-6-4-6 4V3Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  mail: "M3 6h18v12H3V6Zm0 1 9 7 9-7",
  lock: "M6 11h12v10H6V11Zm2 0V8a4 4 0 0 1 8 0v3m-4 4v2",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff:
    "M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 4M6.5 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  signIn: "M10 4H5v16h5m3-12 4 4-4 4m4-4H9",
  calendar: "M4 6h16v14H4V6Zm0 5h16M8 3v4m8-4v4",
  chevronDown: "m6 9 6 6 6-6",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-10v5m0-9h.01",
  shield: "M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Zm-3 9 2 2 4-4",
  bell: "M6 17V11a6 6 0 1 1 12 0v6l2 2H4l2-2Zm4 4h4",
  trash: "M4 7h16M10 7V4h4v3m-8 0 1 13h10l1-13M10 11v6m4-6v6",
  device: "M7 3h10v18H7V3Zm4 15h2",
  logOut: "M14 4h5v16h-5M10 8l-4 4 4 4m-4-4h10",
  chevronRight: "m9 6 6 6-6 6",
  arrowLeft: "M19 12H5m6-6-6 6 6 6",
  sliders:
    "M3 6h8m4 0h6M3 12h4m4 0h10M3 18h10m4 0h4M13 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM15 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "h-5 w-5"}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Icon for each launch category (by code); anything new falls back to the grid. */
export const CATEGORY_ICON: Record<string, IconName> = {
  jobs: "briefcase",
  internships: "users",
  "graduate-programmes": "cap",
  scholarships: "doc",
  tenders: "building",
  grants: "grid",
};
