/**
 * The member of `options` that a `<select>`'s value names, or `fallback`.
 *
 * `HTMLSelectElement.value` is a `string` however narrow the `<option>` list is,
 * and every caller renders its options from the same list it wants back — so the
 * narrowing is a lookup against that list rather than an `as` cast, which
 * `general.md §2` permits only at a boundary where narrowing is impossible.
 *
 * `fallback` is generic so a caller whose state is optional can pass `undefined`
 * and a caller whose state is total can pass its current value.
 */
export function optionValue<T extends string, F>(
  options: readonly T[],
  value: string,
  fallback: F,
): T | F {
  return options.find((option) => option === value) ?? fallback;
}
