import { getInt } from '../nbt/nbtAccess'
import type { NbtCompound } from '../nbt/nbtTypes'

/** 1.18 以降の Anvil チャンク形式の最小 DataVersion */
export const DATA_VERSION_JAVA_1_18 = 2860

/** 1.20.5 以降の item 個数フィールド（`count`）を使う DataVersion */
export const DATA_VERSION_JAVA_1_20_5 = 3837

/** level.dat から取得したワールドメタデータ */
export interface WorldMetadata {
  /** ワールド表示名 */
  levelName: string
  /** level.dat の DataVersion */
  dataVersion: number
  /** level.dat の Version.Name（無い場合は null） */
  versionName: string | null
  /** WorldChestFinder がサポートする形式か */
  supported: boolean
  /** 非対応時の説明メッセージ */
  supportMessage: string | null
}

/** GUI 表示と新規 SNBT 生成時に参照するワールド形式 */
export interface WorldFormat {
  /** level.dat の DataVersion */
  dataVersion: number
  /** UI 表示用バージョンラベル */
  versionLabel: string
  /** GUI 表示で Count (byte) を優先する場合 true */
  usesLegacyItemCount: boolean
  /** WorldChestFinder がサポートする形式か */
  supported: boolean
}

/**
 * level.dat の内容から WorldMetadata を組み立てる。
 *
 * @param dataVersion - DataVersion 値
 * @param versionName - Version.Name（省略可）
 * @param levelName - LevelName
 */
export function buildWorldMetadata(
  dataVersion: number,
  versionName: string | null,
  levelName: string
): WorldMetadata {
  let supported = true
  let supportMessage: string | null = null
  // 1.18 未満の DataVersion は現行 Anvil チャンク形式非対応とみなす
  if (dataVersion < DATA_VERSION_JAVA_1_18) {
    supported = false
    supportMessage = `DataVersion ${dataVersion} は Minecraft Java Edition 1.18 未満のワールド形式です（対応最小 DataVersion: ${DATA_VERSION_JAVA_1_18}）`
  }
  return {
    levelName,
    dataVersion,
    versionName,
    supported,
    supportMessage
  }
}

/**
 * WorldMetadata から読み書き用 WorldFormat を生成する。
 *
 * @param metadata - level.dat 由来のメタデータ
 */
export function createWorldFormat(metadata: WorldMetadata): WorldFormat {
  let versionLabel = metadata.versionName
  if (versionLabel === null || versionLabel.trim() === '') {
    versionLabel = `DataVersion ${metadata.dataVersion}`
  }

  let usesLegacyItemCount = true
  if (metadata.dataVersion >= DATA_VERSION_JAVA_1_20_5) {
    usesLegacyItemCount = false
  }

  return {
    dataVersion: metadata.dataVersion,
    versionLabel,
    usesLegacyItemCount,
    supported: metadata.supported
  }
}

/**
 * item compound から個数を読み取る。
 *
 * @param compound - item NBT
 * @param format - ワールド形式
 */
export function readItemCount(compound: NbtCompound, format: WorldFormat): number {
  const modernCount = getInt(compound, 'count')
  const legacyCount = getInt(compound, 'Count')
  // 1.20.4 以前は Count を優先する
  if (format.usesLegacyItemCount) {
    if (legacyCount !== undefined) {
      return legacyCount
    }
    if (modernCount !== undefined) {
      return modernCount
    }
    return 0
  }
  // 1.20.5 以降は count を優先する
  if (modernCount !== undefined) {
    return modernCount
  }
  if (legacyCount !== undefined) {
    return legacyCount
  }
  return 0
}

