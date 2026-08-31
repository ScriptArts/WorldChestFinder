import { writeFile, copyFile, rename, unlink } from 'fs/promises'
import { ChunkCompression, RegionFile, RegionFileMode } from 'spring-nbt-library/anvil'
import type { NbtCompound } from 'spring-nbt-library/nbt'
import { formatError } from '../../shared/valueUtils'
import { logger } from '../logging/AppLogger'

/** リージョン内の 1 チャンク分の NBT データ */
export interface ChunkData {
  /** 絶対チャンク X 座標 */
  chunkX: number
  /** 絶対チャンク Z 座標 */
  chunkZ: number
  /** リージョン内の X 位置 (0..31) */
  localX: number
  /** リージョン内の Z 位置 (0..31) */
  localZ: number
  /** 元のチャンク圧縮方式（書き戻し時にそのまま使う） */
  compression: ChunkCompression
  nbt: NbtCompound
}

/** ディスク上の .mca ファイルをメモリ上に展開した状態 */
export interface LoadedRegion {
  filePath: string
  chunks: Map<string, ChunkData>
  readErrors: string[]
}

function chunkKey(localX: number, localZ: number): string {
  return `${localX},${localZ}`
}

/**
 * リージョンファイル（.mca）を読み込む。
 *
 * @param filePath - .mca の絶対パス
 * @returns パース済みチャンク一覧
 * @remarks Anvil 形式の解釈と展開は SpringNBTLibrary の {@link RegionFile} が行う。
 */
export async function readRegion(filePath: string): Promise<LoadedRegion> {
  const startedAt = Date.now()
  const chunks = new Map<string, ChunkData>()
  const readErrors: string[] = []
  let skippedChunks = 0

  const regionFile = RegionFile.open(filePath, RegionFileMode.ReadOnly)
  try {
    // リージョンに存在する全チャンクを NBT として読み込む
    for (const position of regionFile.chunkPositions()) {
      try {
        const raw = regionFile.readChunkRaw(position.x, position.z)
        // 実体が無いチャンクはスキップする
        if (raw === undefined) {
          continue
        }
        const nbt = regionFile.readChunk(position.x, position.z)
        // NBT を読めなかったチャンクはスキップする
        if (nbt === undefined) {
          continue
        }
        chunks.set(chunkKey(position.localX, position.localZ), {
          chunkX: position.x,
          chunkZ: position.z,
          localX: position.localX,
          localZ: position.localZ,
          compression: raw.compression,
          nbt
        })
      } catch (error) {
        skippedChunks += 1
        // 読み取れないチャンクはスキャン結果の errors に載せるため保持する
        readErrors.push(`${filePath} chunk ${position.localX},${position.localZ}: ${formatError(error)}`)
      }
    }
  } finally {
    // 読み取り専用で開いているので、閉じてもファイルは書き換わらない
    regionFile.close()
  }

  logger.debug('region', 'リージョン読み込み完了', {
    filePath,
    durationMs: Date.now() - startedAt,
    chunkCount: chunks.size,
    skippedChunks
  })

  return { filePath, chunks, readErrors }
}

/**
 * リージョン内のチャンクをシリアライズしてバイト列を組み立てる。
 *
 * @param region - 書き込み対象リージョン
 * @param dirtyChunkKeys - 部分書き込み時の変更チャンクキー（省略時は全チャンク）
 * @returns 書き込むべき .mca のバイト列
 * @remarks ディスク上の元ファイルを開き直し、変更チャンクだけを書き戻す。
 */
async function buildRegionBytes(region: LoadedRegion, dirtyChunkKeys?: Set<string>): Promise<Uint8Array> {
  const startedAt = Date.now()
  const partialWrite = dirtyChunkKeys !== undefined
  let chunksToWrite: ChunkData[]
  // 部分書き込み時は dirty チャンクだけを対象にする
  if (partialWrite) {
    chunksToWrite = [...region.chunks.values()].filter((chunk) =>
      dirtyChunkKeys.has(chunkKey(chunk.localX, chunk.localZ))
    )
  // 全チャンク書き込み時は全エントリを対象にする
  } else {
    chunksToWrite = [...region.chunks.values()]
  }

  logger.criticalInfo('region', 'リージョンバイト列組み立て開始', {
    filePath: region.filePath,
    partialWrite,
    chunkCount: chunksToWrite.length
  })

  // 書き込み対象チャンクが 0 件の場合は失敗する
  if (chunksToWrite.length === 0) {
    throw new Error('書き込むチャンクがありません')
  }

  const regionFile = RegionFile.open(region.filePath, RegionFileMode.ReadWrite)

  let chunkIndex = 0
  // 対象チャンクを順番にシリアライズしてリージョンへ書き込む
  for (const chunk of chunksToWrite) {
    chunkIndex += 1
    logger.criticalInfo('region', 'チャンク NBT シリアライズ開始', {
      filePath: region.filePath,
      chunkIndex,
      chunkTotal: chunksToWrite.length,
      localX: chunk.localX,
      localZ: chunk.localZ
    })
    try {
      // 元の圧縮方式を維持したまま書き戻す
      regionFile.writeChunk(chunk.chunkX, chunk.chunkZ, chunk.nbt, chunk.compression)
    } catch (error) {
      throw new Error(`Chunk ${chunk.localX},${chunk.localZ} の NBT 書き込みに失敗: ${formatError(error)}`)
    }
  }

  const bytes = regionFile.toBytes()
  logger.criticalInfo('region', 'リージョンバイト列組み立て完了', {
    filePath: region.filePath,
    durationMs: Date.now() - startedAt,
    writtenChunkCount: chunksToWrite.length,
    partialWrite,
    outputSizeBytes: bytes.length
  })

  return bytes
}

/**
 * バックアップ作成後、一時ファイル経由でアトミックにリージョンを保存する。
 *
 * @param region - 保存対象
 * @param dirtyChunkKeys - 部分書き込み時の変更チャンクキー
 */
export async function saveRegionAtomic(region: LoadedRegion, dirtyChunkKeys?: Set<string>): Promise<void> {
  const backupPath = `${region.filePath}.bak.${Date.now()}`
  const tempPath = `${region.filePath}.tmp.mca`
  logger.criticalInfo('region', 'アトミック保存開始', {
    filePath: region.filePath,
    backupPath,
    tempPath
  })
  logger.criticalInfo('region', 'copyFile(backup) 開始', {
    source: region.filePath,
    destination: backupPath
  })
  await copyFile(region.filePath, backupPath)
  logger.criticalInfo('region', 'copyFile(backup) 完了', { backupPath })
  try {
    const bytes = await buildRegionBytes(region, dirtyChunkKeys)
    logger.criticalInfo('region', 'writeFile(temp) 開始', {
      tempPath,
      outputSizeBytes: bytes.length
    })
    await writeFile(tempPath, bytes)
    logger.criticalInfo('region', 'rename(temp→本番) 開始', {
      tempPath,
      destination: region.filePath
    })
    await rename(tempPath, region.filePath)
    logger.criticalInfo('region', 'アトミック保存完了', { filePath: region.filePath })
  } catch (error) {
    try {
      await unlink(tempPath)
    } catch {
      // 一時ファイル削除失敗は無視する
    }
    logger.criticalError('region', 'アトミック保存失敗', {
      filePath: region.filePath,
      error: formatError(error)
    })
    throw error
  }
}
