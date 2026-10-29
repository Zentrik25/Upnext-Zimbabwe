/** Decorative flat illustration (briefcase and magnifying glass) drawn from the design tokens: no gradients, no
 *  photographs, nothing that claims a real person or organisation. */
export function JobSearchArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true" focusable="false" className={className}>
      <circle cx="56" cy="64" r="26" className="fill-match-bg" />
      <circle cx="268" cy="42" r="10" className="fill-match-bg" />
      <ellipse cx="160" cy="150" rx="132" ry="36" className="fill-match-bg" />
      <path d="M96 58c-14 6-22 20-20 34 14-2 26-12 30-26-2-4-6-8-10-8Z" className="fill-border-interest" />
      <rect x="104" y="66" width="108" height="84" rx="8" className="fill-accent-solid" />
      <path d="M104 100h108v8H104z" className="fill-ink" opacity=".22" />
      <path
        d="M142 66v-8a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v8"
        fill="none"
        strokeWidth="8"
        className="stroke-ink"
      />
      <rect x="152" y="96" width="16" height="16" rx="3" className="fill-surface" />
      <circle cx="214" cy="104" r="34" className="fill-surface" opacity=".9" />
      <circle cx="214" cy="104" r="34" fill="none" strokeWidth="9" className="stroke-ink" />
      <path d="m240 130 28 30" strokeWidth="12" strokeLinecap="round" className="stroke-accent-solid" />
    </svg>
  );
}
