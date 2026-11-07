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
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v8m-2.5-6.5h3.75a1.5 1.5 0 0 1 0 3h-2.5a1.5 1.5 0 0 0 0 3H14.5",
  share:
    "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-9.1-7.5 6.2-3.5m0 8-6.2-3.5",
  shield: "M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Zm-3 9 2 2 4-4",
  bell: "M6 17V11a6 6 0 1 1 12 0v6l2 2H4l2-2Zm4 4h4",
  trash: "M4 7h16M10 7V4h4v3m-8 0 1 13h10l1-13M10 11v6m4-6v6",
  device: "M7 3h10v18H7V3Zm4 15h2",
  logOut: "M14 4h5v16h-5M10 8l-4 4 4 4m-4-4h10",
  chevronRight: "m9 6 6 6-6 6",
  flag: "M5 21V4m0 0h12l-2.5 4.5L17 13H5",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5",
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 3 3 5-6",
  arrowLeft: "M19 12H5m6-6-6 6 6 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 1.8",
  external: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  clipboard: "M9 4h6v3H9V4Zm-2 1H5v16h14V5h-2M9 12h6m-6 4h4",
  badgeCheck:
    "M12 3l2.4 1.6 2.9-.1 1 2.7 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.7-2.9-.1L12 21l-2.4-1.6-2.9.1-1-2.7L3.3 15l.9-2.8-.9-2.8 2.4-1.7 1-2.7 2.9.1L12 3Zm-3.2 9 2.4 2.4 4-4.4",
  listBullet: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  listNumber: "M10 6h10M10 12h10M10 18h10M4 4.5 5.5 4v5M4 9h3M4 14h3l-3 4h3",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  unlink:
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M3 3l18 18",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  close: "M6 6l12 12M18 6 6 18",
  expand: "M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5",

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
