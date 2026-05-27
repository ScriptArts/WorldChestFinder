import { randomUUID } from 'crypto'
import type { ContainerRecord, SourceType } from '../../shared/types'
import type { WorldFormat } from '../../shared/world/WorldFormat'
import { coalesce } from '../../shared/valueUtils'
import type { NbtCompound } from './nbtUtils'
import { getCompoundFieldFirst, getIntFirst, getListItems, getString, isList } from './nbtUtils'
import { inferSlotCount, parseItemsList } from './ItemStackParser'

/** チャンク NBT 内で Items タグを検出した結果 */
export interface ItemsHit {
  nbtPath: string
  sourceType: SourceType
  ownerCompound: NbtCompound
  itemsPath: string
}

const SOURCE_LISTS: Array<{ key: string; sourceType: SourceType }> = [
  { key: 'Entities', sourceType: 'entity' },
  { key: 'block_entities', sourceType: 'block_entity' },
  { key: 'TileEntities', sourceType: 'block_entity' }
]

function extractPosition(compound: NbtCompound): { x: number; y: number; z: number } | null {
  const x = getIntFirst(compound, 'x', 'X')
  const y = getIntFirst(compound, 'y', 'Y')
  const z = getIntFirst(compound, 'z', 'Z')

  // 座標が直接入っている場合はそのまま返す
  if (x !== undefined && y !== undefined && z !== undefined) {
    return { x, y, z }
  }

  const posField = getCompoundFieldFirst(compound, 'Pos', 'pos', 'Position')
  // Pos リストから座標を復元する
  if (posField && posField.type === 'list') {
    const values = (posField.value as { value: number[] }).value
    // 3 要素以上あれば XYZ 座標として採用する
    if (values.length >= 3) {
      return {
        x: Math.floor(values[0]),
        y: Math.floor(values[1]),
        z: Math.floor(values[2])
      }
    }
  }

  return null
}

/**
 * チャンク NBT から Items タグを持つ Entity / Block Entity を列挙する。
 *
 * @param chunkNbt - チャンクルート compound
 * @returns 検出結果の配列
 */
export function findItemsHits(chunkNbt: NbtCompound): ItemsHit[] {
  const hits: ItemsHit[] = []

  // Entities / block_entities / TileEntities を順に走査する
  for (const source of SOURCE_LISTS) {
    const listField = getCompoundFieldFirst(chunkNbt, source.key)
    // 対象リストが存在しない、または list 型でない場合はスキップする
    if (!listField || !isList(listField)) {
      continue
    }

    const entries = getListItems(chunkNbt, source.key)
    // 各エントリから Items タグを持つ compound を探す
    for (let index = 0; index < entries.length; index += 1) {
      const compound = entries[index]
      const itemsField = getCompoundFieldFirst(compound, 'Items')
      // Items タグが無い、または list 型でない場合はスキップする
      if (!itemsField || !isList(itemsField)) {
        continue
      }

      hits.push({
        nbtPath: `/${source.key}[${index}]/Items`,
        sourceType: source.sourceType,
        ownerCompound: compound,
        itemsPath: `/${source.key}[${index}]/Items`
      })
    }
  }

  return hits
}

/**
 * ItemsHit 一覧を UI 向け ContainerRecord に変換する。
 *
 * @param hits - NBT 検出結果
 * @param context - リージョン / チャンク / ディメンション情報
 * @returns コンテナレコード配列
 */
export function hitsToContainers(
  hits: ItemsHit[],
  context: {
    dimension: string
    regionFile: string
    chunkX: number
    chunkZ: number
  },
  worldFormat: WorldFormat
): ContainerRecord[] {
  const containers: ContainerRecord[] = []
  // 各 ItemsHit を ContainerRecord に変換する
  for (const hit of hits) {
    const blockEntityId = coalesce(getString(hit.ownerCompound, 'id'), 'unknown')
    const items = parseItemsList(getListItems(hit.ownerCompound, 'Items'), worldFormat)
    const position = extractPosition(hit.ownerCompound)
    let posX = 0
    let posY = 0
    let posZ = 0
    let positionKnown = false
    // NBT から座標を取得できた場合だけ表示座標として採用する
    if (position !== null) {
      posX = position.x
      posY = position.y
      posZ = position.z
      positionKnown = true
    }
    containers.push({
      id: randomUUID(),
      blockEntityId,
      dimension: context.dimension,
      regionFile: context.regionFile,
      chunkX: context.chunkX,
      chunkZ: context.chunkZ,
      posX,
      posY,
      posZ,
      positionKnown,
      sourceType: hit.sourceType,
      nbtPath: hit.nbtPath,
      slotCount: inferSlotCount(blockEntityId, items),
      items
    })
  }
  return containers
}
