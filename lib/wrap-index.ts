/** Step an index by `delta` within a list of `length`, wrapping at both ends. */
export function wrapIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}
