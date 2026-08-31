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
  /** WorldChestFinder がサポートする形式か */
  supported: boolean
}

/**
 * level.dat と次元構成から WorldMetadata を組み立てる。
 *
 * @param dataVersion - DataVersion 値
 * @param versionName - Version.Name（無い場合は null）
 * @param levelName - LevelName
 * @param hasVanillaOverworld - `dimensions/minecraft/overworld/` が存在する場合 true
 * @returns ワールドメタデータ
 * @remarks
 * 本ソフトウェアは Minecraft Java版 26.x のワールド構成にのみ対応する。
 * 26.x では標準の 3 次元も `dimensions/<名前空間>/<パス>/` の下に並ぶため、
 * `dimensions/minecraft/overworld/` の有無で新旧構成を判定する
 * （旧構成の `region/` や、データパック次元だけを持つ 1.21 以前のワールドを取り違えないため）。
 */
export function buildWorldMetadata(
  dataVersion: number,
  versionName: string | null,
  levelName: string,
  hasVanillaOverworld: boolean
): WorldMetadata {
  let supported = true
  let supportMessage: string | null = null
  // オーバーワールドが dimensions 配下に無いワールドは 26.x 以降の構成ではない
  if (!hasVanillaOverworld) {
    supported = false
    supportMessage =
      'dimensions/minecraft/overworld/ が見つかりません。本ソフトウェアは Minecraft Java Edition 26.x 以降のワールド構成にのみ対応しています'
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
  // Version.Name が無いワールドは DataVersion をラベルにする
  if (versionLabel === null || versionLabel.trim() === '') {
    versionLabel = `DataVersion ${metadata.dataVersion}`
  }

  return {
    dataVersion: metadata.dataVersion,
    versionLabel,
    supported: metadata.supported
  }
}
