import { formatError, invokeOptional } from '../../shared/valueUtils'
import type { SaveProgress, SaveReport } from '../../shared/types'
import { logger } from '../logging/AppLogger'
import { saveRegionAtomic, type LoadedRegion } from './AnvilRegionReader'
import path from 'path'

/** 保存進捗を main から renderer へ通知するコールバック */
export type SaveProgressCallback = (progress: SaveProgress) => void

function getDirtyChunkKeys(
  region: LoadedRegion,
  dirtyChunksByRegion: Map<string, Set<string>> | undefined
): Set<string> | undefined {
  if (dirtyChunksByRegion !== undefined) {
    // リージョン単位の dirty chunk 指定があれば部分書き込みに使う
    return dirtyChunksByRegion.get(region.filePath)
  }
  return undefined
}

function getDirtyChunkCount(region: LoadedRegion, dirtyChunkKeys: Set<string> | undefined): number {
  if (dirtyChunkKeys !== undefined) {
    // 部分書き込み時は dirty chunk 数をログへ出す
    return dirtyChunkKeys.size
  }
  return region.chunks.size
}

function buildFinishMessage(savedCount: number, errorCount: number): string {
  if (errorCount > 0) {
    // 失敗がある場合は保存件数よりエラー件数を優先して表示する
    return `${errorCount} 件のエラー`
  }
  return `${savedCount} 件を保存しました`
}

/**
 * 変更済みリージョンを順番にディスクへ書き込む。
 *
 * @param regions - 保存対象リージョン
 * @param onProgress - 進捗通知（省略可）
 * @param dirtyChunksByRegion - リージョンごとの変更チャンクキー（部分書き込み用）
 * @returns 保存結果レポート
 */
export async function saveModifiedRegions(
  regions: Iterable<LoadedRegion>,
  onProgress?: SaveProgressCallback,
  dirtyChunksByRegion?: Map<string, Set<string>>
): Promise<SaveReport> {
  const regionList = [...regions]
  const savedFiles: string[] = []
  const errors: string[] = []
  const total = regionList.length

  if (total === 0) {
    logger.criticalInfo('save', '保存対象リージョンなし')
    invokeOptional(onProgress, {
      phase: 'save-finished',
      current: 0,
      total: 0,
      message: '保存対象のリージョンファイルがありません'
    })
    return { success: true, savedFiles, errors }
  }

  invokeOptional(onProgress, {
    phase: 'save-start',
    current: 0,
    total,
    message: `${total} 件のリージョンファイルを保存します`
  })

  logger.criticalInfo('save', 'リージョン保存開始', { regionCount: total })

  // 変更されたリージョンを順番に書き込む
  for (let index = 0; index < regionList.length; index += 1) {
    const region = regionList[index]
    invokeOptional(onProgress, {
      phase: 'save-region',
      current: index + 1,
      total,
      message: `保存中: ${path.basename(region.filePath)}`
    })

    try {
      const dirtyChunkKeys = getDirtyChunkKeys(region, dirtyChunksByRegion)
      logger.criticalInfo('save', 'リージョン保存中', {
        index: index + 1,
        total,
        filePath: region.filePath,
        dirtyChunkCount: getDirtyChunkCount(region, dirtyChunkKeys)
      })
      await saveRegionAtomic(region, dirtyChunkKeys)
      savedFiles.push(region.filePath)
      logger.criticalInfo('save', 'リージョン保存成功', { filePath: region.filePath })
    } catch (error) {
      const message = `${region.filePath}: ${formatError(error)}`
      errors.push(message)
      logger.criticalError('save', 'リージョン保存失敗', {
        filePath: region.filePath,
        error: formatError(error)
      })
    }
  }

  const finishMessage = buildFinishMessage(savedFiles.length, errors.length)

  invokeOptional(onProgress, {
    phase: 'save-finished',
    current: total,
    total,
    message: finishMessage
  })

  logger.criticalInfo('save', 'リージョン保存処理完了', {
    savedFileCount: savedFiles.length,
    errorCount: errors.length
  })

  return {
    success: errors.length === 0,
    savedFiles,
    errors
  }
}
