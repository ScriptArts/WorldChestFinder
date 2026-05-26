import type { ItemStackView } from '../src/shared/types'

export function itemAtSlot(items: ItemStackView[], slot: number): ItemStackView | undefined {
  return items.find((entry) => entry.slot === slot)
}
