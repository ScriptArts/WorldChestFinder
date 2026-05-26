import { createHash } from 'crypto'
import { accessSync, renameSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import { invokeOptional } from '../../shared/valueUtils'
import { logger } from '../logging/AppLogger'

export interface AssetDownloadProgress {
  phase: string
  current: number
  total: number
  message: string
}

type ProgressCallback = (progress: AssetDownloadProgress) => void

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json'

let vanillaVersion: string | null = null
let worldPackRoot: string | null = null
let ensurePromise: Promise<void> | null = null

function cacheRoot(): string {
  return path.join(app.getPath('userData'), 'resource_packs')
}

function vanillaPackRoot(): string {
  return path.join(cacheRoot(), 'java', 'vanilla')
}

function worldPacksRoot(): string {
  return path.join(cacheRoot(), 'world_packs')
}

function reportProgress(
  onProgress: ProgressCallback | undefined,
  phase: string,
  current: number,
  total: number,
  message: string
): void {
  invokeOptional(onProgress, {
    phase,
    current,
    total,
    message
  })
}

function pathExists(target: string): boolean {
  try {
    accessSync(target)
    return true
  } catch {
    return false
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  return response.json() as Promise<T>
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function extractAssetsFromJar(jarBuffer: Buffer, destination: string): number {
  const zip = new AdmZip(jarBuffer)
  let extracted = 0

  for (const entry of zip.getEntries()) {
    // assets/ 配下のファイルのみ展開する
    if (!entry.entryName.startsWith('assets/') || entry.isDirectory) {
      continue
    }
    zip.extractEntryTo(entry, destination, true, true)
    extracted += 1
  }

  return extracted
}

async function downloadVanillaAssets(onProgress?: ProgressCallback): Promise<string> {
  reportProgress(onProgress, 'assets-manifest', 0, 100, 'Mojang バージョン情報を取得中...')

  const manifest = await fetchJson<{
    latest: { release: string }
    versions: Array<{ id: string; url: string }>
  }>(MANIFEST_URL)

  const releaseId = manifest.latest.release
  const versionEntry = manifest.versions.find((entry) => entry.id === releaseId)
  if (!versionEntry) {
    throw new Error(`Release version not found: ${releaseId}`)
  }

  const destination = vanillaPackRoot()
  const versionFile = path.join(destination, 'version')

  if (pathExists(versionFile)) {
    const cachedVersion = await readFile(versionFile, 'utf8')
    if (cachedVersion === releaseId && pathExists(path.join(destination, 'assets'))) {
      vanillaVersion = releaseId
      logger.info('assets', 'キャッシュ済みバニラ assets を使用', { releaseId })
      reportProgress(onProgress, 'assets-ready', 100, 100, `バニラ assets 使用 (${releaseId})`)
      return releaseId
    }
  }

  reportProgress(onProgress, 'assets-download', 20, 100, `client.jar ダウンロード中 (${releaseId})...`)

  const versionJson = await fetchJson<{ downloads: { client: { url: string } } }>(versionEntry.url)
  const jarBuffer = await downloadBuffer(versionJson.downloads.client.url)

  reportProgress(onProgress, 'assets-extract', 60, 100, 'assets を展開中...')

  const tempPath = path.join(path.dirname(destination), '_temp_vanilla')
  if (pathExists(tempPath)) {
    await rm(tempPath, { recursive: true, force: true })
  }
  await mkdir(tempPath, { recursive: true })

  const extracted = extractAssetsFromJar(jarBuffer, tempPath)
  if (extracted === 0) {
    logger.error('assets', 'client.jar から assets が見つからない')
    throw new Error('client.jar から assets が見つかりませんでした')
  }

  logger.info('assets', 'client.jar から assets を展開', { releaseId, extractedFileCount: extracted })

  if (pathExists(destination)) {
    await rm(destination, { recursive: true, force: true })
  }
  await mkdir(path.dirname(destination), { recursive: true })
  renameSync(tempPath, destination)
  await writeFile(versionFile, releaseId, 'utf8')

  vanillaVersion = releaseId
  reportProgress(onProgress, 'assets-ready', 100, 100, `バニラ assets 準備完了 (${releaseId})`)

  return releaseId
}

/**
 * バニラ client.jar から assets をダウンロード・展開する（キャッシュがあればスキップ）。
 *
 * @param onProgress - 進捗コールバック
 */
export async function ensureVanillaAssets(onProgress?: ProgressCallback): Promise<void> {
  if (ensurePromise) {
    logger.debug('assets', 'バニラ assets 取得は既に実行中')
    return ensurePromise
  }

  logger.info('assets', 'バニラ assets 取得を開始')
  ensurePromise = downloadVanillaAssets(onProgress)
    .then(() => undefined)
    .catch((error) => {
      ensurePromise = null
      logger.error('assets', 'バニラ assets 取得失敗', { error: String(error) })
      throw error
    })

  return ensurePromise
}

/**
 * ワールドの resources.zip を展開し、テクスチャ解決用パスに登録する。
 *
 * @param worldPath - ワールドディレクトリ
 * @param onProgress - 進捗コールバック
 * @returns resources.zip が存在した場合 true
 */
export async function loadWorldResourcePack(worldPath: string, onProgress?: ProgressCallback): Promise<boolean> {
  const resourcesZip = path.join(worldPath, 'resources.zip')
  if (!pathExists(resourcesZip)) {
    worldPackRoot = null
    logger.debug('assets', 'ワールド resource pack なし', { worldPath })
    return false
  }

  const worldKey = createHash('sha1').update(worldPath).digest('hex').slice(0, 16)
  const destination = path.join(worldPacksRoot(), worldKey)

  reportProgress(onProgress, 'world-pack', 0, 100, 'ワールド resources.zip を展開中...')

  const zip = new AdmZip(await readFile(resourcesZip))
  if (pathExists(destination)) {
    await rm(destination, { recursive: true, force: true })
  }
  await mkdir(destination, { recursive: true })
  zip.extractAllTo(destination, true)

  worldPackRoot = destination
  logger.info('assets', 'ワールド resource pack を読み込み', { worldPath, destination })
  reportProgress(onProgress, 'world-pack', 100, 100, 'ワールド resource pack を読み込みました')

  return true
}

/**
 * テクスチャ解決に使うリソースパックルート一覧（ワールド pack が後勝ち）。
 */
export function getAssetPackRoots(): string[] {
  const roots: string[] = []
  const vanilla = vanillaPackRoot()
  if (pathExists(vanilla)) {
    roots.push(vanilla)
  }
  if (worldPackRoot && pathExists(worldPackRoot)) {
    roots.push(worldPackRoot)
  }
  return roots
}

/**
 * バニラ / ワールド pack の準備状態を返す。
 */
export function getAssetsStatus(): {
  ready: boolean
  vanillaVersion: string | null
  worldPackLoaded: boolean
} {
  return {
    ready: pathExists(vanillaPackRoot()),
    vanillaVersion,
    worldPackLoaded: worldPackRoot !== null && pathExists(worldPackRoot)
  }
}
