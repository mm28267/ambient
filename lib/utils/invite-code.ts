/**
 * Generates human-readable invite codes like "happy-river-7821".
 *
 * Three components: an adjective, a noun, and four random digits.
 * Long enough to be impossible to guess, short enough to read aloud.
 */

const ADJECTIVES = [
  "happy", "quiet", "bright", "warm", "cozy", "swift", "calm", "bold",
  "sunny", "soft", "gentle", "lucky", "merry", "smooth", "kind", "fresh",
];

const NOUNS = [
  "river", "cloud", "forest", "mountain", "ocean", "valley", "garden",
  "harbor", "meadow", "canyon", "island", "summit", "horizon", "field",
  "beach", "trail",
];

export function generateInviteCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const digits = Math.floor(1000 + Math.random() * 9000); // 4 digits, 1000–9999
  return `${adj}-${noun}-${digits}`;
}
