/** "14 November 2026", in Harare time; the dates of Career Insights are calendar dates for readers. */
export function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Africa/Harare",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/** True when the published text changed on a later day than its first publication. */
export function updatedLater(published: string | null, updated: string | null): boolean {
  return Boolean(published && updated && longDate(published) !== longDate(updated));
}
