import { MinecraftIds } from '../../shared/minecraftIds'
import type { ItemStackView } from '../../shared/types'
import type { NbtCompound, NbtTag } from './nbtUtils'
import { buildEmptySlot, parseItemsList } from './ItemStackParser'
import { getCompoundField, getInt, getListItems, isList } from './nbtUtils'

type ListEntry = { type: 'compound'; value: NbtCompound }
const NUMERIC_TAG_TYPES = ['byte', 'short', 'int', 'long', 'float', 'double']

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
  compound.Count = { type: 'int', value: count }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inferNumberTagType(existing: NbtTag | undefined): string {
  // 既存タグがある場合は型を維持する
  if (existing !== undefined) {
    // 既存タグが数値型なら、保存時に元の NBT 型を維持する
    if (NUMERIC_TAG_TYPES.includes(existing.type)) {
      return existing.type
    }
  }
  return 'int'
}

function convertListEntry(entry: unknown, itemType: string): unknown {
  // compound list の要素は NBT compound へ変換する
  if (itemType === 'compound' && isPlainObject(entry)) {
    // compound list の要素は NBT compound タグ形式へ変換する
    return { type: 'compound', value: plainObjectToCompound(entry, undefined) }
  }

  // byte list の boolean 要素は 0/1 に変換する
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
  // JSON 配列の各要素を list エントリへ変換する
  for (const entry of values) {
    // JSON 配列を NBT list の値へ変換する
    listEntries.push(convertListEntry(entry, itemType))
  }
  return { type: 'list', value: { type: itemType, value: listEntries } }
}

function existingCompoundValue(existing: NbtTag | undefined): NbtCompound | undefined {
  // 既存 compound タグの value を返す
  if (existing !== undefined && existing.type === 'compound') {
    // 既存 compound の子タグ型をできるだけ維持する
    return existing.value as NbtCompound
  }
  return undefined
}

function inferListItemType(values: unknown[], existing: NbtTag | undefined): string {
  // 既存 list タグの要素型があればそれを使う
  if (existing !== undefined && existing.type === 'list') {
    const listValue = existing.value as { type?: string }
    // list の type フィールドが文字列なら採用する
    if (typeof listValue.type === 'string') {
      return listValue.type
    }
  }

  // 既存 list 型が無い場合は値から要素型を推定する
  for (const value of values) {
    // 最初の値から list の要素型を推定する
    if (isPlainObject(value)) {
      return 'compound'
    }
    // 文字列要素なら string list とする
    if (typeof value === 'string') {
      return 'string'
    }
    // 数値要素なら int list とする
    if (typeof value === 'number') {
      return 'int'
    }
    // 真偽値要素なら byte list とする
    if (typeof value === 'boolean') {
      return 'byte'
    }
  }
  return 'compound'
}

function plainValueToTag(value: unknown, existing: NbtTag | undefined): NbtTag {
  // JSON 配列は NBT list タグへ変換する
  if (Array.isArray(value)) {
    return plainArrayToListTag(value, existing)
  }

  // JSON オブジェクトは NBT compound タグへ変換する
  if (isPlainObject(value)) {
    return { type: 'compound', value: plainObjectToCompound(value, existingCompoundValue(existing)) }
  }

  // 文字列は string タグへ変換する
  if (typeof value === 'string') {
    return { type: 'string', value }
  }

  // 数値は既存型を維持した数値タグへ変換する
  if (typeof value === 'number') {
    return { type: inferNumberTagType(existing), value }
  }

  // 真偽値は byte タグへ変換する
  if (typeof value === 'boolean') {
    let byteValue = 0
    // true は 1、false は 0 として保存する
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
  // JSON の各キーを NBT タグへ変換する
  for (const [key, value] of Object.entries(raw)) {
    // 既存タグがある場合は型を保ちながら JSON の値を反映する
    let existingTag: NbtTag | undefined
    // 既存 compound に同名キーがあれば型情報を引き継ぐ
    if (existing !== undefined) {
      existingTag = existing[key]
    }
    compound[key] = plainValueToTag(value, existingTag)
  }
  return compound
}

function applyRawItemView(compound: NbtCompound, item: ItemStackView): void {
  const nextCompound = plainObjectToCompound(item.raw, compound)
  // JSON から削除されたキーを NBT からも削除する
  for (const key of Object.keys(compound)) {
    // JSON から削除されたキーを NBT からも削除する
    delete compound[key]
  }
  // 生成した NBT タグを既存 compound へ反映する
  for (const [key, value] of Object.entries(nextCompound)) {
    // JSON から生成した NBT タグを既存 compound に反映する
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
  const compound = plainObjectToCompound(item.raw, undefined)
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
