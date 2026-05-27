import { readFile } from 'fs/promises'
import { dialog, BrowserWindow } from 'electron'
import { AppSession } from '../AppSession'
import {
  ensureVanillaAssets,
  getAssetsStatus,
  loadWorldResourcePack,
  type AssetDownloadProgress
} from '../assets/ResourcePackManager'
import { resolveItemTexture } from '../assets/ItemTextureResolver'
import { registerLoggedIpcHandler } from '../logging/ipcLogging'
import { logger } from '../logging/AppLogger'
import type { SearchFilter, SaveProgress, SlotMove, SlotUpdate } from '../../shared/types'
import { formatError } from '../../shared/valueUtils'

const session = new AppSession()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requireWorldPath(value: unknown): string {
  // 空文字や非文字列のワールドパスは拒否する
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('ワールドパスが正しくありません。')
  }
  return value
}

function requireStringField(record: Record<string, unknown>, key: string, message: string): string {
  const value = record[key]
  // 文字列必須フィールドが欠けている場合は IPC を拒否する
  if (typeof value !== 'string' || value === '') {
    throw new Error(message)
  }
  return value
}

function requireIntegerField(record: Record<string, unknown>, key: string, message: string): number {
  const value = record[key]
  // 整数必須フィールドが欠けている場合は IPC を拒否する
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(message)
  }
  return value
}

function requireSlotUpdate(value: unknown): SlotUpdate {
  // オブジェクト形式でない更新リクエストは拒否する
  if (!isRecord(value)) {
    throw new Error('スロット更新リクエストが正しくありません。')
  }
  return {
    containerId: requireStringField(value, 'containerId', '更新対象コンテナ ID が正しくありません。'),
    slot: requireIntegerField(value, 'slot', '更新対象スロットが正しくありません。'),
    item: value.item as SlotUpdate['item']
  }
}

function requireSlotMove(value: unknown): SlotMove {
  // オブジェクト形式でない移動リクエストは拒否する
  if (!isRecord(value)) {
    throw new Error('スロット移動リクエストが正しくありません。')
  }
  return {
    containerId: requireStringField(value, 'containerId', '移動対象コンテナ ID が正しくありません。'),
    fromSlot: requireIntegerField(value, 'fromSlot', '移動元スロットが正しくありません。'),
    toSlot: requireIntegerField(value, 'toSlot', '移動先スロットが正しくありません。')
  }
}

/** 全ウィンドウへ assets 進捗イベントを配信する */
function broadcastAssetProgress(progress: AssetDownloadProgress): void {
  // 全ウィンドウへ assets 進捗イベントを配信する
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('assets:download-progress', progress)
  }
}

/** 全ウィンドウへ保存進捗イベントを配信し、ログにも記録する */
function broadcastSaveProgress(progress: SaveProgress): void {
  logger.criticalInfo('save', '保存進捗', {
    phase: progress.phase,
    current: progress.current,
    total: progress.total,
    message: progress.message
  })
  // 全ウィンドウへ保存進捗イベントを配信する
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('world:save-progress', progress)
  }
}

/**
 * main プロセスの IPC ハンドラを登録する。
 *
 * @remarks renderer からの `world:*` / `assets:*` 呼び出しを AppSession に委譲する。
 */
export function registerIpcHandlers(): void {
  registerLoggedIpcHandler('assets:ensure-ready', async () => {
    await ensureVanillaAssets(broadcastAssetProgress)
    return getAssetsStatus()
  })

  registerLoggedIpcHandler('assets:get-status', async () => {
    return getAssetsStatus()
  })

  registerLoggedIpcHandler('world:select', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    // キャンセルまたは未選択の場合は null を返す
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  registerLoggedIpcHandler('world:scan', async (_event, worldPath: unknown) => {
    const pathValue = requireWorldPath(worldPath)
    await ensureVanillaAssets(broadcastAssetProgress)
    await loadWorldResourcePack(pathValue, broadcastAssetProgress)

    return session.scan(pathValue, (progress) => {
      // 全ウィンドウへスキャン進捗イベントを配信する
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('world:scan-progress', progress)
      }
    })
  })

  registerLoggedIpcHandler('world:get-containers', (_event, filter?: unknown) => {
    return session.getContainers(filter as SearchFilter | undefined)
  })

  registerLoggedIpcHandler('world:update-slot', async (_event, update: unknown) => {
    return session.updateSlot(requireSlotUpdate(update))
  })

  registerLoggedIpcHandler('world:move-slot', async (_event, move: unknown) => {
    return session.moveSlot(requireSlotMove(move))
  })

  registerLoggedIpcHandler('world:save', async () => {
    logger.criticalInfo('save', 'world:save ハンドラ開始')
    try {
      const report = await session.saveChanges(broadcastSaveProgress)
      logger.criticalInfo('save', 'world:save ハンドラ完了', {
        success: report.success,
        savedFileCount: report.savedFiles.length,
        errorCount: report.errors.length,
        nothingToSave: report.nothingToSave === true
      })
      return report
    } catch (error) {
      logger.criticalError('save', 'world:save ハンドラ例外', { error: formatError(error) })
      return {
        success: false,
        savedFiles: [],
        errors: [formatError(error)]
      }
    }
  })

  registerLoggedIpcHandler('world:get-save-status', async () => {
    return session.getSaveStatus()
  })

  registerLoggedIpcHandler('world:discard-unsaved-changes', async () => {
    return session.discardUnsavedChanges()
  })

  registerLoggedIpcHandler('assets:resolve-texture', async (_event, itemId: unknown) => {
    // 空文字や非文字列のアイテム ID は拒否する
    if (typeof itemId !== 'string' || itemId === '') {
      throw new Error('アイテム ID が正しくありません。')
    }
    const itemIdValue = itemId
    await ensureVanillaAssets()
    const texturePath = await resolveItemTexture(itemIdValue)
    // テクスチャが見つからない場合は null を返す
    if (!texturePath) {
      return null
    }
    const pngBuffer = await readFile(texturePath)
    return `data:image/png;base64,${pngBuffer.toString('base64')}`
  })
}

/**
 * 起動時にバニラ assets の取得を開始する。
 */
export async function initializeAssets(): Promise<void> {
  await ensureVanillaAssets(broadcastAssetProgress)
}
