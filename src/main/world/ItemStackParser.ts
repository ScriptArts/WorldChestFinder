import { MinecraftIds } from '../../shared/minecraftIds'
import { buildItemSnbt, compoundToSnbt } from '../../shared/nbt/SnbtCodec'
import type { ItemStackView } from '../../shared/types'
import { coalesce, firstDefined } from '../../shared/valueUtils'
import type { NbtCompound } from './nbtUtils'
import { getCompoundField, getInt, getString } from './nbtUtils'

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

function summarizeComponents(components: NbtCompound | undefined): string {
  // components タグが無い場合は空文字を返す
  if (!components) {
    return ''
  }
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

function summarizeLegacyTag(tag: NbtCompound | undefined): string {
  // tag タグが無い場合は空文字を返す
  if (!tag) {
    return ''
  }
  const displayField = getCompoundField(tag, 'display')
  // display compound がある場合は Name を参照する
  if (displayField && displayField.type === 'compound') {
    const name = getString(displayField.value as NbtCompound, 'Name')
    // 表示名があれば返す
    if (name) {
      return name
    }
  }
  return ''
}

function summarizeDisplay(compound: NbtCompound): string {
  const componentsField = getCompoundField(compound, 'components')
  // 1.20.5+ の components 形式から表示用要約を作る
  if (componentsField && componentsField.type === 'compound') {
    return summarizeComponents(componentsField.value as NbtCompound)
  }

  const tagField = getCompoundField(compound, 'tag')
  // legacy の tag.display 形式から表示用要約を作る
  if (tagField && tagField.type === 'compound') {
    return summarizeLegacyTag(tagField.value as NbtCompound)
  }

  return ''
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
  const countField = getInt(compound, 'count')
  const countLegacy = getInt(compound, 'Count')
  const count = coalesce(firstDefined(countField, countLegacy), 0)

  return {
    slot,
    itemId,
    count,
    displaySummary: summarizeDisplay(compound),
    raw: compoundToSnbt(compound, { pretty: true })
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
