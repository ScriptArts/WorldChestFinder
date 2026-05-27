import type { NbtCompound, NbtTag } from './nbtTypes'

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
