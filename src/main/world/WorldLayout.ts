import path from 'path'
import { Dimension, MinecraftWorld } from 'spring-nbt-library/world'
import { formatError } from '../../shared/valueUtils'
import { buildWorldMetadata, type WorldMetadata } from '../../shared/world/WorldFormat'
import { getCompound, getInt, getString, type NbtCompound } from './nbtUtils'

/** 走査対象のリージョンファイル 1 件 */
export interface RegionFileEntry {
  /** 次元 ID（minecraft:overworld など） */
  dimensionId: string
  /** .mca の絶対パス */
  filePath: string
}

/** ワールドのメタデータと走査対象のリージョンファイル一覧 */
export interface WorldLayout {
  metadata: WorldMetadata
  regionFiles: RegionFileEntry[]
}

function readVersionName(data: NbtCompound): string | null {
  const version = getCompound(data, 'Version')
  // Version compound が無い場合はバージョン名を取得できない
  if (version === undefined) {
    return null
  }
  const name = getString(version, 'Name')
  // Name が空文字の場合はバージョン名なしとして扱う
  if (name === undefined || name.trim() === '') {
    return null
  }
  return name
}

function readDataVersion(data: NbtCompound): number {
  const dataVersion = getInt(data, 'DataVersion')
  // DataVersion を読めない場合は 0 とする
  if (dataVersion === undefined) {
    return 0
  }
  return dataVersion
}

function readLevelName(data: NbtCompound, fallbackName: string): string {
  const levelName = getString(data, 'LevelName')
  // LevelName が空の場合はディレクトリ名で代用する
  if (levelName === undefined || levelName.trim() === '') {
    return fallbackName
  }
  return levelName
}

/**
 * ワールドを開き、level.dat のメタデータと走査対象の .mca を列挙する。
 *
 * @param worldPath - ワールドディレクトリ
 * @returns メタデータとリージョンファイル一覧
 * @remarks
 * level.dat の読み取りと次元の解決は SpringNBTLibrary の {@link MinecraftWorld} が行う。
 * 対象は Minecraft Java版 26.x の `dimensions/&lt;名前空間&gt;/&lt;パス&gt;/` 構成で、
 * 各次元の `region/` と `entities/` を走査対象にする（`poi/` はコンテナを含まないため除外）。
 */
export async function readWorldLayout(worldPath: string): Promise<WorldLayout> {
  const fallbackName = path.basename(worldPath)

  let world: MinecraftWorld
  try {
    // 読み取り専用で開くため session.lock は確認されない
    world = MinecraftWorld.open(worldPath)
  } catch (error) {
    const metadata = buildWorldMetadata(0, null, fallbackName, false)
    return {
      metadata: {
        ...metadata,
        supported: false,
        supportMessage: `level.dat を読み取れませんでした: ${formatError(error)}`
      },
      regionFiles: []
    }
  }

  try {
    const data = world.level.data
    const regionFiles: RegionFileEntry[] = []
    const dimensionIds = world.dimensionIds()
    // 26.x では標準の3次元も dimensions 配下に並ぶので、その有無で構成を判定する
    const hasVanillaOverworld = world.dimension(Dimension.OVERWORLD) !== undefined

    // 各次元の region/ と entities/ に並ぶ .mca を走査対象へ集める
    for (const dimensionId of dimensionIds) {
      const dimension = world.dimension(dimensionId)
      // ディレクトリを解決できない次元はスキップする
      if (dimension === undefined) {
        continue
      }

      // 地形（block entity）とエンティティの双方にコンテナが存在しうる
      for (const folder of [dimension.regionFolder, dimension.entityFolder]) {
        // 生成されていないフォルダは走査対象にしない
        if (folder === undefined) {
          continue
        }
        // フォルダ内の r.X.Z.mca を絶対パスへ変換する
        for (const position of folder.regionPositions()) {
          regionFiles.push({
            dimensionId,
            filePath: path.join(folder.directory, position.fileName)
          })
        }
      }
    }

    return {
      metadata: buildWorldMetadata(
        readDataVersion(data),
        readVersionName(data),
        readLevelName(data, fallbackName),
        hasVanillaOverworld
      ),
      regionFiles
    }
  } finally {
    // 列挙のために開いたリージョンフォルダを閉じる
    world.close()
  }
}
