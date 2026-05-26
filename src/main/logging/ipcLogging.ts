import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ScanResult } from '../../shared/types'
import { formatError } from '../../shared/valueUtils'
import { flushLogs, logger } from './AppLogger'

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown | Promise<unknown>

/**
 * IPC 呼び出し引数をログ用に要約する。
 *
 * @param channel - IPC チャンネル名
 * @param args - 引数配列
 */
function summarizeIpcArgs(channel: string, args: unknown[]): Record<string, unknown> {
  if (channel === 'assets:resolve-texture' && args.length > 0) {
    return { itemId: args[0] }
  }
  if (channel === 'world:scan' && args.length > 0) {
    return { worldPath: args[0] }
  }
  if (channel === 'world:get-containers') {
    return { filter: args[0] }
  }
  if (channel === 'world:update-slot' && args.length > 0) {
    return { update: args[0] }
  }
  if (channel === 'world:move-slot' && args.length > 0) {
    return { move: args[0] }
  }
  return { args }
}

/**
 * IPC 戻り値をログ用に要約する（巨大データの省略）。
 *
 * @param channel - IPC チャンネル名
 * @param result - ハンドラ戻り値
 */
function summarizeIpcResult(channel: string, result: unknown): Record<string, unknown> | undefined {
  if (channel === 'assets:resolve-texture') {
    if (result === null) {
      return { texture: 'not-found' }
    }
    return { texture: 'resolved' }
  }
  if (channel === 'world:select') {
    return { worldPath: result }
  }
  if (channel === 'world:get-containers' && Array.isArray(result)) {
    return { containerCount: result.length }
  }
  if (channel === 'world:scan' && typeof result === 'object' && result !== null) {
    const scanResult = result as ScanResult
    return {
      containerCount: scanResult.containers.length,
      errorCount: scanResult.errors.length,
      worldPath: scanResult.worldPath
    }
  }
  if (channel === 'world:save' && typeof result === 'object' && result !== null) {
    const saveReport = result as { success: boolean; savedFiles: string[]; errors: string[]; nothingToSave?: boolean }
    return {
      success: saveReport.success,
      savedFileCount: saveReport.savedFiles.length,
      errorCount: saveReport.errors.length,
      nothingToSave: saveReport.nothingToSave === true
    }
  }
  if (channel === 'world:get-save-status' && typeof result === 'object' && result !== null) {
    return { status: result }
  }
  if (channel === 'assets:get-status' || channel === 'assets:ensure-ready') {
    return { status: result }
  }
  return undefined
}

/**
 * IPC ハンドラを登録し、呼び出し・成功・失敗・所要時間をログする。
 *
 * @param channel - IPC チャンネル名
 * @param handler - 実処理
 */
export function registerLoggedIpcHandler(channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const startedAt = Date.now()
    logger.info('ipc', `${channel} 呼び出し`, summarizeIpcArgs(channel, args))
    if (channel === 'world:save') {
      await flushLogs()
    }

    try {
      const result = await handler(event, ...args)
      const durationMs = Date.now() - startedAt
      const summary = summarizeIpcResult(channel, result)
      if (channel === 'assets:resolve-texture') {
        logger.debug('ipc', `${channel} 成功`, { durationMs, ...summary })
      } else {
        logger.info('ipc', `${channel} 成功`, { durationMs, ...summary })
      }
      return result
    } catch (error) {
      const durationMs = Date.now() - startedAt
      logger.error('ipc', `${channel} 失敗`, { durationMs, error: formatError(error) })
      throw error
    }
  })
}
