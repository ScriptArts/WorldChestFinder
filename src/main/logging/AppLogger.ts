import { appendFile, mkdir, readdir, unlink } from 'fs/promises'
import { appendFileSync, mkdirSync } from 'fs'
import path from 'path'
import { app } from 'electron'
import { formatError } from '../../shared/valueUtils'

/** ログファイルの保持日数 */
export const LOG_RETENTION_DAYS = 7

/** 日次ログファイル名のプレフィックス */
export const LOG_FILE_PREFIX = 'world-chest-finder-'

/** ログレベル */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** ログの出力カテゴリ */
export type LogCategory = 'app' | 'ipc' | 'session' | 'scan' | 'save' | 'region' | 'assets'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
}

const MAX_DETAIL_STRING_LENGTH = 500

let logsDirectory: string | null = null
let minimumLevel: LogLevel = 'info'
let runtimeIsPackaged = false
let writeQueue: Promise<void> = Promise.resolve()
let activeLogDateKey = ''
let activeLogFilePath = ''

/**
 * ログ出力先ディレクトリを決定する。
 *
 * @param isPackaged - パッケージ済みビルドか
 * @param userDataPath - Electron userData パス
 * @param appPath - Electron ソフトウェアパス（開発時はプロジェクトルート）
 */
export function resolveLogsDirectory(isPackaged: boolean, userDataPath: string, appPath: string): string {
  // 開発時はプロジェクト配下の logs ディレクトリを使う
  if (!isPackaged) {
    return path.join(appPath, 'logs')
  }
  return path.join(userDataPath, 'logs')
}

/**
 * 日付に対応するログファイル名を生成する。
 *
 * @param date - 対象日
 */
