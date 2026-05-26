import { readFile, writeFile, copyFile, rename, unlink } from 'fs/promises'
import { gunzip, gzip, inflate, deflate } from 'zlib'
import { promisify } from 'util'
import nbt from 'prismarine-nbt'
import type { NbtCompound } from './nbtUtils'
import { getChunkRoot } from './nbtUtils'
import { formatError } from '../../shared/valueUtils'
import { logger } from '../logging/AppLogger'

const gunzipAsync = promisify(gunzip)
const gzipAsync = promisify(gzip)
const inflateAsync = promisify(inflate)
const deflateAsync = promisify(deflate)

const SECTOR_SIZE = 4096
const HEADER_SIZE = SECTOR_SIZE

/** リージョン内の 1 チャンク分の NBT データ */
export interface ChunkData {
  localX: number
  localZ: number
  compression: number
  nbt: NbtCompound
}

/** ディスク上の .mca ファイルをメモリ上に展開した状態 */
export interface LoadedRegion {
  filePath: string
  buffer: Buffer
  chunks: Map<string, ChunkData>
  readErrors: string[]
}

function chunkKey(localX: number, localZ: number): string {
  return `${localX},${localZ}`
}

async function decompressChunk(data: Buffer, compression: number): Promise<Buffer> {
  // gzip 圧縮の場合は gunzip で展開する
  if (compression === 1) {
    return gunzipAsync(data) as Promise<Buffer>
  }
  // zlib 圧縮の場合は inflate で展開する
  if (compression === 2) {
    return inflateAsync(data) as Promise<Buffer>
  }
  return data
}

async function compressChunk(data: Buffer, compression: number): Promise<Buffer> {
  // gzip 圧縮の場合は gzip で圧縮する
  if (compression === 1) {
    return gzipAsync(data) as Promise<Buffer>
  }
  // zlib 圧縮の場合は deflate で圧縮する
  if (compression === 2) {
    return deflateAsync(data) as Promise<Buffer>
  }
  return data
}

/**
 * リージョンファイル（.mca）を読み込む。
 *
 * @param filePath - .mca の絶対パス
 * @returns パース済みチャンク一覧
 */
export async function readRegion(filePath: string): Promise<LoadedRegion> {
  const startedAt = Date.now()
  const buffer = await readFile(filePath)
  const chunks = new Map<string, ChunkData>()
  let skippedChunks = 0
  const readErrors: string[] = []

  // リージョンヘッダーの 1024 スロットを走査する
  for (let index = 0; index < 1024; index += 1) {
    const offset = index * 4
    const location = buffer.readUInt32BE(offset)
    // チャンク未使用スロットはスキップする
    if (location === 0) {
      continue
    }

    const sectorOffset = (location >> 8) * SECTOR_SIZE
    const sectorCount = location & 0xff
    // 不正なセクタ情報のチャンクはスキップする
    if (sectorOffset <= 0 || sectorCount <= 0) {
      continue
    }

    const length = buffer.readUInt32BE(sectorOffset)
    const compression = buffer.readUInt8(sectorOffset + 4)
    const compressed = buffer.subarray(sectorOffset + 5, sectorOffset + 4 + length)

    const localX = index & 31
    const localZ = (index >> 5) & 31
    try {
      const decompressed = await decompressChunk(compressed, compression)
      const parsed = await nbt.parse(decompressed, 'big')
      chunks.set(chunkKey(localX, localZ), {
        localX,
        localZ,
        compression,
        nbt: getChunkRoot(parsed)
      })
    } catch (error) {
      skippedChunks += 1
      // 読み取れないチャンクはスキャン結果の errors に載せるため保持する
      readErrors.push(`${filePath} chunk ${localX},${localZ}: ${formatError(error)}`)
    }
  }

  logger.debug('region', 'リージョン読み込み完了', {
    filePath,
    durationMs: Date.now() - startedAt,
    chunkCount: chunks.size,
    skippedChunks,
    fileSizeBytes: buffer.length
  })

  return { filePath, buffer, chunks, readErrors }
}

/**
 * リージョン内のチャンクをシリアライズして .mca へ書き込む。
 *
 * @param region - 書き込み対象リージョン
 * @param dirtyChunkKeys - 部分書き込み時の変更チャンクキー（省略時は全チャンク）
 * @returns ディスクへ書き込んだ新しいリージョンバッファ
 */
