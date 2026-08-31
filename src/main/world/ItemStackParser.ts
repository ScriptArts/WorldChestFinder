import { MinecraftIds } from '../../shared/minecraftIds'
import type { ItemStackView } from '../../shared/types'
import { coalesce } from '../../shared/valueUtils'
import { buildItemSnbt, compoundToSnbt } from '../nbt/SnbtCodec'
import { getCompound, getInt, getString, type NbtCompound } from './nbtUtils'

const CONTAINER_SLOTS: Record<string, number> = {
  [MinecraftIds.BLOCK_CHEST]: 27,
  [MinecraftIds.BLOCK_TRAPPED_CHEST]: 27,
  [MinecraftIds.BLOCK_BARREL]: 27,
  [MinecraftIds.BLOCK_HOPPER]: 5,
  [MinecraftIds.BLOCK_DISPENSER]: 9,
  [MinecraftIds.BLOCK_DROPPER]: 9,
  [MinecraftIds.BLOCK_FURNACE]: 1,
  [MinecraftIds.BLOCK_BREWING_STAND]: 5
}

/**
 * item compound から個数を読み取る。
 *
 * @param compound - item NBT
 * @returns 個数（読み取れない場合は 0）
 * @remarks 26.x の `count` (int) を優先し、古い `Count` が残っている場合はそれで代用する。
 */
export function readItemCount(compound: NbtCompound): number {
  const count = getInt(compound, 'count')
  // count があればそれを個数とする
  if (count !== undefined) {
    return count
  }
  const legacyCount = getInt(compound, 'Count')
  // count が無い場合だけ Count で代用する
  if (legacyCount !== undefined) {
    return legacyCount
  }
  return 0
}

function summarizeComponents(components: NbtCompound): string {
  const customName = getString(components, MinecraftIds.COMPONENT_CUSTOM_NAME)
  // カスタム名があれば表示要約として返す
  if (customName) {
    return customName
  }
  const damage = getInt(components, MinecraftIds.COMPONENT_DAMAGE)
  // ダメージ値があれば表示要約として返す
  if (damage !== undefined) {
    return `damage=${damage}`
  }
  return ''
}

function summarizeLegacyTag(tag: NbtCompound): string {
  const display = getCompound(tag, 'display')
  // display compound がある場合は Name を参照する
  if (display !== undefined) {
    const name = getString(display, 'Name')
    // 表示名があれば返す
    if (name) {
      return name
    }
  }
  return ''
}

function summarizeDisplay(compound: NbtCompound): string {
  const components = getCompound(compound, 'components')
  // 1.20.5+ の components 形式から表示用要約を作る
  if (components !== undefined) {
    return summarizeComponents(components)
  }

  const tag = getCompound(compound, 'tag')
  // legacy の tag.display 形式から表示用要約を作る
  if (tag !== undefined) {
    return summarizeLegacyTag(tag)
  }

  return ''
}

function buildItemRawSnbt(compound: NbtCompound, slot: number, itemId: string, count: number): string {
  try {
    return compoundToSnbt(compound, { pretty: true })
  } catch {
    // SNBT 変換に失敗した場合は最低限のフィールドだけ返しスキャンを継続する
    return buildItemSnbt(slot, itemId, count)
  }
}

/**
 * NBT compound 1 件から UI 表示用 ItemStackView を生成する。
 *
 * @param compound - アイテム NBT
 * @param fallbackSlot - Slot フィールドが無い場合の番号
 * @returns パース結果
 */
export function parseItemStack(compound: NbtCompound, fallbackSlot: number): ItemStackView {
  const slot = coalesce(getInt(compound, 'Slot'), fallbackSlot)
  const itemId = coalesce(getString(compound, 'id'), MinecraftIds.ITEM_AIR)
  const count = readItemCount(compound)

  return {
    slot,
    itemId,
    count,
    displaySummary: summarizeDisplay(compound),
    raw: buildItemRawSnbt(compound, slot, itemId, count)
  }
}

/**
 * Items compound 配列を ItemStackView 一覧に変換する。
 *
 * @param items - NBT compound 配列
 * @returns スロット番号順にソート済み
 */
export function parseItemsList(items: NbtCompound[]): ItemStackView[] {
  const parsed: ItemStackView[] = []
  // 各エントリを ItemStackView に変換する
  for (let index = 0; index < items.length; index += 1) {
    parsed.push(parseItemStack(items[index], index))
  }
  return parsed.sort((a, b) => a.slot - b.slot)
}

/**
 * Block Entity ID からコンテナのスロット数を推定する。
 *
 * @param blockEntityId - コンテナ種別 ID
 * @param items - 格納アイテム（最大スロット推定に使用）
 */
export function inferSlotCount(blockEntityId: string, items: ItemStackView[]): number {
  const known = CONTAINER_SLOTS[blockEntityId]
  // 既知のコンテナ種別なら固定スロット数を返す
  if (known) {
    return known
  }
  // アイテムが空なら既定 27 スロットとする
  if (items.length === 0) {
    return 27
  }
  const maxSlot = items.reduce((max, item) => Math.max(max, item.slot), 0)
  return Math.max(maxSlot + 1, 27)
}

/**
 * 空スロット用の SNBT 文字列を生成する。
 *
 * @param slot - スロット番号
 */
export function buildEmptySlot(slot: number): string {
  return buildItemSnbt(slot, MinecraftIds.ITEM_AIR, 0)
}
