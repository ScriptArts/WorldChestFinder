import path from 'path'
import type { ContainerRecord, ScanProgress, ScanResult, WorldMetadata } from '../../shared/types'
import { createWorldFormat, type WorldFormat } from '../../shared/world/WorldFormat'
import { formatError, invokeOptional } from '../../shared/valueUtils'
import { logger } from '../logging/AppLogger'
import { readWorldLayout } from './WorldLayout'
import { readRegion, type ChunkData, type LoadedRegion } from './AnvilRegionReader'
import { findItemsHits, hitsToContainers } from './ItemsLocator'
import { mergeLargeChests } from './LargeChestMerger'
import { getInt } from './nbtUtils'

/** スキャン進捗通知コールバック */
export type ProgressCallback = (progress: ScanProgress) => void

/** コンテナとリージョンファイル内チャンク座標の紐付け */
export interface ContainerBinding {
  regionFile: string
  localX: number
  localZ: number
}

/** スキャン後の in-memory セッション状態 */
export interface ScanSession {
  worldPath: string
  worldMetadata: WorldMetadata
  worldFormat: WorldFormat
  regions: Map<string, LoadedRegion>
  containers: ContainerRecord[]
  bindings: Map<string, ContainerBinding>
  errors: string[]
}

function resolveChunkCoordinates(chunk: ChunkData): { chunkX: number; chunkZ: number } {
  let chunkX = getInt(chunk.nbt, 'xPos')
  // xPos が無いチャンクはリージョンのロケーション表由来の絶対座標を使う
  if (chunkX === undefined) {
    chunkX = chunk.chunkX
  }

  let chunkZ = getInt(chunk.nbt, 'zPos')
  // zPos が無いチャンクはリージョンのロケーション表由来の絶対座標を使う
  if (chunkZ === undefined) {
    chunkZ = chunk.chunkZ
  }

  return { chunkX, chunkZ }
}

/**
 * ワールド内の .mca を走査し、Items タグを持つコンテナを収集する。
 *
 * @param worldPath - ワールドディレクトリ
 * @param onProgress - 進捗通知（省略可）
 * @returns コンテナ一覧とバインディング情報
 */
export async function scanWorld(worldPath: string, onProgress?: ProgressCallback): Promise<ScanSession> {
  const startedAt = Date.now()
  const layout = await readWorldLayout(worldPath)
  const worldMetadata = layout.metadata
  const worldFormat = createWorldFormat(worldMetadata)
  const regionEntries = layout.regionFiles
  logger.info('scan', 'リージョンファイル一覧を取得', {
    worldPath,
    regionFileCount: regionEntries.length,
    dataVersion: worldMetadata.dataVersion,
    versionName: worldMetadata.versionName
  })
  const containers: ContainerRecord[] = []
  const bindings = new Map<string, ContainerBinding>()
  const errors: string[] = []

  // level.dat の形式が非対応なら警告を記録する
  if (worldMetadata.supportMessage !== null) {
    errors.push(worldMetadata.supportMessage)
  }

  invokeOptional(onProgress, {
    phase: 'scan-discovery',
    current: 0,
    total: regionEntries.length,
    message: `Found ${regionEntries.length} region files`
  })

  // 各リージョンファイルを走査して Items タグを持つコンテナを収集する
  for (let index = 0; index < regionEntries.length; index += 1) {
    const entry = regionEntries[index]
    const mcaPath = entry.filePath
    invokeOptional(onProgress, {
      phase: 'scan-region',
      current: index + 1,
      total: regionEntries.length,
      message: `Scanning ${path.basename(mcaPath)}`
    })

    // リージョン 1 件の読み込みは同期処理のため、進捗 IPC を送れるよう制御を返す
    await new Promise<void>((resolve) => setImmediate(resolve))

    try {
      const region = await readRegion(mcaPath)
      const dimension = entry.dimensionId
      // 破損チャンクの読み取りエラーを scan errors へ追加する
      for (const readError of region.readErrors) {
        // 破損チャンクの欠落を UI で認識できるように scan errors へ追加する
        errors.push(readError)
      }

      // リージョン内の各チャンクから Items コンテナを収集する
      for (const chunk of region.chunks.values()) {
        const chunkCoords = resolveChunkCoordinates(chunk)

        const hits = findItemsHits(chunk.nbt)
        const chunkContainers = hitsToContainers(hits, {
          dimension,
          regionFile: mcaPath,
          chunkX: chunkCoords.chunkX,
          chunkZ: chunkCoords.chunkZ
        })

        // チャンク内の各コンテナに binding を登録する
        for (const container of chunkContainers) {
          // コンテナ ID とチャンク座標の binding を登録する
          bindings.set(container.id, {
            regionFile: mcaPath,
            localX: chunk.localX,
            localZ: chunk.localZ
          })
        }

        containers.push(...chunkContainers)
      }

      logger.debug('scan', 'リージョン走査完了', {
        mcaPath,
        dimension,
        chunkCount: region.chunks.size,
        containerCount: containers.length,
        readErrorCount: region.readErrors.length
      })
    } catch (error) {
      const message = `${mcaPath}: ${formatError(error)}`
      errors.push(message)
      logger.warn('scan', 'リージョン走査失敗', { mcaPath, error: formatError(error) })
    }
  }

  const mergedContainers = mergeLargeChests(containers)

  // マージで新しく生成されたラージチェストの binding を登録する
  for (const container of mergedContainers) {
    // 新規ラージチェストで binding 未登録の場合は primary 側を紐付ける
    if (container.largeChest && !bindings.has(container.id)) {
      bindings.set(container.id, {
        regionFile: container.largeChest.primary.regionFile,
        localX: -1,
        localZ: -1
      })
    }
  }

  invokeOptional(onProgress, {
    phase: 'scan-finished',
    current: regionEntries.length,
    total: regionEntries.length,
    message: `Found ${mergedContainers.length} containers`
  })

  logger.info('scan', 'ワールド走査完了', {
    worldPath,
    durationMs: Date.now() - startedAt,
    regionFileCount: regionEntries.length,
    dataVersion: worldMetadata.dataVersion,
    containerCount: mergedContainers.length,
    largeChestCount: mergedContainers.filter((c) => c.largeChest).length,
    errorCount: errors.length
  })

  return {
    worldPath,
    worldMetadata,
    worldFormat,
    regions: new Map<string, LoadedRegion>(),
    containers: mergedContainers,
    bindings,
    errors
  }
}

/**
 * ScanSession を renderer 向け ScanResult に変換する。
 *
 * @param session - 内部セッション
 * @returns IPC 返却用結果
 */
export function toScanResult(session: ScanSession): ScanResult {
  return {
    worldPath: session.worldPath,
    worldMetadata: session.worldMetadata,
    containers: session.containers,
    errors: session.errors
  }
}
