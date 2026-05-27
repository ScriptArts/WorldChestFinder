import { readdir, stat } from 'fs/promises'
import path from 'path'
import type { ContainerRecord, ScanProgress, ScanResult } from '../../shared/types'
import { formatError, invokeOptional } from '../../shared/valueUtils'
import { logger } from '../logging/AppLogger'
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
  regions: Map<string, LoadedRegion>
  containers: ContainerRecord[]
  bindings: Map<string, ContainerBinding>
  errors: string[]
}

async function findMcaFiles(root: string): Promise<string[]> {
  const results: string[] = []

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    // サブディレクトリと .mca ファイルを再帰的に収集する
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      // サブディレクトリは再帰的に走査する
      if (entry.isDirectory()) {
        // POI リージョンはチェスト検索対象外のため走査しない
        if (entry.name === 'poi') {
          continue
        }
        await walk(fullPath)
        continue
      }
      // .mca ファイルを結果一覧へ追加する
      if (entry.isFile() && entry.name.endsWith('.mca')) {
        const fileStat = await stat(fullPath)
        // 空ファイルは Anvil ヘッダーを読めないためスキップする
        if (fileStat.size === 0) {
          continue
        }
        results.push(fullPath)
      }
    }
  }

  await walk(root)
  return results.sort()
}

function inferDimension(worldPath: string, mcaPath: string): string {
  const relative = path.relative(worldPath, mcaPath)
  const parts = relative.split(path.sep)
  // ネザーディメンションを判定する
  if (parts[0] === 'DIM-1') {
    return 'nether'
  }
  // エンドディメンションを判定する
  if (parts[0] === 'DIM1') {
    return 'end'
  }
  // カスタムディメンションを判定する
  if (parts[0] === 'dimensions' && parts.length >= 2) {
    return parts[1]
  }
  return 'overworld'
}

function parseRegionCoords(fileName: string): { regionX: number; regionZ: number } | null {
  const match = fileName.match(/^r\.(-?\d+)\.(-?\d+)\.mca$/)
  // ファイル名形式が一致しない場合は座標を復元できない
  if (!match) {
    return null
  }
  return { regionX: Number(match[1]), regionZ: Number(match[2]) }
}

function resolveChunkCoordinates(
  chunk: ChunkData,
  regionX: number,
  regionZ: number
): { chunkX: number; chunkZ: number } {
  let chunkX = getInt(chunk.nbt, 'xPos')
  // xPos がないチャンクはリージョン座標とローカル座標から補完する
  if (chunkX === undefined) {
    chunkX = regionX * 32 + chunk.localX
  }

  let chunkZ = getInt(chunk.nbt, 'zPos')
  // zPos がないチャンクはリージョン座標とローカル座標から補完する
  if (chunkZ === undefined) {
    chunkZ = regionZ * 32 + chunk.localZ
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
  const mcaFiles = await findMcaFiles(worldPath)
  logger.info('scan', 'リージョンファイル一覧を取得', {
    worldPath,
    regionFileCount: mcaFiles.length
  })
  const containers: ContainerRecord[] = []
  const bindings = new Map<string, ContainerBinding>()
  const errors: string[] = []

  invokeOptional(onProgress, {
    phase: 'scan-discovery',
    current: 0,
    total: mcaFiles.length,
    message: `Found ${mcaFiles.length} region files`
  })

  // 各リージョンファイルを走査して Items タグを持つコンテナを収集する
  for (let index = 0; index < mcaFiles.length; index += 1) {
    const mcaPath = mcaFiles[index]
    invokeOptional(onProgress, {
      phase: 'scan-region',
      current: index + 1,
      total: mcaFiles.length,
      message: `Scanning ${path.basename(mcaPath)}`
    })

    try {
      const region = await readRegion(mcaPath)
      const dimension = inferDimension(worldPath, mcaPath)
      const coords = parseRegionCoords(path.basename(mcaPath))
      // 破損チャンクの読み取りエラーを scan errors へ追加する
      for (const readError of region.readErrors) {
        // 破損チャンクの欠落を UI で認識できるように scan errors へ追加する
        errors.push(readError)
      }

      let regionX = 0
      let regionZ = 0
      // リージョン座標が取得できた場合は補完に使う
      if (coords !== null) {
        regionX = coords.regionX
        regionZ = coords.regionZ
      }

      // リージョン内の各チャンクから Items コンテナを収集する
      for (const chunk of region.chunks.values()) {
        const chunkCoords = resolveChunkCoordinates(chunk, regionX, regionZ)

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
    current: mcaFiles.length,
    total: mcaFiles.length,
    message: `Found ${mergedContainers.length} containers`
  })

  logger.info('scan', 'ワールド走査完了', {
    worldPath,
    durationMs: Date.now() - startedAt,
    regionFileCount: mcaFiles.length,
    containerCount: mergedContainers.length,
    largeChestCount: mergedContainers.filter((c) => c.largeChest).length,
    errorCount: errors.length
  })

  return {
    worldPath,
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
    containers: session.containers,
    errors: session.errors
  }
}
