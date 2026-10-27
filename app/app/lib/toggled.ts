/** The list with `item` taken out if it's in it, put on the end if it isn't:
 *  a pill pressed. */
export function toggled<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
