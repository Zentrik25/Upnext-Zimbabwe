export type ClassValue = string | false | null | undefined;

/** Joins class names, ignoring falsy values. */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}
