import { randomUUID } from 'crypto'
import type { ContainerRecord, SourceType } from '../../shared/types'
import { coalesce } from '../../shared/valueUtils'
import { getIntFirst, getList, getListItems, getNumberListValues, getString, type NbtCompound } from './nbtUtils'
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

const POSITION_LIST_KEYS = ['Pos', 'pos', 'Position']

/**
 * Block Entity / Entity の NBT からブロック座標を抽出する。
 *
 * @param compound - 対象 compound
 * @returns ワールド座標。取得できない場合は null
 */
export function extractPosition(compound: NbtCompound): { x: number; y: number; z: number } | null {
  const x = getIntFirst(compound, 'x', 'X')
  const y = getIntFirst(compound, 'y', 'Y')
  const z = getIntFirst(compound, 'z', 'Z')

  // 座標が直接入っている場合はそのまま返す
  if (x !== undefined && y !== undefined && z !== undefined) {
    return { x, y, z }
  }

  // Pos リストから座標を復元する
  for (const key of POSITION_LIST_KEYS) {
    const values = getNumberListValues(compound, key)
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
    const entries = getListItems(chunkNbt, source.key)
    // 各エントリから Items タグを持つ compound を探す
    for (let index = 0; index < entries.length; index += 1) {
      const compound = entries[index]
      const itemsList = getList(compound, 'Items')
      // Items タグが無い、または list 型でない場合はスキップする
      if (itemsList === undefined) {
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
  }
): ContainerRecord[] {
  const containers: ContainerRecord[] = []
  // 各 ItemsHit を ContainerRecord に変換する
  for (const hit of hits) {
    const blockEntityId = coalesce(getString(hit.ownerCompound, 'id'), 'unknown')
    const items = parseItemsList(getListItems(hit.ownerCompound, 'Items'))
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
