import { describe, expect, it } from 'vitest'
import {
  filterContainers,
  getMatchingSlots,
  itemMatchesFilter,
  matchesNbt
} from '../src/shared/search/SearchIndex'
import type { ContainerRecord, ItemStackView } from '../src/shared/types'

const sample: ContainerRecord[] = [
  {
    id: '1',
    blockEntityId: 'minecraft:chest',
    dimension: 'overworld',
    regionFile: '/tmp/r.0.0.mca',
    chunkX: 0,
    chunkZ: 0,
    posX: 1,
    posY: 64,
    posZ: 2,
    positionKnown: true,
    sourceType: 'block_entity',
    nbtPath: '/block_entities[0]/Items',
    slotCount: 27,
    items: [
      {
        slot: 0,
        itemId: 'minecraft:diamond',
        count: 10,
        displaySummary: '',
        raw: { Slot: 0, id: 'minecraft:diamond', count: 10 }
      },
      {
        slot: 1,
        itemId: 'minecraft:iron_sword',
        count: 1,
        displaySummary: 'Sharpness',
        raw: {
          Slot: 1,
          id: 'minecraft:iron_sword',
          count: 1,
          components: { 'minecraft:enchantments': { levels: { 'minecraft:sharpness': 5 } } }
        }
      }
    ]
  },
  {
    id: '2',
    blockEntityId: 'minecraft:hopper',
    dimension: 'nether',
    regionFile: '/tmp/r.0.0.mca',
    chunkX: 0,
    chunkZ: 0,
    posX: 3,
    posY: 70,
    posZ: 4,
    positionKnown: true,
    sourceType: 'block_entity',
    nbtPath: '/block_entities[1]/Items',
    slotCount: 5,
    items: [{ slot: 0, itemId: 'minecraft:iron_ingot', count: 2, displaySummary: '', raw: {} }]
  }
]

describe('filterContainers', () => {
  it('filters by dimension', () => {
    const byDimension = filterContainers(sample, { dimension: 'nether' })
    expect(byDimension).toHaveLength(1)
    expect(byDimension[0].id).toBe('2')
  })

  it('filters by pos coordinates', () => {
    const exact = filterContainers(sample, { posX: 1, posY: 64, posZ: 2 })
    expect(exact).toHaveLength(1)
    expect(exact[0].id).toBe('1')

    const partialX = filterContainers(sample, { posX: 3 })
    expect(partialX).toHaveLength(1)
    expect(partialX[0].id).toBe('2')

    const noMatch = filterContainers(sample, { posX: 1, posZ: 99 })
    expect(noMatch).toHaveLength(0)
  })

  it('filters by nbt substring', () => {
    const byNbt = filterContainers(sample, { nbt: 'sharpness' })
    expect(byNbt).toHaveLength(1)
    expect(byNbt[0].id).toBe('1')
  })

  it('filters by nbt and minCount on the same slot', () => {
    const matched = filterContainers(sample, { nbt: 'diamond', minCount: 10 })
    expect(matched).toHaveLength(1)
    expect(matched[0].id).toBe('1')

    const unmatched = filterContainers(sample, { nbt: 'sharpness', minCount: 10 })
    expect(unmatched).toHaveLength(0)
  })

  it('filters by nbt only', () => {
    const byComponents = filterContainers(sample, { nbt: 'components' })
    expect(byComponents).toHaveLength(1)
    expect(byComponents[0].items.some((item) => item.slot === 1)).toBe(true)
  })
})

describe('getMatchingSlots', () => {
  it('returns slots that match nbt filter', () => {
    expect(getMatchingSlots(sample[0], { nbt: 'sharpness' })).toEqual([1])
  })

  it('returns empty when no item-level filter is active', () => {
    expect(getMatchingSlots(sample[0], {})).toEqual([])
  })
})

describe('matchesNbt', () => {
  const item: ItemStackView = {
    slot: 0,
    itemId: 'minecraft:stick',
    count: 1,
    displaySummary: '',
    raw: { tag: { display: { Name: '{"text":"Test"}' } } }
  }

  it('matches nested raw values', () => {
    expect(matchesNbt(item, 'display')).toBe(true)
    expect(matchesNbt(item, 'missing')).toBe(false)
  })
})

describe('itemMatchesFilter', () => {
  it('requires minCount when specified with nbt', () => {
    const item = sample[0].items[0]
    expect(itemMatchesFilter(item, { nbt: 'diamond', minCount: 10 })).toBe(true)
    expect(itemMatchesFilter(item, { nbt: 'diamond', minCount: 11 })).toBe(false)
  })
})
