import { describe, expect, it } from 'vitest'
import { mergeLargeChests, getHalfForSlot, toLocalSlot } from '../src/main/world/LargeChestMerger'
import type { ContainerRecord } from '../src/shared/types'

function makeChest(overrides: Partial<ContainerRecord>): ContainerRecord {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    blockEntityId: 'minecraft:chest',
    dimension: 'overworld',
    regionFile: '/test/region/r.0.0.mca',
    chunkX: 0,
    chunkZ: 0,
    posX: 0,
    posY: 64,
    posZ: 0,
    positionKnown: true,
    sourceType: 'block_entity',
    nbtPath: '/block_entities[0]/Items',
    slotCount: 27,
    items: [],
    ...overrides
  }
}

describe('LargeChestMerger', () => {
  it('merges two adjacent chests into a large chest', () => {
    const left = makeChest({ posX: 10, posZ: 5, items: [{ slot: 0, itemId: 'minecraft:diamond', count: 64, displaySummary: '', raw: { Slot: 0, id: 'minecraft:diamond', count: 64 } }] })
    const right = makeChest({ posX: 11, posZ: 5, items: [{ slot: 0, itemId: 'minecraft:iron_ingot', count: 32, displaySummary: '', raw: { Slot: 0, id: 'minecraft:iron_ingot', count: 32 } }] })

    const result = mergeLargeChests([left, right])

    expect(result).toHaveLength(1)
    expect(result[0].largeChest).toBeDefined()
    expect(result[0].slotCount).toBe(54)
    expect(result[0].items).toHaveLength(2)
    expect(result[0].items[0].slot).toBe(0)
    expect(result[0].items[0].itemId).toBe('minecraft:diamond')
    expect(result[0].items[1].slot).toBe(27)
    expect(result[0].items[1].itemId).toBe('minecraft:iron_ingot')
  })

  it('merges adjacent chests on Z axis', () => {
    const a = makeChest({ posX: 5, posZ: 10 })
    const b = makeChest({ posX: 5, posZ: 11 })

    const result = mergeLargeChests([a, b])

    expect(result).toHaveLength(1)
    expect(result[0].largeChest).toBeDefined()
    expect(result[0].slotCount).toBe(54)
  })

  it('does not merge chests that are not adjacent', () => {
    const a = makeChest({ posX: 10, posZ: 5 })
    const b = makeChest({ posX: 12, posZ: 5 })

    const result = mergeLargeChests([a, b])

    expect(result).toHaveLength(2)
    expect(result[0].largeChest).toBeUndefined()
    expect(result[1].largeChest).toBeUndefined()
  })

  it('does not merge chests in different dimensions', () => {
    const a = makeChest({ posX: 10, posZ: 5, dimension: 'overworld' })
    const b = makeChest({ posX: 11, posZ: 5, dimension: 'nether' })

    const result = mergeLargeChests([a, b])

    expect(result).toHaveLength(2)
  })

  it('does not merge different chest types', () => {
    const a = makeChest({ posX: 10, posZ: 5, blockEntityId: 'minecraft:chest' })
    const b = makeChest({ posX: 11, posZ: 5, blockEntityId: 'minecraft:trapped_chest' })

    const result = mergeLargeChests([a, b])

    expect(result).toHaveLength(2)
  })

  it('does not merge chests without known positions', () => {
    const a = makeChest({ posX: 10, posZ: 5, positionKnown: false })
    const b = makeChest({ posX: 11, posZ: 5, positionKnown: false })

    const result = mergeLargeChests([a, b])

    expect(result).toHaveLength(2)
  })

  it('keeps non-chest containers unchanged', () => {
    const barrel = makeChest({ blockEntityId: 'minecraft:barrel', posX: 10, posZ: 5 })
    const chest = makeChest({ posX: 10, posZ: 5 })

    const result = mergeLargeChests([barrel, chest])

    expect(result).toHaveLength(2)
    expect(result.find((c) => c.blockEntityId === 'minecraft:barrel')).toBeDefined()
  })

  it('primary is the chest with lower X coordinate', () => {
    const right = makeChest({ posX: 11, posZ: 5 })
    const left = makeChest({ posX: 10, posZ: 5 })

    const result = mergeLargeChests([right, left])

    expect(result[0].largeChest!.primary.posX).toBe(10)
    expect(result[0].largeChest!.secondary.posX).toBe(11)
  })
})

describe('getHalfForSlot', () => {
  it('returns primary for slots 0-26', () => {
    expect(getHalfForSlot(0)).toBe('primary')
    expect(getHalfForSlot(26)).toBe('primary')
  })

  it('returns secondary for slots 27-53', () => {
    expect(getHalfForSlot(27)).toBe('secondary')
    expect(getHalfForSlot(53)).toBe('secondary')
  })
})

describe('toLocalSlot', () => {
  it('returns slot as-is for primary', () => {
    expect(toLocalSlot(0)).toBe(0)
    expect(toLocalSlot(26)).toBe(26)
  })

  it('subtracts 27 for secondary', () => {
    expect(toLocalSlot(27)).toBe(0)
    expect(toLocalSlot(53)).toBe(26)
  })
})
