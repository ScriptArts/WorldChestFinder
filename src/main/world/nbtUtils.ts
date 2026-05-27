import type { NbtCompound, NbtTag } from '../../shared/nbt/nbtTypes'

export type { NbtCompound, NbtTag } from '../../shared/nbt/nbtTypes'

/**
 * 値が compound 型 NBT タグか判定する。
 *
 * @param tag - 判定対象
 */
export function isCompound(tag: unknown): tag is NbtTag & { value: NbtCompound } {
  return typeof tag === 'object' && tag !== null && (tag as NbtTag).type === 'compound'
}

/**
 * 値が list 型 NBT タグか判定する。
 *
 * @param tag - 判定対象
 */
export function isList(tag: unknown): tag is NbtTag & { value: { type: string; value: unknown[] } } {
  return typeof tag === 'object' && tag !== null && (tag as NbtTag).type === 'list'
}

/** list エントリまたは plain object を compound に変換する */
function asCompound(value: unknown): NbtCompound | null {
  // NBT compound タグなら value を返す
  if (isCompound(value)) {
    return value.value
  }
  // plain object ならそのまま compound として扱う
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && !('type' in value)) {
    return value as NbtCompound
  }
  return null
}

/**
 * compound から指定キーのフィールドを取得する。
 *
 * @param compound - 対象 compound
 * @param key - フィールド名
 */
export function getCompoundField(compound: NbtCompound, key: string): NbtTag | undefined {
  const field = compound[key]
  // フィールドが存在しない場合は undefined を返す
  if (!field) {
    return undefined
  }
  return field
}

/**
 * compound から string フィールドを取得する。
 *
 * @param compound - 対象 compound
 * @param key - フィールド名
 */
export function getString(compound: NbtCompound, key: string): string | undefined {
  const field = getCompoundField(compound, key)
  // string 型でない場合は undefined を返す
  if (!field || field.type !== 'string') {
    return undefined
  }
  return String(field.value)
}

/**
 * compound から整数フィールドを取得する（int / short / byte）。
 *
 * @param compound - 対象 compound
 * @param key - フィールド名
 */
export function getInt(compound: NbtCompound, key: string): number | undefined {
  const field = getCompoundField(compound, key)
  // フィールドが存在しない場合は undefined を返す
  if (!field) {
    return undefined
  }
  // 整数型タグなら数値として返す
  if (field.type === 'int' || field.type === 'short' || field.type === 'byte') {
    return Number(field.value)
  }
  return undefined
}

/**
 * 複数キーを順に試し、最初に見つかった整数値を返す。
 *
 * @param compound - 対象 compound
 * @param keys - 試行するキー名（例: 'x', 'X'）
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
 * 複数キーを順に試し、最初に見つかった compound フィールドを返す。
 *
 * @param compound - 対象 compound
 * @param keys - 試行するキー名
 */
export function getCompoundFieldFirst(compound: NbtCompound, ...keys: string[]): NbtTag | undefined {
  // 各キーを順に試して最初のフィールドを返す
  for (const key of keys) {
    const field = getCompoundField(compound, key)
    // フィールドが見つかった場合は返す
    if (field !== undefined) {
      return field
    }
  }
  return undefined
}

/**
 * list 型フィールドの compound エントリ一覧を取得する。
 *
 * @param compound - 親 compound
 * @param key - list フィールド名
 * @returns compound エントリ配列（list でない場合は空配列）
 */
export function getListItems(compound: NbtCompound, key: string): NbtCompound[] {
  const field = getCompoundField(compound, key)
  // list 型でない場合は空配列を返す
  if (!field || !isList(field)) {
    return []
  }
  const items: NbtCompound[] = []
  // list 内の各エントリを compound に正規化する
  for (const entry of field.value.value) {
    const compoundEntry = asCompound(entry)
    // compound に変換できたエントリだけ結果へ追加する
    if (compoundEntry) {
      items.push(compoundEntry)
    }
  }
  return items
}

/**
 * prismarine-nbt の parse 結果からチャンクルート compound を取り出す。
 *
 * @param parsed - nbt.parse の戻り値
 */
export function getChunkRoot(parsed: { parsed: { value: NbtCompound } }): NbtCompound {
  return parsed.parsed.value
}
