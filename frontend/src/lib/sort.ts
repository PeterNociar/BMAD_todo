/**
 * The frontend mirror of the AD-6 canonical order, locked to `contracts/ordering-cases.json`.
 * It is used only to place tasks between server responses; nothing else sorts tasks.
 */
export type Sortable = {
  id: string | null
  key: string
  added_at: string
  completed_at: string | null
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function compare(a: Sortable, b: Sortable): number {
  const aDone = a.completed_at !== null
  const bDone = b.completed_at !== null
  if (aDone !== bDone) return aDone ? 1 : -1

  // Open tasks: added_at ascending. Completed tasks: completed_at descending.
  const diff =
    a.completed_at !== null && b.completed_at !== null
      ? Date.parse(b.completed_at) - Date.parse(a.completed_at)
      : Date.parse(a.added_at) - Date.parse(b.added_at)
  if (diff !== 0) return diff

  // Confirmed tasks tie by id (the server rule). Id-less tasks come after them and tie by key,
  // so the comparator never mixes the id order with the key order.
  if (a.id !== null && b.id !== null) return byString(a.id, b.id)
  if (a.id !== null) return -1
  if (b.id !== null) return 1
  return byString(a.key, b.key)
}

/** Returns a new array in canonical order; the input is never mutated. */
export function sortTasks<T extends Sortable>(tasks: readonly T[]): T[] {
  return [...tasks].sort(compare)
}
