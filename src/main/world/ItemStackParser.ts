import type { ItemStackView } from '../../shared/types'
import { coalesce, firstDefined } from '../../shared/valueUtils'
import type { NbtCompound } from './nbtUtils'
import { compoundToPlain, getCompoundField, getInt, getString } from './nbtUtils'

const CONTAINER_SLOTS: Record<string, number> = {
  'minecraft:chest': 27,
  'minecraft:trapped_chest': 27,
  'minecraft:barrel': 27,
  'minecraft:hopper': 5,
  'minecraft:dispenser': 9,
  'minecraft:dropper': 9,
  'minecraft:furnace': 1,
  'minecraft:brewing_stand': 5
}

function summarizeComponents(components: NbtCompound | undefined): string {
  if (!components) {
    return ''
  }
  const customName = getString(components, 'minecraft:custom_name')
  if (customName) {
    return customName
  }
  const damage = getInt(components, 'minecraft:damage')
  if (damage !== undefined) {
    return `damage=${damage}`
  }
  return ''
}

function summarizeLegacyTag(tag: NbtCompound | undefined): string {
  if (!tag) {
    return ''
  }
  const displayField = getCompoundField(tag, 'display')
  if (displayField && displayField.type === 'compound') {
    const name = getString(displayField.value as NbtCompound, 'Name')
    if (name) {
      return name
    }
  }
  return ''
}

function summarizeDisplay(compound: NbtCompound): string {
  const componentsField = getCompoundField(compound, 'components')
  if (componentsField && componentsField.type === 'compound') {
    // 1.20.5+ の components 形式から表示用要約を作る
    return summarizeComponents(componentsField.value as NbtCompound)
  }

  const tagField = getCompoundField(compound, 'tag')
  if (tagField && tagField.type === 'compound') {
    // legacy の tag.display 形式から表示用要約を作る
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
  const itemId = coalesce(getString(compound, 'id'), 'minecraft:air')
  const countField = getInt(compound, 'count')
  const countLegacy = getInt(compound, 'Count')
  const count = coalesce(firstDefined(countField, countLegacy), 0)

  return {
    slot,
    itemId,
    count,
    displaySummary: summarizeDisplay(compound),
    raw: compoundToPlain(compound)
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
  if (known) {
    return known
  }
  if (items.length === 0) {
    return 27
  }
  const maxSlot = items.reduce((max, item) => Math.max(max, item.slot), 0)
  return Math.max(maxSlot + 1, 27)
}

/**
 * 空スロット用の plain NBT オブジェクトを生成する。
 *
 * @param slot - スロット番号
 */
export function buildEmptySlot(slot: number): Record<string, unknown> {
  return { Slot: slot, id: 'minecraft:air', count: 0 }
}

/**
 * ItemStackView から編集用 plain NBT を構築する。
 *
 * @param item - ソースアイテム
 */
export function buildItemNbt(item: ItemStackView): Record<string, unknown> {
  const base = { ...item.raw }
  base.Slot = item.slot
  base.id = item.itemId
  base.count = item.count
  delete base.Count
  return base
}
