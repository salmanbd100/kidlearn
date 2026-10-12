/** The member of `options` that a `<select>`'s value names, or `fallback`. */
export function optionValue<T extends string, F>(
  options: readonly T[],
  value: string,
  fallback: F,
): T | F {
  return options.find((option) => option === value) ?? fallback;
}
