import type { ItemStackView } from '../../shared/types'
import type { NbtCompound, NbtTag } from './nbtUtils'
import { buildEmptySlot, parseItemsList } from './ItemStackParser'
import { getCompoundField, getInt, getListItems, isList } from './nbtUtils'

type ListEntry = { type: 'compound'; value: NbtCompound }
const NUMERIC_TAG_TYPES = ['byte', 'short', 'int', 'long', 'float', 'double']

function entryCompound(entry: unknown): NbtCompound {
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
  if (!compound) {
    return
  }
  if (compound.Slot) {
    compound.Slot.value = slot
    return
  }
  compound.Slot = { type: 'byte', value: slot }
}

function setItemIdField(compound: NbtCompound | undefined, itemId: string): void {
  if (!compound) {
    return
  }
  if (compound.id) {
    compound.id.value = itemId
    return
  }
  compound.id = { type: 'string', value: itemId }
}

function setCountField(compound: NbtCompound | undefined, count: number): void {
  if (!compound) {
    return
  }
  if (compound.count) {
    compound.count.value = count
    return
  }
  if (compound.Count) {
    compound.Count.value = count
    return
  }
  compound.Count = { type: 'int', value: count }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inferNumberTagType(existing: NbtTag | undefined): string {
  if (existing !== undefined) {
    // 既存タグが数値型なら、保存時に元の NBT 型を維持する
    if (NUMERIC_TAG_TYPES.includes(existing.type)) {
      return existing.type
    }
  }
  return 'int'
}

function convertListEntry(entry: unknown, itemType: string): unknown {
  if (itemType === 'compound' && isPlainObject(entry)) {
    // compound list の要素は NBT compound タグ形式へ変換する
    return { type: 'compound', value: plainObjectToCompound(entry, undefined) }
  }

  if (itemType === 'byte' && typeof entry === 'boolean') {
    // boolean は NBT byte list の 0/1 として扱う
    if (entry) {
      return 1
    }
    return 0
  }

  return entry
}

function plainArrayToListTag(values: unknown[], existing: NbtTag | undefined): NbtTag {
  const itemType = inferListItemType(values, existing)
  const listEntries: unknown[] = []
  for (const entry of values) {
    // JSON 配列を NBT list の値へ変換する
    listEntries.push(convertListEntry(entry, itemType))
  }
  return { type: 'list', value: { type: itemType, value: listEntries } }
}

function existingCompoundValue(existing: NbtTag | undefined): NbtCompound | undefined {
  if (existing !== undefined && existing.type === 'compound') {
    // 既存 compound の子タグ型をできるだけ維持する
    return existing.value as NbtCompound
  }
  return undefined
}

function inferListItemType(values: unknown[], existing: NbtTag | undefined): string {
  if (existing !== undefined && existing.type === 'list') {
    const listValue = existing.value as { type?: string }
    if (typeof listValue.type === 'string') {
      return listValue.type
    }
  }

  for (const value of values) {
    // 最初の値から list の要素型を推定する
    if (isPlainObject(value)) {
      return 'compound'
    }
    if (typeof value === 'string') {
      return 'string'
    }
    if (typeof value === 'number') {
      return 'int'
    }
    if (typeof value === 'boolean') {
      return 'byte'
    }
  }
  return 'compound'
}

function plainValueToTag(value: unknown, existing: NbtTag | undefined): NbtTag {
  if (Array.isArray(value)) {
    // JSON 配列は NBT list タグへ変換する
    return plainArrayToListTag(value, existing)
  }

  if (isPlainObject(value)) {
    // JSON オブジェクトは NBT compound タグへ変換する
    return { type: 'compound', value: plainObjectToCompound(value, existingCompoundValue(existing)) }
  }

  if (typeof value === 'string') {
    return { type: 'string', value }
  }

  if (typeof value === 'number') {
    return { type: inferNumberTagType(existing), value }
  }

  if (typeof value === 'boolean') {
    let byteValue = 0
    if (value) {
      byteValue = 1
    }
    return { type: 'byte', value: byteValue }
  }

  return { type: 'string', value: String(value) }
}

function plainObjectToCompound(
  raw: Record<string, unknown>,
  existing: NbtCompound | undefined
): NbtCompound {
  const compound: NbtCompound = {}
  for (const [key, value] of Object.entries(raw)) {
    // 既存タグがある場合は型を保ちながら JSON の値を反映する
    let existingTag: NbtTag | undefined
    if (existing !== undefined) {
      existingTag = existing[key]
    }
    compound[key] = plainValueToTag(value, existingTag)
  }
  return compound
}

function applyRawItemView(compound: NbtCompound, item: ItemStackView): void {
  const nextCompound = plainObjectToCompound(item.raw, compound)
  for (const key of Object.keys(compound)) {
    // JSON から削除されたキーを NBT からも削除する
    delete compound[key]
  }
  for (const [key, value] of Object.entries(nextCompound)) {
    // JSON から生成した NBT タグを既存 compound に反映する
    compound[key] = value
  }
}

function applyItemView(compound: NbtCompound | undefined, item: ItemStackView): void {
  if (!compound) {
    return
  }
  applyRawItemView(compound, item)
  setSlotField(compound, item.slot)
  setItemIdField(compound, item.itemId)
  setCountField(compound, item.count)
}

function createItemCompound(item: ItemStackView): NbtCompound {
  const compound = plainObjectToCompound(item.raw, undefined)
  setSlotField(compound, item.slot)
  setItemIdField(compound, item.itemId)
  setCountField(compound, item.count)
  return compound
}

function findEntryIndexBySlot(entries: unknown[], slot: number): number {
  for (let index = 0; index < entries.length; index += 1) {
    const compound = entryCompound(entries[index])
    const slotValue = getInt(compound, 'Slot')
    let effectiveSlot = -1
    if (slotValue !== undefined) {
      effectiveSlot = slotValue
    }
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

  if (item && item.itemId !== 'minecraft:air' && item.count > 0) {
    if (index >= 0) {
      applyItemView(entryCompound(entries[index]), item)
    } else {
      entries.push({ type: 'compound', value: createItemCompound(item) })
    }
  } else if (index >= 0) {
    entries.splice(index, 1)
  }

  return parseItemsList(getListItems(owner, 'Items'))
}

function withSlotNumber(item: ItemStackView, slot: number): ItemStackView {
  return {
    ...item,
    slot,
    raw: { ...item.raw, Slot: slot }
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
  if (!item || item.itemId === 'minecraft:air' || item.count <= 0) {
    return updateSlotInCompound(owner, fromSlot, null)
  }

  const toSlot = item.slot
  if (fromSlot === toSlot) {
    return updateSlotInCompound(owner, fromSlot, item)
  }

  const entries = getItemsListEntries(owner)
  const fromIndex = findEntryIndexBySlot(entries, fromSlot)
  const toIndex = findEntryIndexBySlot(entries, toSlot)

  if (fromIndex < 0) {
    if (toIndex >= 0) {
      applyItemView(entryCompound(entries[toIndex]), item)
    } else {
      entries.push({ type: 'compound', value: createItemCompound(item) })
    }
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const fromCompound = entryCompound(entries[fromIndex])
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
  if (fromSlot === toSlot) {
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const entries = getItemsListEntries(owner)
  const fromIndex = findEntryIndexBySlot(entries, fromSlot)
  if (fromIndex < 0) {
    return parseItemsList(getListItems(owner, 'Items'))
  }

  const toIndex = findEntryIndexBySlot(entries, toSlot)
  const fromCompound = entryCompound(entries[fromIndex])

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
  const raw = buildEmptySlot(slot)
  raw.id = itemId
  raw.count = count
  return {
    slot,
    itemId,
    count,
    displaySummary: '',
    raw
  }
}
