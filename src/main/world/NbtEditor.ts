import { MinecraftIds } from '../../shared/minecraftIds'
import type { ItemStackView } from '../../shared/types'
import { buildItemSnbt, replaceSlotInSnbt, snbtToCompound } from '../nbt/SnbtCodec'
import { parseItemsList } from './ItemStackParser'
import {
  NbtCompound,
  NbtList,
  TagType,
  getInt,
  getList,
  getListItems,
  isCompound
} from './nbtUtils'

/**
 * Items リストの指定位置を compound として取り出す。
 *
 * @param entries - Items リスト
 * @param index - 取り出す位置
 * @returns compound エントリ。compound でない場合は null
 */
function entryCompound(entries: NbtList, index: number): NbtCompound | null {
  const entry = entries.get(index)
  // compound 以外の要素はアイテムとして扱わない
  if (!isCompound(entry)) {
    return null
  }
  return entry
}

/**
 * Items リストを取得する（無ければ空リストを作る）。
 *
 * @param owner - Items タグを持つ compound
 */
function getItemsList(owner: NbtCompound): NbtList {
  ensureItemsList(owner)
  return getList(owner, 'Items')!
}

/**
 * ItemStackView の SNBT を NBT compound へそのまま反映する。
 *
 * @param compound - 更新対象 compound
 * @param item - SNBT を持つアイテム
 */
function applyRawItemView(compound: NbtCompound, item: ItemStackView): void {
  const nextCompound = snbtToCompound(item.raw)
  // SNBT から削除されたキーを NBT からも削除する
  compound.clear()
  // SNBT から生成した NBT タグを既存 compound へ反映する
  for (const [key, value] of nextCompound) {
    compound.set(key, value)
  }
}

/**
 * item.raw（SNBT）を NBT compound へ書き込む。
 *
 * @param compound - 更新対象 compound
 * @param item - SNBT を持つアイテム
 */
function applyItemView(compound: NbtCompound | null, item: ItemStackView): void {
  // compound が無い場合は何もしない
  if (compound === null) {
    return
  }
  applyRawItemView(compound, item)
}

/**
 * item.raw（SNBT）から書き込み用 compound を生成する。
 *
 * @param item - SNBT を持つアイテム
 */
function createItemCompound(item: ItemStackView): NbtCompound {
  return snbtToCompound(item.raw)
}

function findEntryIndexBySlot(entries: NbtList, slot: number): number {
  // 各エントリの Slot 値を照合してインデックスを探す
  for (let index = 0; index < entries.size; index += 1) {
    const compound = entryCompound(entries, index)
    // compound でないエントリは対象外とする
    if (compound === null) {
      continue
    }
    const slotValue = getInt(compound, 'Slot')
    let effectiveSlot = -1
    // Slot フィールドがあれば有効スロット番号として使う
    if (slotValue !== undefined) {
      effectiveSlot = slotValue
    }
    // 対象スロットと一致したエントリのインデックスを返す
    if (effectiveSlot === slot) {
      return index
    }
  }
  return -1
}

/**
 * Items リストを全件置き換える。
 *
 * @param owner - Items タグを持つ compound
 * @param items - 新しいアイテム一覧
 */
export function setItemsInCompound(owner: NbtCompound, items: ItemStackView[]): void {
  const entries = getItemsList(owner)
  entries.clear()
  // 全スロットを新しい compound エントリで再構築する
  for (const item of items) {
    entries.add(createItemCompound(item))
  }
}

/**
 * 指定スロットのアイテム内容を in-place で更新する。
 *
 * @param owner - Items タグを持つ compound
 * @param slot - 対象スロット
 * @param item - 新しい内容（null で空スロット）
 * @returns 更新後の Items 一覧
 */
export function updateSlotInCompound(
  owner: NbtCompound,
  slot: number,
  item: ItemStackView | null
): ItemStackView[] {
  const entries = getItemsList(owner)
  const index = findEntryIndexBySlot(entries, slot)

  // 有効なアイテムの場合は更新または追加する
  if (item && item.itemId !== MinecraftIds.ITEM_AIR && item.count > 0) {
    // 既存エントリがあれば in-place 更新する
    if (index >= 0) {
      applyItemView(entryCompound(entries, index), item)
    // 既存エントリがなければ新規追加する
    } else {
      entries.add(createItemCompound(item))
    }
  // 空スロット指定で既存エントリがあれば削除する
  } else if (index >= 0) {
    entries.removeAt(index)
  }

  return parseItemsList(getListItems(owner, 'Items'))
}

function withSlotNumber(item: ItemStackView, slot: number): ItemStackView {
  return {
    ...item,
    slot,
    raw: replaceSlotInSnbt(item.raw, slot)
  }
}

