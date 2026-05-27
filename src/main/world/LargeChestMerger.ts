import { randomUUID } from 'crypto'
import { MinecraftIds } from '../../shared/minecraftIds'
import { replaceSlotInSnbt } from '../../shared/nbt/SnbtCodec'
import type { ContainerRecord, ItemStackView, LargeChestHalf, LargeChestPairInfo } from '../../shared/types'

const CHEST_IDS = new Set([MinecraftIds.BLOCK_CHEST, MinecraftIds.BLOCK_TRAPPED_CHEST])

interface ChestCandidate {
  container: ContainerRecord
  index: number
}

function positionKey(c: ContainerRecord): string {
  return `${c.dimension}:${c.posX},${c.posY},${c.posZ}`
}

function isAdjacentChestPair(a: ContainerRecord, b: ContainerRecord): boolean {
  // ディメンションが異なる場合は隣接チェストとして扱わない
  if (a.dimension !== b.dimension) {
    return false
  }
  // ブロック種別が異なる場合はペアにしない
  if (a.blockEntityId !== b.blockEntityId) {
    return false
  }
  // 通常チェスト系以外はラージチェスト候補から除外する
  if (!CHEST_IDS.has(a.blockEntityId)) {
    return false
  }
  // 座標が不明な場合は隣接判定できない
  if (!a.positionKnown || !b.positionKnown) {
    return false
  }
  // 高さが異なる場合は隣接チェストとして扱わない
  if (a.posY !== b.posY) {
    return false
  }

  const dx = Math.abs(a.posX - b.posX)
  const dz = Math.abs(a.posZ - b.posZ)
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1)
}

function orderPair(a: ContainerRecord, b: ContainerRecord): [ContainerRecord, ContainerRecord] {
  // X 座標が小さいチェストを先頭側にする
  if (a.posX < b.posX) {
    return [a, b]
  }
  // X 座標が大きいチェストを後方側にする
  if (a.posX > b.posX) {
    return [b, a]
  }
  // X 座標が同じ場合は Z 座標で順序を決める
  if (a.posZ < b.posZ) {
    return [a, b]
  }
  // Z 座標が大きいチェストを後方側にする
  if (a.posZ > b.posZ) {
    return [b, a]
  }
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
  // primary 側のアイテムをそのまま統合結果へ追加する
  for (const item of primary.items) {
    merged.push(item)
  }
  // secondary 側のアイテムはスロット番号を後半へずらして追加する
  for (const item of secondary.items) {
    merged.push({
      ...item,
      slot: item.slot + 27,
      raw: replaceSlotInSnbt(item.raw, item.slot + 27)
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
  // ラージチェスト候補になる通常チェスト系コンテナだけを抽出する
  for (let i = 0; i < containers.length; i++) {
    const c = containers[i]
    // チェスト系かつ座標が分かるコンテナだけを候補にする
    if (CHEST_IDS.has(c.blockEntityId) && c.positionKnown) {
      chests.push({ container: c, index: i })
    }
  }

  const merged = new Set<number>()
  const mergedContainers: ContainerRecord[] = []

  // 抽出したチェスト候補同士を走査して隣接ペアを探す
  for (let i = 0; i < chests.length; i++) {
    // すでにペア化済みのチェストは再処理しない
    if (merged.has(chests[i].index)) {
      continue
    }

    let paired = false

    // 現在のチェストに隣接する未処理チェストを探す
    for (let j = i + 1; j < chests.length; j++) {
      // すでにペア化済みの候補は比較対象から除外する
      if (merged.has(chests[j].index)) {
        continue
      }
      // 隣接ペアが見つかった場合はラージチェストとして統合する
      if (isAdjacentChestPair(chests[i].container, chests[j].container)) {
        const [primary, secondary] = orderPair(chests[i].container, chests[j].container)
        mergedContainers.push(buildMergedContainer(primary, secondary))
        merged.add(chests[i].index)
        merged.add(chests[j].index)
        paired = true
        break
      }
    }

    // ペアが見つからないシングルチェストは後段でそのまま残す
    if (!paired) {
      // ここでは処理せず、元の順序を保つため result 構築時に追加する
    }
  }

  const result: ContainerRecord[] = []
  // 統合されなかった元コンテナを元の順序で残す
  for (let i = 0; i < containers.length; i++) {
    // ラージチェストへ統合済みでなければ結果に追加する
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
  // 前半 27 スロットは primary 側として扱う
  if (slot < 27) {
    return 'primary'
  }
  return 'secondary'
}

/**
 * マージ済みスロット番号を元の片側ローカルスロット番号に変換する。
 */
export function toLocalSlot(slot: number): number {
  // 前半スロットは番号をそのまま使う
  if (slot < 27) {
    return slot
  }
  return slot - 27
}
