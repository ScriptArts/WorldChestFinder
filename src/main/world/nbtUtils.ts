import { NbtCompound, NbtList, TagType, type NbtTag } from 'spring-nbt-library/nbt'

export { NbtCompound, NbtList, TagType } from 'spring-nbt-library/nbt'
export type { NbtTag } from 'spring-nbt-library/nbt'

/**
 * 値が compound 型 NBT タグか判定する。
 *
 * @param tag - 判定対象
 */
export function isCompound(tag: NbtTag | undefined): tag is NbtCompound {
  // タグが存在し compound 型なら true を返す
  if (tag !== undefined && tag.type === TagType.Compound) {
    return true
  }
  return false
}

/**
 * 値が list 型 NBT タグか判定する。
 *
 * @param tag - 判定対象
 */
function isList(tag: NbtTag | undefined): tag is NbtList {
  // タグが存在し list 型なら true を返す
  if (tag !== undefined && tag.type === TagType.List) {
    return true
  }
  return false
}

/**
 * compound から string フィールドを取得する。
 *
 * @param compound - 対象 compound
 * @param key - フィールド名
 * @returns 文字列。string 型でない場合は undefined
 */
export function getString(compound: NbtCompound, key: string): string | undefined {
  const tag = compound.opt(key)
  // string 型でない場合は undefined を返す
  if (tag === undefined || tag.type !== TagType.String) {
    return undefined
  }
  return tag.value
}

/**
 * compound から整数フィールドを取得する（int / short / byte）。
 *
 * @param compound - 対象 compound
 * @param key - フィールド名
 * @returns 数値。整数型でない場合は undefined
 */
export function getInt(compound: NbtCompound, key: string): number | undefined {
  const tag = compound.opt(key)
  // フィールドが存在しない場合は undefined を返す
  if (tag === undefined) {
    return undefined
  }
  // int / short / byte はいずれも数値として返す
  if (tag.type === TagType.Int || tag.type === TagType.Short || tag.type === TagType.Byte) {
    return tag.value
  }
  return undefined
}

/**
 * 複数キーを順に試し、最初に見つかった整数値を返す。
 *
 * @param compound - 対象 compound
 * @param keys - 試行するキー名（例: 'x', 'X'）
 * @returns 数値。いずれも取得できない場合は undefined
 */
export function getIntFirst(compound: NbtCompound, ...keys: string[]): number | undefined {
  // 各キーを順に試して最初の整数値を返す
  for (const key of keys) {
    const value = getInt(compound, key)
    // 値が見つかった場合は返す
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

/**
 * compound から compound フィールドを取得する。
 *
 * @param compound - 対象 compound
 * @param key - フィールド名
 * @returns compound。compound 型でない場合は undefined
 */
export function getCompound(compound: NbtCompound, key: string): NbtCompound | undefined {
  const tag = compound.opt(key)
  // compound 型でない場合は undefined を返す
  if (!isCompound(tag)) {
    return undefined
  }
  return tag
}

/**
 * compound から list フィールドを取得する。
 *
 * @param compound - 対象 compound
 * @param key - フィールド名
 * @returns list。list 型でない場合は undefined
 */
export function getList(compound: NbtCompound, key: string): NbtList | undefined {
  const tag = compound.opt(key)
  // list 型でない場合は undefined を返す
  if (!isList(tag)) {
    return undefined
  }
  return tag
}

/**
 * list 型フィールドの compound 要素一覧を取得する。
 *
 * @param compound - 親 compound
 * @param key - list フィールド名
 * @returns compound 要素の配列（list でない場合は空配列）
 */
export function getListItems(compound: NbtCompound, key: string): NbtCompound[] {
  const list = getList(compound, key)
  // list 型でない場合は空配列を返す
  if (list === undefined) {
    return []
  }
  const items: NbtCompound[] = []
  // list 内の compound 要素だけを結果へ集める
  for (const entry of list) {
    // compound 要素だけを対象にする
    if (isCompound(entry)) {
      items.push(entry)
    }
  }
  return items
}

/**
 * list 型フィールドの数値要素を配列で取得する（Pos などの座標リスト用）。
 *
 * @param compound - 親 compound
 * @param key - list フィールド名
 * @returns 数値の配列（数値以外の要素はスキップする）
 */
export function getNumberListValues(compound: NbtCompound, key: string): number[] {
  const list = getList(compound, key)
  // list 型でない場合は空配列を返す
  if (list === undefined) {
    return []
  }
  const values: number[] = []
  // list 内の数値要素だけを結果へ集める
  for (const entry of list) {
    // double / float / int / short / byte を数値として扱う
    if (
      entry.type === TagType.Double ||
      entry.type === TagType.Float ||
      entry.type === TagType.Int ||
      entry.type === TagType.Short ||
      entry.type === TagType.Byte
    ) {
      values.push(entry.value)
    }
  }
  return values
}
