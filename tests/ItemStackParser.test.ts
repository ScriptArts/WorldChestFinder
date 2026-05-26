import { describe, expect, it } from 'vitest'
import { inferSlotCount, parseItemStack, parseItemsList } from '../src/main/world/ItemStackParser'
import type { NbtCompound } from '../src/main/world/nbtUtils'

describe('ItemStackParser', () => {
  it('parses legacy Count field', () => {
    const compound: NbtCompound = {
      Slot: { type: 'byte', value: 2 },
      id: { type: 'string', value: 'minecraft:stone' },
      Count: { type: 'byte', value: 32 }
    }
    const item = parseItemStack(compound, 0)
    expect(item.slot).toBe(2)
    expect(item.itemId).toBe('minecraft:stone')
    expect(item.count).toBe(32)
  })

  it('parses modern count field', () => {
    const compound: NbtCompound = {
      Slot: { type: 'byte', value: 0 },
      id: { type: 'string', value: 'minecraft:diamond' },
      count: { type: 'int', value: 5 }
    }
    const item = parseItemStack(compound, 0)
    expect(item.count).toBe(5)
  })

  it('infers chest slot count', () => {
    const items = parseItemsList([
      {
        Slot: { type: 'byte', value: 26 },
        id: { type: 'string', value: 'minecraft:apple' },
        count: { type: 'int', value: 1 }
      }
    ])
    expect(inferSlotCount('minecraft:chest', items)).toBe(27)
  })
})
