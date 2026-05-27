import { MinecraftIds } from '../../shared/minecraftIds'
import { buildItemSnbt, replaceSlotInSnbt, snbtToCompound } from '../../shared/nbt/SnbtCodec'
import type { ItemStackView } from '../../shared/types'
import type { NbtCompound } from './nbtUtils'
import { parseItemsList } from './ItemStackParser'
import { getCompoundField, getInt, getListItems, isList } from './nbtUtils'

type ListEntry = { type: 'compound'; value: NbtCompound }

function entryCompound(entry: unknown): NbtCompound {
  // list エントリが compound タグ形式なら value を返す
  if (typeof entry === 'object' && entry !== null && 'type' in entry && (entry as { type: string }).type === 'compound') {
    return (entry as ListEntry).value
  }
  return entry as NbtCompound
}

function getItemsListEntries(owner: NbtCompound): unknown[] {
  ensureItemsList(owner)
  return (owner.Items!.value as { value: unknown[] }).value
}

function setSlotField(compound: NbtCompound | undefined, slot: number): void {
  // compound が無い場合は何もしない
  if (!compound) {
    return
  }
  // 既存 Slot タグがあれば値を更新する
  if (compound.Slot) {
    compound.Slot.value = slot
    return
  }
  compound.Slot = { type: 'byte', value: slot }
}

function setItemIdField(compound: NbtCompound | undefined, itemId: string): void {
  // compound が無い場合は何もしない
  if (!compound) {
    return
  }
  // 既存 id タグがあれば値を更新する
  if (compound.id) {
    compound.id.value = itemId
    return
  }
  compound.id = { type: 'string', value: itemId }
}

function setCountField(compound: NbtCompound | undefined, count: number): void {
  // compound が無い場合は何もしない
  if (!compound) {
    return
  }
  // 新形式 count タグがあれば値を更新する
  if (compound.count) {
    compound.count.value = count
    return
  }
  // 旧形式 Count タグがあれば値を更新する
  if (compound.Count) {
    compound.Count.value = count
    return
  }
  compound.Count = { type: 'byte', value: count }
}

function applyRawItemView(compound: NbtCompound, item: ItemStackView): void {
  const nextCompound = snbtToCompound(item.raw)
  // SNBT から削除されたキーを NBT からも削除する
  for (const key of Object.keys(compound)) {
    delete compound[key]
  }
  // SNBT から生成した NBT タグを既存 compound へ反映する
  for (const [key, value] of Object.entries(nextCompound)) {
    compound[key] = value
  }
}

function applyItemView(compound: NbtCompound | undefined, item: ItemStackView): void {
  // compound が無い場合は何もしない
  if (!compound) {
    return
  }
  applyRawItemView(compound, item)
  setSlotField(compound, item.slot)
  setItemIdField(compound, item.itemId)
  setCountField(compound, item.count)
}

function createItemCompound(item: ItemStackView): NbtCompound {
  const compound = snbtToCompound(item.raw)
  setSlotField(compound, item.slot)
  setItemIdField(compound, item.itemId)
  setCountField(compound, item.count)
  return compound
}

function findEntryIndexBySlot(entries: unknown[], slot: number): number {
  // 各エントリの Slot 値を照合してインデックスを探す
  for (let index = 0; index < entries.length; index += 1) {
    const compound = entryCompound(entries[index])
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
  const entries = getItemsListEntries(owner)
  entries.length = 0
  // 全スロットを新しい compound エントリで再構築する
  for (const item of items) {
    entries.push({ type: 'compound', value: createItemCompound(item) })
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
export function updateSlotInCompound(owner: NbtCompound, slot: number, item: ItemStackView | null): ItemStackView[] {
  const entries = getItemsListEntries(owner)
  const index = findEntryIndexBySlot(entries, slot)

  // 有効なアイテムの場合は更新または追加する
  if (item && item.itemId !== MinecraftIds.ITEM_AIR && item.count > 0) {
    // 既存エントリがあれば in-place 更新する
    if (index >= 0) {
      applyItemView(entryCompound(entries[index]), item)
    // 既存エントリがなければ新規追加する
    } else {
      entries.push({ type: 'compound', value: createItemCompound(item) })
    }
  // 空スロット指定で既存エントリがあれば削除する
  } else if (index >= 0) {
    entries.splice(index, 1)
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

  const entries = getItemsListEntries(owner)
  const fromIndex = findEntryIndexBySlot(entries, fromSlot)
  const toIndex = findEntryIndexBySlot(entries, toSlot)

  // 移動元エントリが存在しない場合は移動先へ直接書き込む
  if (fromIndex < 0) {
    // 移動先に既存エントリがあれば上書きする
    if (toIndex >= 0) {
      applyItemView(entryCompound(entries[toIndex]), item)
    // 移動先が空なら新規エントリを追加する
    } else {
      entries.push({ type: 'compound', value: createItemCompound(item) })
    }
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const fromCompound = entryCompound(entries[fromIndex])
  // 移動先が空スロットの場合は移動元の Slot を更新する
  if (toIndex < 0) {
    applyItemView(fromCompound, item)
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const toCompound = entryCompound(entries[toIndex])
  const displaced = parseItemsList([toCompound])[0]
  applyItemView(fromCompound, withSlotNumber(item, toSlot))
  applyItemView(toCompound, withSlotNumber(displaced, fromSlot))
  return parseItemsList(getListItems(owner, 'Items'))
}

/**
 * 2 スロット間でアイテムを移動またはスワップする。
 *
 * @param owner - Items タグを持つ compound
 * @param fromSlot - 移動元
 * @param toSlot - 移動先
 * @returns 更新後の Items 一覧
 */
export function moveSlotInCompound(owner: NbtCompound, fromSlot: number, toSlot: number): ItemStackView[] {
  // 移動元と移動先が同じ場合は変更なし
  if (fromSlot === toSlot) {
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const entries = getItemsListEntries(owner)
  const fromIndex = findEntryIndexBySlot(entries, fromSlot)
  // 移動元にアイテムが無い場合は変更なし
  if (fromIndex < 0) {
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const toIndex = findEntryIndexBySlot(entries, toSlot)
  const fromCompound = entryCompound(entries[fromIndex])

  // 移動先が空スロットの場合は Slot 番号だけ更新する
  if (toIndex < 0) {
    setSlotField(fromCompound, toSlot)
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const toCompound = entryCompound(entries[toIndex])
  const fromItem = parseItemsList([fromCompound])[0]
  const toItem = parseItemsList([toCompound])[0]
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
  const itemsField = getCompoundField(owner, 'Items')
  // Items リストが無い、または list 型でない場合は空リストを作成する
  if (!itemsField || !isList(itemsField)) {
    owner.Items = { type: 'list', value: { type: 'compound', value: [] } }
  }
}

/**
 * デフォルト値付きの ItemStackView を生成する。
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
