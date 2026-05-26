import { describe, expect, it } from 'vitest'
import { findItemsHits } from '../src/main/world/ItemsLocator'
import type { NbtCompound } from '../src/main/world/nbtUtils'

function compound(value: NbtCompound) {
  return { type: 'compound', value }
}

function list(items: unknown[]) {
  return { type: 'list', value: { type: 'compound', value: items } }
}

describe('findItemsHits', () => {
  it('detects Items in entities and block_entities only', () => {
    const root: NbtCompound = {
      Entities: list([
        compound({
          id: { type: 'string', value: 'minecraft:item' },
          Items: list([
            compound({
              Slot: { type: 'byte', value: 0 },
              id: { type: 'string', value: 'minecraft:diamond' },
              count: { type: 'int', value: 3 }
            })
          ])
        })
      ]),
      block_entities: list([
        compound({
          id: { type: 'string', value: 'minecraft:chest' },
          x: { type: 'int', value: 10 },
          y: { type: 'int', value: 64 },
          z: { type: 'int', value: -4 },
          Items: list([
            compound({
              Slot: { type: 'byte', value: 1 },
              id: { type: 'string', value: 'minecraft:iron_ingot' },
              count: { type: 'int', value: 16 }
            })
          ])
        })
      ]),
      custom_root: compound({
        Items: list([
          compound({
            Slot: { type: 'byte', value: 0 },
            id: { type: 'string', value: 'minecraft:gold_ingot' },
            count: { type: 'int', value: 1 }
          })
        ])
      })
    }

    const hits = findItemsHits(root)
    expect(hits).toHaveLength(2)
    expect(hits.some((hit) => hit.sourceType === 'entity')).toBe(true)
    expect(hits.some((hit) => hit.sourceType === 'block_entity')).toBe(true)
    expect(hits.some((hit) => hit.nbtPath.includes('custom_root'))).toBe(false)
  })
})