export function buildLogFileName(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${LOG_FILE_PREFIX}${year}-${month}-${day}.log`
}

/**
 * ログファイル名から日付を復元する。
 *
 * @param fileName - ファイル名
 * @returns 解析できた場合は Date、それ以外は null
 */
export function parseLogFileDate(fileName: string): Date | null {
  const match = fileName.match(/^world-chest-finder-(\d{4})-(\d{2})-(\d{2})\.log$/)
  // ファイル名形式が一致しない場合は解析できない
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  // 日付が不正な場合は解析失敗とする
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null
  }
  return parsed
}

/**
 * ログファイルが保持期限を過ぎているか判定する。
 *
 * @param fileName - ファイル名
 * @param now - 基準日時
 * @param retentionDays - 保持日数
 */
export function isLogFileExpired(fileName: string, now: Date, retentionDays: number): boolean {
  const fileDate = parseLogFileDate(fileName)
  // 日付を復元できないファイルは期限判定対象外とする
  if (fileDate === null) {
    return false
  }
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  cutoff.setDate(cutoff.getDate() - retentionDays)
  return fileDate < cutoff
}

function padLevel(level: LogLevel): string {
  return level.toUpperCase().padEnd(5, ' ')
}

function padCategory(category: LogCategory): string {
  return category.padEnd(7, ' ')
}

function formatTimestamp(date: Date): string {
  return date.toISOString()
}

function truncateString(value: string): string {
  // 最大長以内ならそのまま返す
  if (value.length <= MAX_DETAIL_STRING_LENGTH) {
    return value
  }
  return `${value.slice(0, MAX_DETAIL_STRING_LENGTH)}...(truncated)`
}

function sanitizeDetailValue(value: unknown): unknown {
  // null / undefined はそのまま返す
  if (value === null || value === undefined) {
    return value
  }
  // 文字列は長さ制限をかけて返す
  if (typeof value === 'string') {
    return truncateString(value)
  }
  // 数値・真偽値はそのまま返す
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  // Error オブジェクトは文字列化する
  if (value instanceof Error) {
    return formatError(value)
  }
  // 配列は各要素を再帰的にサニタイズする
  if (Array.isArray(value)) {
    const sanitized: unknown[] = []
    // 配列の各要素を再帰的にサニタイズする
    for (const entry of value) {
      sanitized.push(sanitizeDetailValue(entry))
    }
    return sanitized
  }
  // オブジェクトは各プロパティを再帰的にサニタイズする
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sanitized: Record<string, unknown> = {}
    // オブジェクトの各プロパティを再帰的にサニタイズする
    for (const [key, entry] of Object.entries(record)) {
      sanitized[key] = sanitizeDetailValue(entry)
    }
    return sanitized
  }
  return String(value)
}

/**
 * 1 行分のログ文字列を組み立てる。
 *
 * @param level - ログレベル
 * @param category - カテゴリ
 * @param message - メッセージ
 * @param details - 付加情報
 * @param timestamp - タイムスタンプ
 */
export function formatLogLine(
  level: LogLevel,
  category: LogCategory,
  message: string,
  details: Record<string, unknown> | undefined,
  timestamp: Date
): string {
  let line = `${formatTimestamp(timestamp)} [${padLevel(level)}] [${padCategory(category)}] ${message}`
  // 付加情報がある場合は JSON として追記する
  if (details !== undefined) {
    try {
      const sanitized = sanitizeDetailValue(details) as Record<string, unknown>
      line = `${line} ${JSON.stringify(sanitized)}`
    } catch {
      line = `${line} [details serialization failed]`
    }
  }
  return line
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minimumLevel]
}

function mirrorToConsole(level: LogLevel, line: string): void {
  // ERROR は stderr へ出力する
  if (level === 'error') {
    console.error(line)
    return
  }
  // WARN は console.warn へ出力する
  if (level === 'warn') {
    console.warn(line)
    return
  }
  // 開発時のみ INFO/DEBUG を console.log へ出力する
  if (!runtimeIsPackaged) {
    console.log(line)
  }
}

function ensureLogsDirectoryReady(): void {
  // 既に初期化済みなら何もしない
  if (logsDirectory !== null) {
    return
  }
  try {
    // Electron 未初期化環境では初期化をスキップする
    if (typeof app.getPath !== 'function') {
      return
    }
    runtimeIsPackaged = app.isPackaged
    logsDirectory = resolveLogsDirectory(runtimeIsPackaged, app.getPath('userData'), app.getAppPath())
    mkdirSync(logsDirectory, { recursive: true })
  } catch {
    // テスト環境など Electron 未初期化時はファイル出力をスキップする
  }
}

function resolveLogFilePath(now: Date): string {
  const dateKey = buildLogFileName(now).replace('.log', '')
  // 同日のログファイルパスがキャッシュ済みなら再利用する
  if (activeLogDateKey === dateKey && activeLogFilePath !== '') {
    return activeLogFilePath
  }
  // ロガー未初期化時はパス解決できない
  if (logsDirectory === null) {
    throw new Error('Logger is not initialized')
  }
  activeLogDateKey = dateKey
  activeLogFilePath = path.join(logsDirectory, buildLogFileName(now))
  return activeLogFilePath
}

function enqueueWrite(line: string): void {
  ensureLogsDirectoryReady()
  // ログディレクトリ未準備時はファイル出力をスキップする
  if (logsDirectory === null) {
    return
  }
  const filePath = resolveLogFilePath(new Date())
  writeQueue = writeQueue.then(async () => {
    await appendFile(filePath, `${line}\n`, 'utf8')
  }).catch((error) => {
    console.error(`Failed to write log file: ${formatError(error)}`)
  })
}

/**
 * キューに溜まったログをすべてディスクへ書き出す。
 */
export async function flushLogs(): Promise<void> {
  await writeQueue
}

/**
 * 保存など重要処理向けに、即座にディスクへ追記する。
 *
 * @param level - ログレベル
 * @param category - カテゴリ
 * @param message - メッセージ
 * @param details - 付加情報
 */
export function writeCriticalLog(
  level: LogLevel,
  category: LogCategory,
  message: string,
  details?: Record<string, unknown>
): void {
  // 最小ログレベル未満の出力はスキップする
  if (!shouldLog(level)) {
    return
  }
  const line = formatLogLine(level, category, message, details, new Date())
  mirrorToConsole(level, line)
  ensureLogsDirectoryReady()
  // ログディレクトリ未準備時はファイル出力をスキップする
  if (logsDirectory === null) {
    return
  }
  try {
    const filePath = resolveLogFilePath(new Date())
    appendFileSync(filePath, `${line}\n`, 'utf8')
  } catch (error) {
    console.error(`Failed to write critical log: ${formatError(error)}`)
  }
}

function writeLog(level: LogLevel, category: LogCategory, message: string, details?: Record<string, unknown>): void {
  // 最小ログレベル未満の出力はスキップする
  if (!shouldLog(level)) {
    return
  }
  const line = formatLogLine(level, category, message, details, new Date())
  mirrorToConsole(level, line)
  enqueueWrite(line)
}

/**
 * 保持期限を過ぎたログファイルを削除する。
 */
export async function purgeOldLogs(): Promise<number> {
  // ロガー未初期化時は削除対象なし
  if (logsDirectory === null) {
    return 0
  }

  let entries: string[]
  try {
    entries = await readdir(logsDirectory)
  } catch {
    return 0
  }

  const now = new Date()
  let removedCount = 0
  // 期限切れの日次ログファイルを削除する
  for (const entry of entries) {
    // ログファイル以外はスキップする
    if (!entry.startsWith(LOG_FILE_PREFIX) || !entry.endsWith('.log')) {
      continue
    }
    // 保持期限内のファイルはスキップする
    if (!isLogFileExpired(entry, now, LOG_RETENTION_DAYS)) {
      continue
    }
    try {
      await unlink(path.join(logsDirectory, entry))
      removedCount += 1
    } catch {
      // 削除失敗は次回起動時に再試行する
    }
  }
  return removedCount
}

/**
 * ファイルロガーを初期化する。
 *
 * @returns ログ出力ディレクトリ
 */
export async function initLogger(): Promise<string> {
  runtimeIsPackaged = app.isPackaged
  // 開発時は DEBUG、本番は INFO を最小レベルとする
  if (!runtimeIsPackaged) {
    minimumLevel = 'debug'
  // 本番ビルドでは INFO 以上のみ出力する
  } else {
    minimumLevel = 'info'
  }

  logsDirectory = resolveLogsDirectory(runtimeIsPackaged, app.getPath('userData'), app.getAppPath())
  await mkdir(logsDirectory, { recursive: true })

  const removedCount = await purgeOldLogs()
  writeLog('info', 'app', 'ロガーを初期化しました', {
    logsDirectory,
    retentionDays: LOG_RETENTION_DAYS,
    minimumLevel,
    removedOldLogs: removedCount
  })

  return logsDirectory
}

/**
 * ログ出力ディレクトリを返す。
 */
export function getLogsDirectory(): string {
  // ロガー未初期化時はエラーを投げる
  if (logsDirectory === null) {
    throw new Error('Logger is not initialized')
  }
  return logsDirectory
}

/**
 * 未処理例外・未処理 Promise 拒否をログへ記録する。
 */
export function installProcessErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    writeLog('error', 'app', '未処理例外', { error: formatError(error) })
  })

  process.on('unhandledRejection', (reason) => {
    writeLog('error', 'app', '未処理 Promise 拒否', { reason: formatError(reason) })
  })
}

/** ソフトウェア共通ロガー */
export const logger = {
  /**
   * DEBUG レベルのログを出力する。
   */
  debug(category: LogCategory, message: string, details?: Record<string, unknown>): void {
    writeLog('debug', category, message, details)
  },

  /**
   * INFO レベルのログを出力する。
   */
  info(category: LogCategory, message: string, details?: Record<string, unknown>): void {
    writeLog('info', category, message, details)
  },

  /**
   * WARN レベルのログを出力する。
   */
  warn(category: LogCategory, message: string, details?: Record<string, unknown>): void {
    writeLog('warn', category, message, details)
  },

  /**
   * ERROR レベルのログを出力する。
   */
  error(category: LogCategory, message: string, details?: Record<string, unknown>): void {
    writeLog('error', category, message, details)
  },

  /**
   * INFO を書き込み、キューをフラッシュする（保存処理の節目向け）。
   */
  async infoAndFlush(category: LogCategory, message: string, details?: Record<string, unknown>): Promise<void> {
    writeLog('info', category, message, details)
    await flushLogs()
  },

  /**
   * 保存処理向けの即時ディスク書き込み INFO。
   */
  criticalInfo(category: LogCategory, message: string, details?: Record<string, unknown>): void {
    writeCriticalLog('info', category, message, details)
  },

  /**
   * 保存処理向けの即時ディスク書き込み ERROR。
   */
  criticalError(category: LogCategory, message: string, details?: Record<string, unknown>): void {
    writeCriticalLog('error', category, message, details)
  }
}
