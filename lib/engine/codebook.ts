// Interchangeable word pairs. First word = bit 0, second = bit 1. Words must not change form.
// TODO(A): grow and vet this list against real generated notes (the round-trip test).
export const CODEBOOK: ReadonlyArray<readonly [string, string]> = [
  ["quick", "fast"],
  ["big", "large"],
  ["maybe", "perhaps"],
  ["often", "frequently"],
  ["below", "beneath"],
  ["begin", "start"],
  ["small", "little"],
  ["shut", "closed"],
];