/**
 * SlotEditor からの更新を NBT に反映する（Slot フィールド変更を含む）。
 *
 * @param owner - Items タグを持つ compound
 * @param fromSlot - 編集元スロット
 * @param item - 反映するアイテム（Slot 番号は移動先を示す場合あり）
 * @returns 更新後の Items 一覧
 */
export function transferSlotItem(
  owner: NbtCompound,
  fromSlot: number,
  item: ItemStackView | null
): ItemStackView[] {
  // 空スロットまたは air アイテムの場合は削除処理へ委譲する
  if (!item || item.itemId === MinecraftIds.ITEM_AIR || item.count <= 0) {
    return updateSlotInCompound(owner, fromSlot, null)
  }

  const toSlot = item.slot
  // 移動元と移動先が同じ場合は単純更新する
  if (fromSlot === toSlot) {
    return updateSlotInCompound(owner, fromSlot, item)
  }

  const entries = getItemsList(owner)
  const fromIndex = findEntryIndexBySlot(entries, fromSlot)
  const toIndex = findEntryIndexBySlot(entries, toSlot)

  // 移動元エントリが存在しない場合は移動先へ直接書き込む
  if (fromIndex < 0) {
    // 移動先に既存エントリがあれば上書きする
    if (toIndex >= 0) {
      applyItemView(entryCompound(entries, toIndex), item)
    // 移動先が空なら新規エントリを追加する
    } else {
      entries.add(createItemCompound(item))
    }
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const fromCompound = entryCompound(entries, fromIndex)
  // 移動先が空スロットの場合は SNBT の Slot だけ更新して反映する
  if (toIndex < 0) {
    applyItemView(fromCompound, item)
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const toCompound = entryCompound(entries, toIndex)
  const displaced = parseItemsList(toCompoundAsList(toCompound))[0]
  applyItemView(fromCompound, withSlotNumber(item, toSlot))
  applyItemView(toCompound, withSlotNumber(displaced, fromSlot))
  return parseItemsList(getListItems(owner, 'Items'))
}

/**
 * 1 件の compound を parseItemsList へ渡すための配列に包む。
 *
 * @param compound - アイテム compound
 * @returns compound 1 件の配列（compound が無い場合は空配列）
 */
function toCompoundAsList(compound: NbtCompound | null): NbtCompound[] {
  // compound が無い場合は空配列を返す
  if (compound === null) {
    return []
  }
  return [compound]
}

/**
 * 2 スロット間でアイテムを移動またはスワップする。
 *
 * @param owner - Items タグを持つ compound
 * @param fromSlot - 移動元
 * @param toSlot - 移動先
 * @returns 更新後の Items 一覧
 */
export function moveSlotInCompound(
  owner: NbtCompound,
  fromSlot: number,
  toSlot: number
): ItemStackView[] {
  // 移動元と移動先が同じ場合は変更なし
  if (fromSlot === toSlot) {
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const entries = getItemsList(owner)
  const fromIndex = findEntryIndexBySlot(entries, fromSlot)
  // 移動元にアイテムが無い場合は変更なし
  if (fromIndex < 0) {
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const toIndex = findEntryIndexBySlot(entries, toSlot)
  const fromCompound = entryCompound(entries, fromIndex)

  // 移動先が空スロットの場合は SNBT の Slot だけ更新して反映する
  if (toIndex < 0) {
    const fromItem = parseItemsList(toCompoundAsList(fromCompound))[0]
    applyItemView(fromCompound, withSlotNumber(fromItem, toSlot))
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const toCompound = entryCompound(entries, toIndex)
  const fromItem = parseItemsList(toCompoundAsList(fromCompound))[0]
  const toItem = parseItemsList(toCompoundAsList(toCompound))[0]
  applyItemView(fromCompound, withSlotNumber(toItem, fromSlot))
  applyItemView(toCompound, withSlotNumber(fromItem, toSlot))
  return parseItemsList(getListItems(owner, 'Items'))
}

/**
 * Items リストが存在しない compound に空リストを追加する。
 *
 * @param owner - Block Entity / Entity compound
 */
export function ensureItemsList(owner: NbtCompound): void {
  const items = getList(owner, 'Items')
  // Items リストが無い、または list 型でない場合は空リストを作成する
  if (items === undefined) {
    owner.set('Items', new NbtList(TagType.Compound))
  }
}

/**
 * 新規 SNBT テンプレート付きの ItemStackView を生成する。
 *
 * @param slot - スロット番号
 * @param itemId - アイテム ID
 * @param count - 個数
 */
export function createDefaultItem(slot: number, itemId: string, count: number): ItemStackView {
  return {
    slot,
    itemId,
    count,
    displaySummary: '',
    raw: buildItemSnbt(slot, itemId, count)
  }
}
