import { SpringNbtError } from 'spring-nbt-library'
import { NbtCompound, snbt } from 'spring-nbt-library/nbt'
import { formatError } from '../../shared/valueUtils'

/** SNBT 変換オプション */
export interface SnbtFormatOptions {
  /** 整形出力する場合は true */
  pretty?: boolean
}

/** SNBT パースエラー */
export class SnbtParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnbtParseError'
  }
}

/**
 * NBT compound を SNBT 文字列へ変換する。
 *
 * @param compound - 変換元 compound
 * @param options - 出力形式
 * @returns SNBT 文字列
 */
export function compoundToSnbt(compound: NbtCompound, options?: SnbtFormatOptions): string {
  let pretty = false
  // 整形出力が指定されていれば pretty を有効化する
  if (options !== undefined && options.pretty === true) {
    pretty = true
  }
  // 整形有無に応じて SpringNBTLibrary の出力を切り替える
  if (pretty) {
    return snbt.writePretty(compound)
  }
  return snbt.write(compound)
}

/**
 * SNBT 文字列を NBT compound へ変換する。
 *
 * @param text - SNBT 文字列
 * @returns パース結果 compound
 * @throws SnbtParseError 形式が不正な場合
 */
export function snbtToCompound(text: string): NbtCompound {
  try {
    return snbt.parseCompound(text)
  } catch (error) {
    // ライブラリの例外は SNBT 形式エラーとして呼び出し側へ伝える
    if (error instanceof SpringNbtError) {
      throw new SnbtParseError(error.message)
    }
    throw new SnbtParseError(formatError(error))
  }
}

/**
 * SNBT 内の Slot フィールドだけを差し替える。
 *
 * @param text - 元 SNBT
 * @param slot - 新しいスロット番号
 * @returns Slot を書き換えた SNBT
 * @throws SnbtParseError 元 SNBT の形式が不正な場合
 */
export function replaceSlotInSnbt(text: string, slot: number): string {
  const compound = snbtToCompound(text)
  compound.setByte('Slot', slot)
  return compoundToSnbt(compound, { pretty: true })
}

/**
 * アイテム 1 件分の SNBT テンプレートを組み立てる。
 *
 * @param slot - スロット番号
 * @param itemId - アイテム ID
 * @param count - 個数
 * @returns SNBT 文字列（整形出力）
 * @remarks
 * 空スロットの初期表示や、SNBT 変換に失敗したときの代替表示に使う。
 * 文字列の組み立ては行わず、タグを組んで SpringNBTLibrary に直列化させる。
 */
export function buildItemSnbt(slot: number, itemId: string, count: number): string {
  const item = new NbtCompound()
  item.setByte('Slot', slot)
  item.setString('id', itemId)
  item.setInt('count', count)
  return compoundToSnbt(item, { pretty: true })
}
