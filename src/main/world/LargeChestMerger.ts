import { randomUUID } from 'crypto'
import type { ContainerRecord, ItemStackView, LargeChestHalf, LargeChestPairInfo } from '../../shared/types'

const CHEST_IDS = new Set(['minecraft:chest', 'minecraft:trapped_chest'])

interface ChestCandidate {
  container: ContainerRecord
  index: number
}

function positionKey(c: ContainerRecord): string {
  return `${c.dimension}:${c.posX},${c.posY},${c.posZ}`
}

function isAdjacentChestPair(a: ContainerRecord, b: ContainerRecord): boolean {
  if (a.dimension !== b.dimension) return false
  if (a.blockEntityId !== b.blockEntityId) return false
  if (!CHEST_IDS.has(a.blockEntityId)) return false
  if (!a.positionKnown || !b.positionKnown) return false
  if (a.posY !== b.posY) return false

  const dx = Math.abs(a.posX - b.posX)
  const dz = Math.abs(a.posZ - b.posZ)
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1)
}

function orderPair(a: ContainerRecord, b: ContainerRecord): [ContainerRecord, ContainerRecord] {
  if (a.posX < b.posX) return [a, b]
  if (a.posX > b.posX) return [b, a]
  if (a.posZ < b.posZ) return [a, b]
  if (a.posZ > b.posZ) return [b, a]
  return [a, b]
}

function buildHalf(container: ContainerRecord, slotOffset: number): LargeChestHalf {
  return {
    containerId: container.id,
    regionFile: container.regionFile,
    chunkX: container.chunkX,
    chunkZ: container.chunkZ,
    posX: container.posX,
    posY: container.posY,
    posZ: container.posZ,
    nbtPath: container.nbtPath,
    slotOffset
  }
}

function mergeItems(primary: ContainerRecord, secondary: ContainerRecord): ItemStackView[] {
  const merged: ItemStackView[] = []
  for (const item of primary.items) {
    merged.push(item)
  }
  for (const item of secondary.items) {
    merged.push({
      ...item,
      slot: item.slot + 27,
      raw: { ...item.raw, Slot: item.slot + 27 }
    })
  }
  return merged.sort((a, b) => a.slot - b.slot)
}

function buildMergedContainer(primary: ContainerRecord, secondary: ContainerRecord): ContainerRecord {
  const pairInfo: LargeChestPairInfo = {
    primary: buildHalf(primary, 0),
    secondary: buildHalf(secondary, 27)
  }

  return {
    id: randomUUID(),
    blockEntityId: primary.blockEntityId,
    dimension: primary.dimension,
    regionFile: primary.regionFile,
    chunkX: primary.chunkX,
    chunkZ: primary.chunkZ,
    posX: primary.posX,
    posY: primary.posY,
    posZ: primary.posZ,
    positionKnown: true,
    sourceType: primary.sourceType,
    nbtPath: primary.nbtPath,
    slotCount: 54,
    items: mergeItems(primary, secondary),
    largeChest: pairInfo
  }
}

/**
 * スキャン結果のコンテナ一覧から隣接チェストペアを検出し、
 * ラージチェストとして統合した新しいコンテナ一覧を返す。
 */
export function mergeLargeChests(containers: ContainerRecord[]): ContainerRecord[] {
  const chests: ChestCandidate[] = []
  for (let i = 0; i < containers.length; i++) {
    const c = containers[i]
    if (CHEST_IDS.has(c.blockEntityId) && c.positionKnown) {
      chests.push({ container: c, index: i })
    }
  }

  const merged = new Set<number>()
  const mergedContainers: ContainerRecord[] = []

  for (let i = 0; i < chests.length; i++) {
    if (merged.has(chests[i].index)) continue

    let paired = false
    for (let j = i + 1; j < chests.length; j++) {
      if (merged.has(chests[j].index)) continue

      if (isAdjacentChestPair(chests[i].container, chests[j].container)) {
        const [primary, secondary] = orderPair(chests[i].container, chests[j].container)
        mergedContainers.push(buildMergedContainer(primary, secondary))
        merged.add(chests[i].index)
        merged.add(chests[j].index)
        paired = true
        break
      }
    }

    if (!paired) {
      // ペアが見つからないシングルチェストはそのまま残す
    }
  }

  const result: ContainerRecord[] = []
  for (let i = 0; i < containers.length; i++) {
    if (!merged.has(i)) {
      result.push(containers[i])
    }
  }
  result.push(...mergedContainers)

  return result
}

/**
 * 指定スロットがラージチェストのどちら側に属するかを返す。
 *
 * @returns 'primary' (slot 0-26) or 'secondary' (slot 27-53)
 */
export function getHalfForSlot(slot: number): 'primary' | 'secondary' {
  return slot < 27 ? 'primary' : 'secondary'
}

/**
 * マージ済みスロット番号を元の片側ローカルスロット番号に変換する。
 */
export function toLocalSlot(slot: number): number {
  return slot < 27 ? slot : slot - 27
}
