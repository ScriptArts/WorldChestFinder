import { describe, expect, it } from 'vitest'
import { moveSlotInCompound, transferSlotItem } from '../src/main/world/NbtEditor'
import type { NbtCompound } from '../src/main/world/nbtUtils'
import { itemAtSlot } from './testUtils'

function itemCompound(slot: number, id: string, count: number): NbtCompound {
  return {
    Slot: { type: 'byte', value: slot },
    id: { type: 'string', value: id },
    count: { type: 'int', value: count }
  }
}

function ownerWithItems(items: NbtCompound[]): NbtCompound {
  return {
    Items: {
      type: 'list',
      value: {
        type: 'compound',
        value: items.map((item) => ({ type: 'compound', value: item }))
      }
    }
  }
}

describe('moveSlotInCompound', () => {
  it('moves an item to an empty slot', () => {
    const owner = ownerWithItems([itemCompound(0, 'minecraft:apple', 1)])
    const result = moveSlotInCompound(owner, 0, 5)
    expect(result).toHaveLength(1)
    expect(result[0].slot).toBe(5)
    expect(result[0].itemId).toBe('minecraft:apple')
  })

  it('swaps two occupied slots', () => {
    const owner = ownerWithItems([
      itemCompound(0, 'minecraft:apple', 1),
      itemCompound(3, 'minecraft:stone', 8)
    ])
    const result = moveSlotInCompound(owner, 0, 3)
    expect(result).toHaveLength(2)
    expect(itemAtSlot(result, 0)!.itemId).toBe('minecraft:stone')
    expect(itemAtSlot(result, 3)!.itemId).toBe('minecraft:apple')
  })

  it('does nothing when source slot is empty', () => {
    const owner = ownerWithItems([itemCompound(2, 'minecraft:apple', 1)])
    const result = moveSlotInCompound(owner, 0, 2)
    expect(itemAtSlot(result, 2)!.itemId).toBe('minecraft:apple')
    expect(result).toHaveLength(1)
  })
})

describe('transferSlotItem', () => {
  it('moves item when Slot in NBT points to another slot', () => {
    const owner = ownerWithItems([
      itemCompound(1, 'minecraft:apple', 1),
      itemCompound(5, 'minecraft:stone', 4)
    ])
    const item = {
      slot: 5,
      itemId: 'minecraft:apple',
      count: 1,
      displaySummary: '',
      raw: { Slot: 5, id: 'minecraft:apple', count: 1 }
    }
    const result = transferSlotItem(owner, 1, item)
    expect(itemAtSlot(result, 5)!.itemId).toBe('minecraft:apple')
    expect(itemAtSlot(result, 1)!.itemId).toBe('minecraft:stone')
  })

  it('updates item in place when Slot is unchanged', () => {
    const owner = ownerWithItems([itemCompound(2, 'minecraft:apple', 1)])
    const item = {
      slot: 2,
      itemId: 'minecraft:diamond',
      count: 3,
      displaySummary: '',
      raw: { Slot: 2, id: 'minecraft:diamond', count: 3 }
    }
    const result = transferSlotItem(owner, 2, item)
    expect(result).toHaveLength(1)
    expect(result[0].itemId).toBe('minecraft:diamond')
    expect(result[0].count).toBe(3)
  })

  it('applies nested raw NBT edits from SlotEditor JSON', () => {
    const owner = ownerWithItems([
      {
        ...itemCompound(2, 'minecraft:potion', 1),
        tag: {
          type: 'compound',
          value: {
            CustomModelData: { type: 'int', value: 456 },
            display: {
              type: 'compound',
              value: {
                Name: { type: 'string', value: 'old name' }
              }
            }
          }
        }
      }
    ])
    const item = {
      slot: 2,
      itemId: 'minecraft:potion',
      count: 4,
      displaySummary: '',
      raw: {
        Slot: 2,
        id: 'minecraft:potion',
        Count: 4,
        tag: {
          CustomModelData: 789,
          display: {
            Name: 'new name'
          }
        }
      }
    }

    const result = transferSlotItem(owner, 2, item)
    const entry = (owner.Items.value.value[0] as { value: NbtCompound }).value
    const tag = entry.tag.value as NbtCompound
    const display = tag.display.value as NbtCompound

    expect(result[0].count).toBe(4)
    expect(tag.CustomModelData.value).toBe(789)
    expect(display.Name.value).toBe('new name')
  })
})
