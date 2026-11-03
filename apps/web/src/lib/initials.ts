/** Up to two initials from a display name ("Silver Silver" → "SS"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  const letters = picked.map((word) => Array.from(word ?? "")[0] ?? "").join("");
  return (letters || "?").toUpperCase();
}