export async function writeRegion(region: LoadedRegion, dirtyChunkKeys?: Set<string>): Promise<Buffer> {
  const startedAt = Date.now()
  let buffer = Buffer.from(region.buffer)
  const partialWrite = dirtyChunkKeys !== undefined
  let chunksToWrite: ChunkData[]
  // 部分書き込み時は dirty チャンクだけを対象にする
  if (partialWrite) {
    chunksToWrite = [...region.chunks.values()].filter((chunk) => dirtyChunkKeys.has(chunkKey(chunk.localX, chunk.localZ)))
  // 全チャンク書き込み時は全エントリを対象にする
  } else {
    chunksToWrite = [...region.chunks.values()]
  }

  logger.criticalInfo('region', 'writeRegion 開始', {
    filePath: region.filePath,
    partialWrite,
    chunkCount: chunksToWrite.length
  })

  // 書き込み対象チャンクが 0 件の場合は失敗する
  if (chunksToWrite.length === 0) {
    throw new Error('書き込むチャンクがありません')
  }

  // 全書き込み時はヘッダーをクリアする
  if (!partialWrite) {
    buffer.fill(0, 0, HEADER_SIZE)
  }

  let nextSector = Math.ceil(buffer.length / SECTOR_SIZE)
  // 最小セクタ位置を 2 に保つ
  if (nextSector < 2) {
    nextSector = 2
  }

  let chunkIndex = 0
  // 対象チャンクを順番にシリアライズしてバッファへ書き込む
  for (const chunk of chunksToWrite) {
    chunkIndex += 1
    logger.criticalInfo('region', 'チャンク NBT シリアライズ開始', {
      filePath: region.filePath,
      chunkIndex,
      chunkTotal: chunksToWrite.length,
      localX: chunk.localX,
      localZ: chunk.localZ
    })
    const index = chunk.localX + chunk.localZ * 32
    let serialized: Buffer
    try {
      serialized = await nbt.writeUncompressed({ name: '', type: 'compound', value: chunk.nbt }, 'big')
    } catch (error) {
      throw new Error(
        `Chunk ${chunk.localX},${chunk.localZ} の NBT 書き込みに失敗: ${formatError(error)}`
      )
    }
    const compressed = await compressChunk(serialized, chunk.compression)
    const chunkLength = compressed.length + 1
    const sectorsNeeded = Math.ceil((chunkLength + 4) / SECTOR_SIZE)

    const requiredSize = (nextSector + sectorsNeeded) * SECTOR_SIZE
    // バッファ容量が不足する場合は拡張する
    if (buffer.length < requiredSize) {
      const expanded = Buffer.alloc(requiredSize)
      buffer.copy(expanded)
      expanded.fill(0, buffer.length)
      buffer = expanded
    }

    const sectorOffset = nextSector * SECTOR_SIZE
    buffer.writeUInt32BE(chunkLength, sectorOffset)
    buffer.writeUInt8(chunk.compression, sectorOffset + 4)
    compressed.copy(buffer, sectorOffset + 5)

    const location = (nextSector << 8) | sectorsNeeded
    buffer.writeUInt32BE(location, index * 4)
    nextSector += sectorsNeeded
  }

  const writtenBuffer = buffer.subarray(0, nextSector * SECTOR_SIZE)
  logger.criticalInfo('region', 'writeFile 開始', {
    filePath: region.filePath,
    outputSizeBytes: writtenBuffer.length
  })
  await writeFile(region.filePath, writtenBuffer)

  logger.criticalInfo('region', 'リージョン書き込み完了', {
    filePath: region.filePath,
    durationMs: Date.now() - startedAt,
    writtenChunkCount: chunksToWrite.length,
    partialWrite,
    outputSizeBytes: writtenBuffer.length
  })

  return Buffer.from(writtenBuffer)
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
    const tempRegion = { ...region, filePath: tempPath }
    logger.criticalInfo('region', 'writeRegion(temp) 開始', { tempPath })
    const writtenBuffer = await writeRegion(tempRegion, dirtyChunkKeys)
    logger.criticalInfo('region', 'rename(temp→本番) 開始', {
      tempPath,
      destination: region.filePath
    })
    await rename(tempPath, region.filePath)
    region.buffer = writtenBuffer
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
